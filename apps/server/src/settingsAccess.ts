/**
 * Изолированные права каждого клиента. Разблокировка одного экрана не открывает другие браузеры или панель печи.
 */
import { readCombinedRoles } from './ovenSettings.js';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { checkAccessPin, advancedPin, saveOperatorPin } from './operatorPin.js';
import { pinRecovery } from './pinRecovery.js';

/**
 * Определяет доверенный локальный интерфейс для действий, недоступных удалённому браузеру.
 */
export function isLocalPanel(userAgent: string, address: string | undefined) {
  return (
    /\bElectron\//i.test(userAgent) &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '')
  );
}

/**
 * Классифицирует маршруты настроек, которым требуется открытый доступ текущего клиента.
 */
export function protectedSettingsRequest(
  method: string,
  path: string,
): boolean {
  path = path.toLowerCase().replace(/\/+$/, '');
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')
    return false;
  return (
    (path.startsWith('/api/settings/') && path !== '/api/settings/keep-heat') ||
    path === '/api/config' ||
    path === '/api/controller/test-element' ||
    path === '/api/controller/auxiliary-cooling/test' ||
    path === '/api/controller/convection' ||
    path.startsWith('/api/software-update/')
  );
}

/**
 * Выделяет изменения библиотеки профилей для проверки разделения роли оператора и инженера.
 */
export function profileMutationRequest(method: string, path: string): boolean {
  path = path.toLowerCase().replace(/\/+$/, '');
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if (method === 'PUT' && path === '/api/profiles/selected') return false;
  return path === '/api/profiles' || path.startsWith('/api/profiles/');
}

