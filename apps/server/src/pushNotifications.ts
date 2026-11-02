/**
 * Необязательная инфраструктура Web Push; подписки и отправка отделены от цикла управления нагревом.
 */
import './config.js';
import { ovenModelName } from '@mercury/shared';
import { detectedBoardType } from './controller/boardIdentity.js';
import { checkAccessPin } from './operatorPin.js';
import { Router, type Request } from 'express';
import { createHash, ECDH } from 'node:crypto';
import webpush from 'web-push';
import {
  readWebPushConfiguration,
  saveWebPushConfiguration,
  readOvenIdentity,
  readOvenSelection,
} from './ovenSettings.js';
import type { OvenEvent, OvenEventKind } from './ovenEvents.js';
export const pushKinds: OvenEventKind[] = [
  'started',
  'cycleCompleted',
  'completed',
  'stopped',
  'error',
  'connectionLost',
];
export type Subscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
type Subscriber = { subscription: Subscription; events: OvenEventKind[] };
type PushConfiguration = {
  keys: { publicKey: string; privateKey: string };
  subscribers: Subscriber[];
};
/**
 * Проверяет формат браузерной подписки и допустимость её адреса перед сохранением.
 */
export function validateSubscription(value: unknown): Subscription {
  if (!value || typeof value !== 'object')
    throw Error('Не указана подписка телефона.');
  const s = value as Subscription;
  if (typeof s.endpoint !== 'string' || s.endpoint.length > 2048)
    throw Error('Некорректный адрес push-службы.');
  const u = new URL(s.endpoint);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== '443') ||
    !(
      [
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com',
        'push.services.mozilla.com',
      ].includes(u.hostname) ||
      /^[a-z0-9-]+\.push\.apple\.com$/.test(u.hostname)
    )
  )
    throw Error('Неподдерживаемая push-служба браузера.');
  /** Проверяет кодирование и размер отдельного ключа браузерной push-подписки. */
  const key = (v: unknown, length: number) => {
    if (
      typeof v !== 'string' ||
      !/^[\w-]+$/.test(v) ||
      Buffer.from(v, 'base64url').length !== length
    )
      throw Error('Некорректный ключ подписки.');
    return v;
  };
  const p256dh = key(s.keys?.p256dh, 65),
    auth = key(s.keys?.auth, 16);
  ECDH.convertKey(Buffer.from(p256dh, 'base64url'), 'prime256v1');
  return { endpoint: u.href, keys: { p256dh, auth } };
}
/**
 * Отбрасывает неподдерживаемые имена событий подписки.
 */
export function validatePushEvents(values: unknown): OvenEventKind[] {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.some((v) => !pushKinds.includes(v))
  )
    throw Error('Выберите события уведомлений.');
  return [...new Set(values)] as OvenEventKind[];
}
/**
 * Проверяет идентификатор владельца подписки без предоставления ему прав управления.
 */
function identity(s: Subscription) {
  return createHash('sha256').update(JSON.stringify(s)).digest('hex');
}
/**
 * Читает серверную конфигурацию Web Push; отсутствие ключей оставляет функцию выключенной.
 */
