/**
 * Моточасы: длительности активных выходов на USB и единственный резервный снимок рядом с config.json при загрузке.
 */
import {
  existsSync,
  readFileSync,
  mkdirSync,
  lstatSync,
  statSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { configurationDirectory } from './ovenSettings.js';
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from 'node:worker_threads';
import { isMountedUsb } from './usbStorage.js';
export type ElementState = Record<string, boolean>;
type Data = {
  version: 1;
  since: string;
  updatedAt: string;
  configurations: Record<string, { onSeconds: Record<string, number> }>;
};
export type RuntimeReport = {
  available: boolean;
  data?: Data | null;
  error?: string;
  source?: 'usb' | 'backup';
  readOnly?: boolean;
};
/**
 * Проверяет формат и неотрицательные конечные значения счётчиков перед использованием внешнего файла.
 */
function validateData(data: Data) {
  if (
    !data ||
    data.version !== 1 ||
    !data.configurations ||
    typeof data.configurations !== 'object' ||
    Array.isArray(data.configurations) ||
    typeof data.since !== 'string' ||
    typeof data.updatedAt !== 'string'
  )
    throw Error('Invalid runtime');
  for (const entry of Object.values(data.configurations))
    if (
      !entry ||
      !entry.onSeconds ||
      typeof entry.onSeconds !== 'object' ||
      Array.isArray(entry.onSeconds) ||
      Object.values(entry.onSeconds).some(
        (n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0,
      )
    )
      throw Error('Invalid totals');
  return data;
}
/**
 * Возвращает путь резервного снимка рядом с конфигурацией, вне каталога обновляемой программы.
 */
function backupPath() {
  return join(configurationDirectory(), 'element-runtime-backup.json');
}
/**
 * Читает резервные моточасы для просмотра при отсутствии USB; новые значения в резерв не накапливаются.
 */
export function readRuntimeBackup(path = backupPath()): RuntimeReport {
  try {
    if (lstatSync(path).isSymbolicLink() || statSync(path).size > 1024 * 1024)
      throw Error('Unsafe backup');
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return {
      available: true,
      data: validateData(value.data),
      source: 'backup',
      readOnly: true,
    };
  } catch {
    return {
      available: false,
      error: 'Моточасы недоступны: USB и резервная копия не читаются.',
    };
  }
}
/**
 * Определяет идентификатор загрузки ОС для защиты от повторной записи резервного снимка при перезапуске приложения.
 */
function bootId() {
  return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
}
/**
 * Атомарно записывает разрешённый снимок счётчиков с проверкой пути назначения.
 */
function writeBackup(data: Data, path = backupPath(), id = bootId()) {
  const temporary = path + '.tmp';
  if (
    [path, temporary].some(
      (p) => existsSync(p) && lstatSync(p).isSymbolicLink(),
    )
  )
    throw Error('Unsafe backup');
  writeFileSync(
    temporary,
    JSON.stringify({ version: 1, bootId: id, data }) + '\n',
    { mode: 0o600 },
  );
  renameSync(temporary, path);
}
/**
 * Копирует доступные USB-счётчики в резервный файл только один раз за загрузку Raspberry.
 */
export function backupRuntimeAtBoot(
  root: string,
  path = backupPath(),
  id = bootId(),
  available = isMountedUsb,
) {
  try {
    if (
      existsSync(path) &&
      JSON.parse(readFileSync(path, 'utf8')).bootId === id
    )
      return false;
    const report = readRuntimeFile(root, available);
    if (!report.available || !report.data) return false;
    writeBackup(report.data, path, id);
    return true;
  } catch {
    return false;
  }
}
/**
 * Инициализирует разрешённый снимок моточасов при загрузке и завершает вспомогательный worker после ответа.
 */
export function initializeRuntimeBackup() {
  return new Promise<void>((resolve) => {
    const child = new Worker(new URL('./elementRuntime.js', import.meta.url), {
      workerData: {
        root: process.env.MERCURY_LOG_USB_MOUNT ?? '/media/flash',
        initializeBackup: true,
      },
    });
    let finished = false;
    /** Завершает однократное чтение USB, очищая таймер и обработчики worker при любом исходе. */
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void child.terminate();
      resolve();
    };
    const timer = setTimeout(done, 1500);
    child.once('message', done);
    child.once('error', done);
    child.once('exit', done);
  });
}
/**
 * Читает и проверяет файл счётчиков; ошибки накопителя возвращаются как недоступность данных.
 */
export function readRuntimeFile(
  root: string,
  available = isMountedUsb,
): RuntimeReport {
  if (!available(root))
    return {
      available: false,
      error: 'USB-накопитель недоступен. Моточасы не записываются.',
    };
  try {
    const directory = join(root, 'mercury-logs');
    if (existsSync(directory) && lstatSync(directory).isSymbolicLink())
      throw Error('Unsafe directory');
    const path = join(directory, 'element-runtime.json');
    if (!existsSync(path)) return { available: true, data: null };
    if (lstatSync(path).isSymbolicLink() || statSync(path).size > 1024 * 1024)
      throw Error('Unsafe file');
    const data = JSON.parse(readFileSync(path, 'utf8')) as Data;
    validateData(data);
    if (!available(root)) throw Error('USB disconnected');
    return { available: true, data };
  } catch {
    return {
      available: false,
      error: 'Не удалось прочитать моточасы с USB-накопителя.',
    };
  }
}

let readUsbBlocked = false;
let reportPending: Promise<ReturnType<typeof readRuntimeFile>> | undefined;
/** A stuck USB read cannot block the control loop or return cached totals. */
export function readElementRuntime(): Promise<
  ReturnType<typeof readRuntimeFile>
> {
  if (reportPending) return reportPending;
  const operation = new Promise<ReturnType<typeof readRuntimeFile>>(
    (resolve) => {
      let finished = false;
      let backup: RuntimeReport | undefined;
      const reader = new Worker(
        new URL('./elementRuntime.js', import.meta.url),
        {
          workerData: {
            root: process.env.MERCURY_LOG_USB_MOUNT ?? '/media/flash',
            readRuntime: true,
            backupOnly: readUsbBlocked,
          },
        },
      );
      /** Завершает запрос счётчиков один раз, включая таймаут или ошибку worker. */
      const finish = (result: ReturnType<typeof readRuntimeFile>) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        void reader.terminate();
        resolve(result);
      };
      const timer = setTimeout(() => {
        readUsbBlocked = true;
        finish(
          backup ?? { available: false, error: 'USB-накопитель не отвечает.' },
        );
      }, 1500);
      reader.on('message', (message) => {
        if (message.backupReady) {
          backup = message.backupReady;
          return;
        }
        finish(message);
      });
      reader.once('error', () =>
        finish({ available: false, error: 'Не удалось прочитать моточасы.' }),
      );
      reader.once('exit', () =>
        finish({ available: false, error: 'Чтение моточасов завершено.' }),
      );
    },
  );
  reportPending = operation;
  void operation.finally(() => {
    if (reportPending === operation) reportPending = undefined;
  });
  return operation;
}
/** No accrual without healthy USB, and no bridging communication gaps or restarts. */
export class ElementRuntimeFile {
  private previous: { key: string; state: ElementState; at: number } | null =
    null;
  private data: Data | null = null;
  private device: number | undefined;
  private lastFlush = -Infinity;
  private failed = false;
  /**
   * Создаёт экземпляр с явно переданными зависимостями и начальным состоянием.
   */
  constructor(
    private root: string,
    private available = isMountedUsb,
  ) {}
  /**
   * Повторно проверяет хранилище перед файловой операцией, поскольку USB мог исчезнуть после запуска.
   */
  private checked() {
    if (this.failed || !this.available(this.root)) {
      this.previous = null;
      this.data = null;
      return false;
    }
    const device = statSync(this.root).dev;
    if (this.device !== undefined && this.device !== device) {
      this.previous = null;
      this.data = null;
    }
    this.device = device;
    return true;
  }
  /**
   * Начисляет прошедшее время только выходам, активным на предыдущем наблюдении; состояние относится к выбранной конфигурации.
   */
  observe(key: string, state: ElementState | null, at: number) {
    try {
      if (!this.checked()) return;
      if (!this.data) {
        const directory = join(this.root, 'mercury-logs');
        mkdirSync(directory, { recursive: true });
        if (lstatSync(directory).isSymbolicLink())
          throw Error('Unsafe directory');
        const file = join(directory, 'element-runtime.json');
        if (existsSync(file)) {
          if (lstatSync(file).isSymbolicLink()) throw Error('Unsafe file');
          const value = JSON.parse(readFileSync(file, 'utf8')) as Data;
          if (
            value.version !== 1 ||
            !value.configurations ||
            typeof value.since !== 'string'
          )
            throw Error('Invalid runtime file');
          for (const entry of Object.values(value.configurations))
            if (
              !entry.onSeconds ||
              Object.values(entry.onSeconds).some(
                (n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0,
              )
            )
              throw Error('Invalid totals');
          this.data = value;
        } else {
          const now = new Date().toISOString();
          this.data = {
            version: 1,
            since: now,
            updatedAt: now,
            configurations: {},
          };
        }
      }
      const last = this.previous;
      if (last && last.key === key && at >= last.at && at - last.at <= 5000) {
        const entry = (this.data.configurations[key] ??= { onSeconds: {} });
        for (const [name, enabled] of Object.entries(last.state)) {
          entry.onSeconds[name] ??= 0;
          if (enabled) entry.onSeconds[name] += (at - last.at) / 1000;
        }
      }
      this.previous = state ? { key, state: { ...state }, at } : null;
      if (at - this.lastFlush >= 10000 || state === null) {
        this.flush();
        this.lastFlush = at;
      }
    } catch {
      this.failed = true;
      this.previous = null;
      this.data = null;
    }
  }
  /**
   * Выполняет явный сброс через защищённый серверный маршрут и обновляет отображаемые данные.
   */
  reset() {
    const report = readRuntimeFile(this.root, this.available);
    if (!report.available || !this.checked()) return false;
    const now = new Date().toISOString();
    this.data = { version: 1, since: now, updatedAt: now, configurations: {} };
    for (const [key, entry] of Object.entries(
      report.data?.configurations ?? {},
    ))
      this.data.configurations[key] = {
        onSeconds: Object.fromEntries(
          Object.keys(entry.onSeconds).map((name) => [name, 0]),
        ),
      };
    this.previous = null;
    this.lastFlush = -Infinity;
    this.flush();
    return !this.failed;
  }
  /**
   * Сохраняет накопленные счётчики на исправный USB; резервный файл этим методом не обновляется.
   */
  flush() {
    try {
      if (!this.checked() || !this.data) return;
      const file = join(this.root, 'mercury-logs', 'element-runtime.json');
      const temp = file + '.tmp';
      if (
        (existsSync(file) && lstatSync(file).isSymbolicLink()) ||
        (existsSync(temp) && lstatSync(temp).isSymbolicLink())
      )
        throw Error('Unsafe file');
      this.data.updatedAt = new Date().toISOString();
      const fd = openSync(temp, 'w', 0o600);
      try {
        writeFileSync(fd, JSON.stringify(this.data, null, 2) + '\n');
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      if (!this.checked()) return;
      renameSync(temp, file);
    } catch {
      this.failed = true;
      this.data = null;
      this.previous = null;
    }
  }
}
let worker: Worker | undefined;
let pending = 0;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let stopped = false;
/**
 * Отключает запись после ошибки накопителя; данные не перенаправляются на системный диск.
 */
function disable() {
  stopped = true;
  clearTimeout(watchdog);
  void worker?.terminate().catch(() => {});
  worker = undefined;
}
/**
 * Передаёт состояние выходов обработчику моточасов без файлового ввода-вывода в цикле управления.
 */
export function observeElementRuntime(key: string, state: ElementState | null) {
  if (
    stopped ||
    process.platform !== 'linux' ||
    process.env.MERCURY_CONTROLLER_MODE === 'simulation'
  )
    return;
  try {
    if (!worker) {
      worker = new Worker(new URL('./elementRuntime.js', import.meta.url), {
        workerData: {
          root: process.env.MERCURY_LOG_USB_MOUNT ?? '/media/flash',
        },
      });
      worker.unref();
      worker.on('error', disable);
      worker.on('exit', disable);
      worker.on('message', (message) => {
        if (message.flush || message.reset) return;
        pending = Math.max(0, pending - 1);
        if (!pending) clearTimeout(watchdog);
      });
    }
    if (pending >= 100) {
      disable();
      return;
    }
    if (!pending++) {
      watchdog = setTimeout(disable, 2000);
      watchdog.unref();
    }
    worker.postMessage({ key, state, at: performance.now() });
  } catch {
    disable();
  }
}
/**
 * Ожидает подтверждения записи счётчиков перед завершением процесса; сбой USB не разрешает запись на SD.
 */
export async function flushElementRuntime() {
  if (!worker) return;
  const current = worker;
  await new Promise<void>((resolve) => {
    /** Освобождает ресурсы ожидания подтверждения записи, даже если USB уже недоступен. */
    const done = (message: { flush?: boolean }) => {
      if (message.flush) {
        clearTimeout(timeout);
        current.off('message', done);
        resolve();
      }
    };
    const timeout = setTimeout(() => {
      current.off('message', done);
      resolve();
    }, 1000);
    current.on('message', done);
    current.postMessage({ flush: true });
  });
}
/**
 * Обнуляет счётчики через worker; вызывающий маршрут отдельно проверяет права и очищает историю запусков.
 */
export async function resetElementRuntime() {
  if (!worker || stopped || readUsbBlocked)
    throw Error('Для сброса нужен исправный USB-накопитель.');
  const current = worker;
  return new Promise<void>((resolve, reject) => {
    /** Принимает только ответ ожидаемого сброса, не смешивая его с другими сообщениями worker. */
    const onMessage = (message: { reset?: boolean; success?: boolean }) => {
      if (!message.reset) return;
      clearTimeout(timer);
      current.off('message', onMessage);
      if (message.success) resolve();
      else reject(Error('Не удалось сбросить моточасы на USB.'));
    };
    const timer = setTimeout(() => {
      current.off('message', onMessage);
      reject(Error('USB-накопитель не отвечает.'));
    }, 2000);
    current.on('message', onMessage);
    current.postMessage({ reset: true });
  });
}
if (!isMainThread && workerData?.root && workerData.initializeBackup) {
  parentPort!.postMessage({ saved: backupRuntimeAtBoot(workerData.root) });
} else if (!isMainThread && workerData?.root && workerData.readRuntime) {
  const backup = readRuntimeBackup();
  parentPort!.postMessage({ backupReady: backup });
  const report = workerData.backupOnly
    ? { available: false }
    : readRuntimeFile(workerData.root);
  parentPort!.postMessage(
    report.available
      ? { ...report, source: 'usb', readOnly: false }
      : backup.available
        ? backup
        : report,
  );
} else if (!isMainThread && workerData?.root) {
  const file = new ElementRuntimeFile(workerData.root);
  parentPort!.on('message', (message) => {
    if (message.reset) {
      let success = false;
      try {
        success = file.reset();
        const report = readRuntimeFile(workerData.root);
        if (success && report.data) writeBackup(report.data);
      } catch {
        success = false;
      }
      parentPort!.postMessage({ reset: true, success });
      return;
    }
    if (message.flush) file.flush();
    else file.observe(message.key, message.state, message.at);
    parentPort!.postMessage({ flush: Boolean(message.flush) });
  });
}
