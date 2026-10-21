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
  prepare(sql: string) {
    return {
      run: (...args: SQLInputValue[]) => {
        void this.request('run', sql, args);
      },
    };
  }
  async storedQuery(sql: string, args: SQLInputValue[] = []) {
    const rows = await this.request('all', sql, args);
    return rows as Record<string, any>[] | undefined;
  }
  // Keep maintenance on the same worker, after all preceding writes.
  async pauseWorkerForMaintenance() {
    return Boolean(await this.request('pause'));
  }
  async resumeWorkerAfterMaintenance() {
    await this.request('resume');
  }
  async flush() {
    // FIFO acknowledgement after every preceding write; bounded by watchdog.
    await this.request('flush');
  }
  close() {
    this.disableWorker();
  }
}
