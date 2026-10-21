import { Worker } from 'node:worker_threads';
import { format } from 'node:util';
export function startUsbLogger() {
  if (process.platform !== 'linux' || !process.env.MERCURY_LOG_USB_MOUNT)
    return;
  const worker = new Worker(new URL('./usbLoggerWorker.js', import.meta.url));
  const pending = new Map<number, ReturnType<typeof setTimeout>>();
  let disabled = false;
  let sequence = 0;
  const disable = () => {
    if (disabled) return;
    disabled = true;
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
    void worker.terminate().catch(() => {});
  };
  worker.on('error', disable);
  worker.on('exit', disable);
  worker.on('message', (id: number) => {
    clearTimeout(pending.get(id));
    pending.delete(id);
  });
  worker.unref();
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    console[level] = (...args: unknown[]) => {
      if (disabled) return;
      if (pending.size >= 1000) {
        disable();
        return;
      }
      const id = ++sequence;
      const timer = setTimeout(disable, 2000);
      timer.unref();
      pending.set(id, timer);
      worker.postMessage({ id, level, text: format(...args).slice(0, 16384) });
    };
  }
}
