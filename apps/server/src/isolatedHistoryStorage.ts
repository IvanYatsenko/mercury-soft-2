/**
 * Асинхронная граница USB-истории: зависший файловый ввод-вывод отключает worker, а не поток регулирования.
 */
import { Worker } from 'node:worker_threads';
import type { SQLInputValue } from 'node:sqlite';

// No filesystem operation, including mount checks and close(), runs on the
// control thread. A hung kernel write can strand the worker, never the UART.
export class IsolatedHistoryStorage {
  private worker: Worker | undefined;
  private sequence = 0;
  private requests = new Map<
    number,
    {
      resolve: (value: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  /**
   * Создаёт отдельный worker и сопоставляет ответы с запросами по номеру; worker не удерживает процесс после штатного выхода.
   */
  constructor(
    root = process.env.MERCURY_LOG_USB_MOUNT ?? '/media/flash',
    workerUrl = new URL('./usbHistoryWorker.js', import.meta.url),
  ) {
    this.worker = new Worker(workerUrl, { workerData: { root } });
    this.worker.on('message', ({ id, value }: { id: number; value: any }) => {
      const request = this.requests.get(id);
      if (!request) return;
      clearTimeout(request.timer);
      this.requests.delete(id);
      request.resolve(value);
    });
    this.worker.on('error', () => this.disableWorker());
    this.worker.on('exit', () => this.disableWorker());
    this.worker.unref();
  }
  /**
   * Завершает ожидающие запросы без результата и прекращает использование зависшего worker; не ожидает завершения системного I/O.
   */
  private disableWorker() {
    const worker = this.worker;
    this.worker = undefined;
    for (const request of this.requests.values()) {
      clearTimeout(request.timer);
      request.resolve(undefined);
    }
    this.requests.clear();
    // Never await termination: a kernel I/O wait need not finish promptly.
    if (worker) void worker.terminate().catch(() => {});
  }
  /**
   * Передаёт операцию с двухсекундным дедлайном и ограничением очереди. После отказа данные не копятся для повторной записи.
   */
  private request(operation: string, sql?: string, args: SQLInputValue[] = []) {
    if (!this.worker) return Promise.resolve(undefined);
    if (this.requests.size >= 1000) {
      this.disableWorker();
      return Promise.resolve(undefined);
    }
    const id = ++this.sequence;
    return new Promise<any>((resolve) => {
      const timer = setTimeout(() => this.disableWorker(), 2000);
      this.requests.set(id, { resolve, timer });
      this.worker!.postMessage({ id, operation, sql, args });
    });
  }
  /**
   * Возвращает неблокирующий интерфейс записи; SQL и параметры остаются внутри доверенного серверного кода.
   */
  prepare(sql: string) {
    return {
      run: (...args: SQLInputValue[]) => {
        void this.request('run', sql, args);
      },
    };
  }
  /**
   * Асинхронно получает строки с USB; undefined означает отказ worker, а не успешный пустой результат.
   */
  async storedQuery(sql: string, args: SQLInputValue[] = []) {
    const rows = await this.request('all', sql, args);
    return rows as Record<string, any>[] | undefined;
  }
  // Keep maintenance on the same worker, after all preceding writes.
  /**
   * Дожидается паузы после предыдущих записей, чтобы фоновой очистке не мешало открытое соединение.
   */
  async pauseWorkerForMaintenance() {
    return Boolean(await this.request('pause'));
  }
  /**
   * Возобновляет работу после очистки на том же worker; отказ не должен задерживать основной цикл.
   */
  async resumeWorkerAfterMaintenance() {
    await this.request('resume');
  }
  /**
   * Ставит FIFO-подтверждение после записей перед выключением; ожидание ограничено watchdog.
   */
  async flush() {
    // FIFO acknowledgement after every preceding write; bounded by watchdog.
    await this.request('flush');
  }
  /**
   * Требует положительное подтверждение совместной очистки истории; при недоступном USB выбрасывает ошибку для интерфейса.
   */
  async clearRuns() {
    if (!(await this.request('clearRuns')))
      throw new Error('Не удалось очистить историю запусков на USB.');
  }
  /**
   * Отключает worker и ожидающие запросы без синхронного обращения к USB.
   */
  close() {
    this.disableWorker();
  }
}
