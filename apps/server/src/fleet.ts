/**
 * Обнаружение печей через mDNS и ручные адреса; удалённое устройство не получает доступ к локальному управлению.
 */
import { Router } from 'express';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { networkInterfaces } from 'node:os';
import {
  allowedOvenAddress,
  avahiAddress,
  localAddresses,
  type Interfaces,
} from './fleetNetwork.js';
import {
  readFleetAddresses,
  saveFleetAddresses,
  readOvenIdentity,
  saveOvenIdentity,
} from './ovenSettings.js';

export type DeviceInfo = {
  service: 'mercury-oven';
  apiVersion: 1;
  name: string;
  description: string;
  model: string;
  connectionVoltage: string;
  version: string;
  controller: {
    connected: boolean;
    ready: boolean;
    temperature: number | null;
    boardTemperature: number | null;
  };
  run: { state: string; profileName: string | null; remainingSeconds: number };
};
export type FleetEntry = {
  address: string;
  url: string;
  local: boolean;
  manual: boolean;
  discovered: boolean;
  online: boolean;
  lastSeen: string | null;
  error: string | null;
  device: DeviceInfo | null;
};
/**
 * Запрашивает описание удалённой печи с ограничением ожидания; не отправляет команд управления.
 */
export async function readRemoteDevice(address: string): Promise<DeviceInfo> {
  const response = await fetch(`http://${address}:8075/api/device`, {
    signal: AbortSignal.timeout(2500),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error('Печь недоступна или ПО не поддерживает общий список');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Пустой ответ печи');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) throw new Error('Некорректный ответ печи');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (
    data?.service !== 'mercury-oven' ||
    data.apiVersion !== 1 ||
    !data.controller ||
    !data.run ||
    !['300', '400', '301', '401'].includes(data.model) ||
    !['230', '380'].includes(data.connectionVoltage)
  )
    throw new Error('По адресу не найдена совместимая печь Mercury');
  return {
    service: 'mercury-oven',
    apiVersion: 1,
    name: typeof data.name === 'string' ? data.name.slice(0, 64) : '',
    description:
      typeof data.description === 'string'
        ? data.description.slice(0, 240)
        : '',
    model: data.model,
    connectionVoltage: data.connectionVoltage,
    version: typeof data.version === 'string' ? data.version.slice(0, 24) : '',
    controller: {
      connected: data.controller.connected === true,
      ready: data.controller.ready === true,
      temperature: Number.isFinite(data.controller.temperature)
        ? data.controller.temperature
        : null,
      boardTemperature: Number.isFinite(data.controller.boardTemperature)
        ? data.controller.boardTemperature
        : null,
    },
    run: {
      state:
        typeof data.run.state === 'string'
          ? data.run.state.slice(0, 24)
          : 'unknown',
      profileName:
        typeof data.run.profileName === 'string'
          ? data.run.profileName.slice(0, 128)
          : null,
      remainingSeconds: Number.isFinite(data.run.remainingSeconds)
        ? Math.max(0, data.run.remainingSeconds)
        : 0,
    },
  };
}
export class FleetDirectory {
  private entries = new Map<string, FleetEntry>();
  discoveryError: string | null = null;
  private refreshing = false;
  /**
   * Создаёт экземпляр с явно переданными зависимостями и начальным состоянием.
   */
  constructor(
    private local: () => Promise<DeviceInfo>,
    private interfaces: () => Interfaces = networkInterfaces,
    private remote = readRemoteDevice,
  ) {}
  /**
   * Находит или создаёт запись каталога для адреса печи.
   */
  private entry(address: string) {
    if (!this.entries.has(address) && this.entries.size < 64)
      this.entries.set(address, {
        address,
        url: `http://${address}:8075/`,
        local: false,
        manual: false,
        discovered: false,
        online: false,
        lastSeen: null,
        error: null,
        device: null,
      });
    return this.entries.get(address);
  }
  /**
   * Учитывает найденный сервис и запускает обновление его показаний.
   */
  discover(line: string) {
    const address = avahiAddress(line, this.interfaces());
    if (address) {
      const entry = this.entry(address);
      if (entry) entry.discovered = true;
    }
  }
  /**
   * Проверяет локальный адрес перед включением удалённой печи в каталог.
   */
  async add(address: unknown) {
    if (
      typeof address !== 'string' ||
      !allowedOvenAddress(address, this.interfaces())
    )
      throw new Error('Укажи IPv4-адрес печи в той же локальной подсети.');
    if (
      readFleetAddresses().length >= 32 &&
      !readFleetAddresses().includes(address)
    )
      throw new Error('Можно добавить не более 32 печей.');
    if (localAddresses(this.interfaces()).includes(address)) return;
    const device = await this.remote(address);
    await saveFleetAddresses([...readFleetAddresses(), address]);
    const entry = this.entry(address);
    if (entry)
      Object.assign(entry, {
        device,
        manual: true,
        online: true,
        lastSeen: new Date().toISOString(),
        error: null,
      });
  }
  /**
   * Удаляет запись из каталога, не изменяя удалённую печь.
   */
  async remove(address: string) {
    await saveFleetAddresses(readFleetAddresses().filter((v) => v !== address));
    const e = this.entries.get(address);
    if (e) {
      e.manual = false;
      if (!e.discovered && !e.local) this.entries.delete(address);
    }
  }
  /**
   * Обновляет снимки известных печей; сетевые ошибки отражаются в доступности записи, а не удаляют её.
   */
  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const localSet = new Set(localAddresses(this.interfaces()));
      for (const address of localSet) {
        const e = this.entry(address);
        if (e) e.local = true;
      }
      for (const address of readFleetAddresses())
        if (allowedOvenAddress(address, this.interfaces())) {
          const e = this.entry(address);
          if (e) e.manual = true;
        }
      const queue = [...this.entries.values()];
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (queue.length) {
            const e = queue.shift()!;
            if (!allowedOvenAddress(e.address, this.interfaces())) {
              this.entries.delete(e.address);
              continue;
            }
            e.local = localSet.has(e.address);
            try {
              const device = e.local
                ? await this.local()
                : await this.remote(e.address);
              Object.assign(e, {
                device,
                online: true,
                lastSeen: new Date().toISOString(),
                error: null,
              });
            } catch {
              e.online = false;
              e.error = 'Нет связи с Raspberry';
            }
          }
        }),
      );
    } finally {
      this.refreshing = false;
    }
  }
  /**
   * Разрешает обмен только с проверенным адресом из каталога обнаруженных печей.
   */
  knownRemote(address: unknown): string {
    if (
      typeof address !== 'string' ||
      !allowedOvenAddress(address, this.interfaces())
    )
      throw new Error('Адрес получателя вне локальной подсети.');
    const entry = this.entries.get(address);
    if (!entry || entry.local || !entry.online)
      throw new Error('Выберите доступную соседнюю печь из общего списка.');
    return address;
  }
  /**
   * Возвращает текущий снимок для читателей без отправки команд оборудованию.
   */
  snapshot() {
    return {
      ovens: [...this.entries.values()],
      discoveryError: this.discoveryError,
      updatedAt: new Date().toISOString(),
    };
  }
}
/** Регистрирует просмотр, ручное добавление и удаление печей из каталога локальной сети. */
export function createFleetRouter(
  directory: FleetDirectory,
  device: () => Promise<DeviceInfo>,
) {
  const router = Router();
  router.get('/api/device', async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store').json(await device());
    } catch {
      res.status(503).json({ error: 'Не удалось получить состояние печи' });
    }
  });
  router.get('/api/fleet', (_req, res) =>
    res.set('Cache-Control', 'no-store').json(directory.snapshot()),
  );
  router.post('/api/settings/fleet', async (req, res) => {
    try {
      await directory.add(req.body?.address);
      res.json(directory.snapshot());
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : 'Не удалось добавить печь',
      });
    }
  });
  router.delete('/api/settings/fleet/:address', async (req, res) => {
    try {
      await directory.remove(String(req.params.address));
      res.json(directory.snapshot());
    } catch {
      res.status(400).json({ error: 'Не удалось удалить адрес' });
    }
  });
  router.get('/api/settings/oven-identity', (_req, res) =>
    res.json(readOvenIdentity()),
  );
  router.put('/api/settings/oven-identity', async (req, res) => {
    try {
      res.json(
        await saveOvenIdentity({ name: readOvenIdentity().name, ...req.body }),
      );
      void directory.refresh();
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : 'Не удалось сохранить описание',
      });
    }
  });
  return router;
}
/**
 * Запускает публикацию и поиск Avahi на Raspberry; возвращаемая функция завершает дочерние процессы.
 */