/** Appliance access lasts for this server process, never persisted on disk. */
export function createSettingsAccessRouter(
  combinedRoles = readCombinedRoles,
  currentRunId: () => string | null = () => null,
) {
  const router = Router();
  const bootId = randomUUID();
  const sessions = new Map<
    string,
    { unlocked: boolean; advancedUnlocked: boolean }
  >();
  /**
   * Извлекает идентификатор текущего клиента без использования глобальной разблокировки.
   */
  const client = (request: import('express').Request) => {
    const id = request.get('X-Mercury-Client') ?? '';
    return /^[a-f0-9]{64}$/.test(id) ? id : '';
  };
  /**
   * Возвращает права только текущего клиента; отсутствующий идентификатор не наследует чужую сессию.
   */
  const access = (request: import('express').Request) =>
    sessions.get(client(request)) ?? {
      unlocked: false,
      advancedUnlocked: false,
    };
  /**
   * Формирует состояние операции для интерфейса; само чтение не запускает процесс.
   */
  const status = (request: import('express').Request) => {
    const { unlocked, advancedUnlocked } = access(request);
    const combineOperatorEngineerRoles = combinedRoles();
    return {
      unlocked,
      advancedUnlocked,
      bootId,
      combineOperatorEngineerRoles,
      canEditProfiles: unlocked || combineOperatorEngineerRoles,
    };
  };
  router.use('/api/settings-access/recovery', (request, response, next) => {
    if (
      !client(request) ||
      !isLocalPanel(
        request.get('user-agent') ?? '',
        request.ip ?? request.socket.remoteAddress,
      )
    ) {
      response
        .status(403)
        .json({ error: 'Восстановление PIN доступно только на экране печи.' });
      return;
    }
    next();
  });
  router.get('/api/settings-access/recovery', (request, response) =>
    response
      .set('Cache-Control', 'no-store')
      .json(pinRecovery.status(client(request))),
  );
  router.post('/api/settings-access/recovery/arm', (request, response) => {
    pinRecovery.arm(client(request), request.body?.open === true);
    response.json({ success: true });
  });
  router.post(
    '/api/settings-access/recovery/reset',
    async (request, response) => {
      if (!pinRecovery.claim(client(request), request.body?.code)) {
        response
          .status(409)
          .json({ error: 'Сброс недоступен или время ввода истекло.' });
        return;
      }
      try {
        await saveOperatorPin('3457');
        sessions.clear();
        const { playBoardRecoverySound } =
          await import('./controller/checkControllerConnection.js');
        await playBoardRecoverySound();
        response.json({ success: true });
      } catch (e) {
        response.status(500).json({
          error: e instanceof Error ? e.message : 'Сброс не выполнен.',
        });
      } finally {
        pinRecovery.complete();
      }
    },
  );
  router.get('/api/settings-access', (request, response) => {
    response.set('Cache-Control', 'no-store').json(status(request));
  });
  router.post('/api/settings-access/unlock', async (request, response) => {
    if (!(await checkAccessPin(request.body?.pin))) {
      response.status(401).json({ error: 'Неверный PIN-код' });
      return;
    }
    const id = client(request);
    if (!id) {
      response
        .status(400)
        .json({ error: 'Обновите приложение для отдельного доступа.' });
      return;
    }
    if (sessions.size >= 4096) sessions.delete(sessions.keys().next().value!);
    sessions.set(id, {
      unlocked: true,
      advancedUnlocked: request.body.pin === advancedPin,
    });
    response.json(status(request));
  });
  router.post('/api/settings-access/lock', (request, response) => {
    sessions.delete(client(request));
    response.json(status(request));
  });
  router.post('/api/settings-access/change-pin', async (request, response) => {
    if (!access(request).unlocked) {
      response.status(423).json({ error: 'Введите PIN-код настроек.' });
      return;
    }
    if (!(await checkAccessPin(request.body?.currentPin))) {
      response.status(401).json({ error: 'Неверный текущий PIN-код.' });
      return;
    }
    try {
      await saveOperatorPin(request.body?.newPin);
      sessions.clear();
      response.json({ success: true });
    } catch (e) {
      response.status(400).json({
        error: e instanceof Error ? e.message : 'Не удалось изменить PIN.',
      });
    }
  });
  router.use(async (request, response, next) => {
    const { unlocked, advancedUnlocked } = access(request);
    const path = request.path.toLowerCase().replace(/\/+$/, '');
    const electron = isLocalPanel(
      request.get('user-agent') ?? '',
      request.ip ?? request.socket.remoteAddress,
    );
    if (!electron && path.startsWith('/api/settings/calibration')) {
      response
        .status(403)
        .json({ error: 'Калибровка доступна только на экране печи.' });
      return;
    }
    if (
      !electron &&
      request.method === 'POST' &&
      path === '/api/run/start' &&
      !(await checkAccessPin(request.body?.pin))
    ) {
      response
        .status(423)
        .json({ error: 'Для запуска профиля введите верный PIN-код.' });
      return;
    }
    if (
      !electron &&
      path.startsWith('/api/wifi/') &&
      path !== '/api/wifi/status'
    ) {
      response
        .status(403)
        .json({ error: 'Настройки сети доступны только на экране печи.' });
      return;
    }
    // The operator must see the current process, even while archive access is locked.
    if (
      !unlocked &&
      (path === '/api/settings/element-runtime' ||
        path.startsWith('/api/settings/calibration'))
    ) {
      response
        .status(423)
        .json({ error: 'Этот раздел доступен после ввода PIN-кода настроек.' });
      return;
    }
    const runId = currentRunId();
    const currentChart =
      ['GET', 'HEAD'].includes(request.method) &&
      runId !== null &&
      path === '/api/history/' + encodeURIComponent(runId).toLowerCase();
    const advancedRequest =
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      (path === '/api/config' ||
        path === '/api/settings/element-runtime/reset' ||
        (path === '/api/settings/oven-identity' &&
          Object.prototype.hasOwnProperty.call(request.body ?? {}, 'name')));
    if (!advancedUnlocked && advancedRequest) {
      response
        .status(423)
        .json({ error: 'Требуется расширенный доступ к настройкам.' });
      return;
    }
    if (
      electron &&
      !unlocked &&
      !currentChart &&
      (path === '/api/history' || path.startsWith('/api/history/'))
    ) {
      response
        .status(423)
        .json({ error: 'История доступна в настройках после ввода PIN-кода.' });
      return;
    }
    if (!unlocked && protectedSettingsRequest(request.method, request.path)) {
      response
        .status(423)
        .json({ error: 'Настройки заблокированы. Введите PIN-код.' });
      return;
    }
    if (
      !unlocked &&
      !combinedRoles() &&
      profileMutationRequest(request.method, request.path)
    ) {
      response.status(423).json({
        error:
          'Создание и редактирование профилей доступны после ввода PIN-кода.',
      });
      return;
    }
    next();
  });
  return router;
}