export function pushEnvironment(env = process.env) {
  let origin = '';
  try {
    const url = new URL(env.MERCURY_PUBLIC_URL ?? '');
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    )
      origin = url.origin;
  } catch {}
  const subject = env.MERCURY_PUSH_SUBJECT ?? '';
  const validSubject =
    /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject) ||
    /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(subject);
  return {
    origin,
    subject,
    enabled: Boolean(origin && validSubject),
    reason: !origin
      ? 'Не настроен HTTPS-адрес печи.'
      : !validSubject
        ? 'Не настроен контакт для Web Push.'
        : '',
  };
}
export class PushNotifications {
  private queue: { event: OvenEvent; subscribers: Subscriber[] }[] = [];
  private draining = false;
  private writes: Promise<unknown> = Promise.resolve();
  private recent = new Set<string>();
  /**
   * Создаёт экземпляр с явно переданными зависимостями и начальным состоянием.
   */
  constructor(
    private environment = pushEnvironment(),
    private read = readWebPushConfiguration,
    private save = saveWebPushConfiguration,
    private send = webpush.sendNotification,
    private ovenName = () =>
      readOvenIdentity().name ||
      ovenModelName(readOvenSelection()?.ovenModel ?? '', detectedBoardType()),
  ) {}
  /** Читает текущие параметры доставки и подписок из конфигурации печи. */
  private config(): PushConfiguration | null {
    const c = this.read() as PushConfiguration | null;
    return c?.keys?.publicKey &&
      c?.keys?.privateKey &&
      Array.isArray(c.subscribers)
      ? c
      : null;
  }
  /** Последовательно сохраняет изменения подписок, исключая потерю соседнего обновления. */
  private change<T>(work: () => Promise<T>): Promise<T> {
    const job = this.writes.then(work);
    this.writes = job.catch(() => {});
    return job;
  }
  /**
   * Формирует состояние операции для интерфейса; само чтение не запускает процесс.
   */
  async status() {
    if (!this.environment.enabled)
      return {
        enabled: false,
        reason: this.environment.reason,
        events: pushKinds,
      };
    await this.change(async () => {
      if (!this.config())
        await this.save({ keys: webpush.generateVAPIDKeys(), subscribers: [] });
    });
    return {
      enabled: true,
      publicKey: this.config()!.keys.publicKey,
      events: pushKinds,
    };
  }
  /** Находит подписку конкретного клиентского идентификатора. */
  async subscription(value: unknown) {
    const sub = validateSubscription(value);
    await this.writes;
    const found = this.config()?.subscribers.find(
      (v) => identity(v.subscription) === identity(sub),
    );
    return { subscribed: Boolean(found), events: found?.events ?? [] };
  }
  /**
   * Сохраняет проверенную подписку текущего клиента.
   */
  async subscribe(value: unknown, events: unknown) {
    const sub = validateSubscription(value),
      selected = validatePushEvents(events);
    await this.status();
    return this.change(async () => {
      const c = this.config();
      if (!this.environment.enabled || !c)
        throw Error('Web Push пока не настроен.');
      const rows = c.subscribers.filter(
        (v) => identity(v.subscription) !== identity(sub),
      );
      if (rows.length >= 32) throw Error('Достигнут предел 32 телефонов.');
      await this.save({
        ...c,
        subscribers: [...rows, { subscription: sub, events: selected }],
      });
      return { subscribed: true, events: selected };
    });
  }
  /**
   * Удаляет подписку текущего клиента и прекращает её последующие доставки.
   */
  async unsubscribe(value: unknown) {
    const sub = validateSubscription(value);
    return this.change(async () => {
      const c = this.config();
      if (c)
        await this.save({
          ...c,
          subscribers: c.subscribers.filter(
            (v) => identity(v.subscription) !== identity(sub),
          ),
        });
      return { subscribed: false };
    });
  }
  /**
   * Ставит уведомление в очередь доставки, не задерживая цикл управления печью.
   */
  notify(event: OvenEvent) {
    if (
      !this.environment.enabled ||
      this.recent.has(event.id) ||
      this.queue.length >= 64
    )
      return;
    try {
      const c = this.config();
      if (!c) return;
      this.recent.add(event.id);
      if (this.recent.size > 256)
        this.recent.delete(this.recent.values().next().value!);
      const subscribers = c.subscribers.filter((v) =>
        v.events.includes(event.kind),
      );
      if (!subscribers.length) return;
      this.queue.push({ event, subscribers });
      void this.drain().catch(() => {
        this.queue = [];
      });
    } catch {
      /* Optional notification configuration is isolated. */
    }
  }
  /**
   * Последовательно обрабатывает очередь уведомлений, изолируя ошибки доставки.
   */
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!;
        if (Date.now() - Date.parse(job.event.at) > 300000) continue;
        const labels: Record<OvenEventKind, string> = {
          started: 'Профиль запущен',
          cycleCompleted: 'Цикл завершён',
          completed: 'Профиль завершён',
          stopped: 'Профиль остановлен',
          error: 'Ошибка печи',
          connectionLost: 'Нет связи с платой',
        };
        const event = job.event;
        const payload = JSON.stringify({
          title: `${this.ovenName()} — ${labels[event.kind]}`.slice(0, 160),
          body: [
            event.profileName,
            event.cycle ? `Цикл ${event.cycle}` : '',
            event.matched === undefined
              ? ''
              : event.matched
                ? 'В допуске'
                : 'Есть отклонения',
            event.message,
          ]
            .filter(Boolean)
            .join(' · ')
            .slice(0, 500),
          tag: `mercury-${event.kind}`,
          url: '/',
          at: event.at,
        });
        for (let i = 0; i < job.subscribers.length; i += 4)
          await Promise.allSettled(
            job.subscribers.slice(i, i + 4).map(async (row) => {
              // A queued notification must respect a later unsubscribe/preferences change.
              const current = this.config();
              if (
                !current?.subscribers.some(
                  (v) =>
                    identity(v.subscription) === identity(row.subscription) &&
                    v.events.includes(event.kind),
                )
              )
                return;
              try {
                await this.send(row.subscription, payload, {
                  vapidDetails: {
                    subject: this.environment.subject,
                    ...current.keys,
                  },
                  TTL: 300,
                  timeout: 5000,
                  urgency: event.kind === 'error' ? 'high' : 'normal',
                });
              } catch (e) {
                if (
                  [404, 410].includes(
                    Number((e as { statusCode?: number }).statusCode),
                  )
                )
                  await this.unsubscribe(row.subscription);
              }
            }),
          );
      }
    } finally {
      this.draining = false;
    }
  }
  /**
   * Ожидает завершения уже начатой фоновой работы при закрытии службы.
   */
  async settled() {
    while (this.draining || this.queue.length)
      await new Promise((r) => setTimeout(r, 5));
    await this.writes;
  }
  /** Регистрирует состояние и управление подписками, отдельно от регулирования печи. */
  createRouter() {
    const router = Router();
    router.get('/api/push/status', async (_req, res) => {
      try {
        res.set('Cache-Control', 'no-store').json(await this.status());
      } catch {
        res.status(503).json({ error: 'Настройки уведомлений недоступны.' });
      }
    });
    /** Требует доступ текущего клиента для изменения его push-подписки. */
    const secured = (req: Request) => {
      if (
        !this.environment.enabled ||
        !req.secure ||
        req.get('origin') !== this.environment.origin
      )
        throw Error(
          'Подписка доступна только через настроенный HTTPS-адрес печи.',
        );
    };
    for (const action of ['state', 'subscribe', 'unsubscribe', 'test'])
      router.post('/api/push/' + action, async (req, res) => {
        try {
          secured(req);
          if (action === 'state') {
            res.json(await this.subscription(req.body?.subscription));
            return;
          }
          if (!(await checkAccessPin(req.body?.pin))) {
            res.status(401).json({ error: 'Неверный PIN-код уведомлений.' });
            return;
          }
          if (action === 'subscribe')
            res.json(
              await this.subscribe(req.body.subscription, req.body.events),
            );
          else if (action === 'unsubscribe')
            res.json(await this.unsubscribe(req.body.subscription));
          else {
            const sub = validateSubscription(req.body.subscription);
            const c = this.config();
            if (
              !c?.subscribers.some(
                (v) => identity(v.subscription) === identity(sub),
              )
            )
              throw Error('Телефон не подписан.');
            await this.send(
              sub,
              JSON.stringify({
                title: this.ovenName(),
                body: 'Проверка уведомлений Меркурий',
                url: '/',
                tag: 'mercury-test',
              }),
              {
                vapidDetails: { subject: this.environment.subject, ...c.keys },
                TTL: 60,
                timeout: 5000,
              },
            );
            res.json({ success: true });
          }
        } catch (e) {
          res.status(400).json({
            error: e instanceof Error ? e.message : 'Ошибка уведомлений',
          });
        }
      });
    return router;
  }
}
export const pushNotifications = new PushNotifications();
