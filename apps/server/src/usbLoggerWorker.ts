import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';
import { isMountedUsb } from './usbStorage.js';
import { parentPort } from 'node:worker_threads';

export function startUsbLogger() {
  if (process.platform !== 'linux' || !process.env.MERCURY_LOG_USB_MOUNT)
    return;
  const root = process.env.MERCURY_LOG_USB_MOUNT;
  let disabled = false;
  let device: number | undefined;
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    console[level] = (...args: unknown[]) => {
      if (disabled || !isMountedUsb(root)) return;
      try {
        const current = statSync(root).dev;
        if (device !== undefined && device !== current) {
          disabled = true;
          return;
        }
        device = current;
        const directory = join(root, 'mercury-logs');
        mkdirSync(directory, { recursive: true });
        const date = new Date();
        appendFileSync(
          join(directory, `server-${date.toISOString().slice(0, 10)}.log`),
          `${date.toISOString()} ${level.toUpperCase()} ${format(...args)}\n`,
        );
      } catch {
        disabled = true;
      }
    };
  }
}
startUsbLogger();
parentPort!.on('message', ({ id, level, text }) => {
  if (['log', 'info', 'warn', 'error', 'debug'].includes(level))
    console[level as 'log'](text);
  parentPort!.postMessage(id);
});