export function startFleetDiscovery(directory: FleetDirectory, port: number) {
  let stopped = false;
  let publisher: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let published = '';
  let retry: ReturnType<typeof setTimeout> | undefined;
  /** Публикует текущую печь через Avahi без открытия прав управления для найденных клиентов. */
  const publish = () => {
    const address = localAddresses()[0];
    if (!address || address === published) return;
    publisher?.kill();
    published = address;
    publisher = spawn(
      'avahi-publish-service',
      [`Mercury ${address}`, '_mercury._tcp', String(port), 'api=1', 'path=/'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    const child = publisher;
    publisher.stderr?.resume();
    publisher.on('error', () => {
      directory.discoveryError =
        'Автообнаружение недоступно: установите avahi-utils. Ручное добавление работает.';
      published = '';
    });
    publisher.on('exit', () => {
      if (publisher === child) published = '';
    });
  };
  /** Запускает поиск сервисов и передаёт найденные локальные адреса в каталог. */
  const browse = () => {
    if (stopped) return;
    browser = spawn(
      'avahi-browse',
      ['--parsable', '--resolve', '--no-db-lookup', '_mercury._tcp'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    browser.stderr?.resume();
    const lines = browser.stdout
      ? createInterface({ input: browser.stdout })
      : undefined;
    lines?.on('line', (line) => {
      if (line.length < 4096) {
        directory.discover(line);
        directory.discoveryError = null;
      }
    });
    let scheduled = false;
    /** Повторяет поиск после завершения процесса, пока служба обнаружения не остановлена. */
    const again = () => {
      if (scheduled || stopped) return;
      scheduled = true;
      lines?.close();
      retry = setTimeout(browse, 30000);
    };
    browser.on('error', () => {
      directory.discoveryError =
        'Автообнаружение недоступно: установите avahi-utils. Ручное добавление работает.';
      again();
    });
    browser.on('exit', () => {
      directory.discoveryError =
        'Служба обнаружения недоступна. Проверьте Avahi.';
      again();
    });
  };
  if (process.platform === 'linux') {
    publish();
    browse();
  } else
    directory.discoveryError =
      'Автообнаружение работает на Raspberry Pi; адрес можно добавить вручную.';
  void directory.refresh();
  const tick = setInterval(() => {
    if (process.platform === 'linux') publish();
    void directory.refresh();
  }, 10000);
  return () => {
    stopped = true;
    clearInterval(tick);
    clearTimeout(retry);
    publisher?.kill();
    browser?.kill();
  };
}
