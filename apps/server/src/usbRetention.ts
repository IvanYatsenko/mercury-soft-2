import { DatabaseSync } from 'node:sqlite';
import { lstatSync, readdirSync, rmSync, statSync, statfsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from 'node:worker_threads';
import { isMountedUsb } from './usbStorage.js';

export function usbUsage(root: string) {
  const stats = statfsSync(root);
  return stats.blocks === 0 ? 1 : 1 - stats.bavail / stats.blocks;
}

/** Only Mercury archives and completed runs are eligible. */
export function cleanUsbLogs(
  root: string,
  available = isMountedUsb,
  usage = usbUsage,
) {
  if (!available(root) || usage(root) < 0.8) return 0;
  const device = statSync(root).dev;
  const directory = resolve(root, 'mercury-logs');
  if (
    !lstatSync(directory).isDirectory() ||
    lstatSync(directory).isSymbolicLink()
  )
    return 0;
  const check = () => {
    if (!available(root) || statSync(root).dev !== device)
      throw new Error('USB disappeared');
  };
  const today = new Date().toISOString().slice(0, 10);
  const files = readdirSync(directory)
    .flatMap((name) => {
      if (
        !/^server-\d{4}-\d{2}-\d{2}\.log$/.test(name) &&
        !/^before-usb-\d{8}T\d{6}Z$/.test(name)
      )
        return [];
      if (name === `server-${today}.log`) return [];
      const path = resolve(directory, name);
      const stat = lstatSync(path);
      if (
        stat.isSymbolicLink() ||
        stat.dev !== device ||
        !path.startsWith(directory + sep)
      )
        return [];
      return [{ path, at: stat.mtimeMs }];
    })
    .sort((a, b) => a.at - b.at);
  let db: DatabaseSync | undefined;
  let deleted = 0;
  try {
    check();
    const path = join(directory, 'history.sqlite');
    try {
      if (!lstatSync(path).isSymbolicLink()) {
        db = new DatabaseSync(path);
        db.exec('PRAGMA busy_timeout=0; PRAGMA synchronous=FULL;');
        if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok')
          throw new Error('Bad history');
      }
    } catch {
      db?.close();
      db = undefined;
    }
    while (usage(root) > 0.5) {
      check();
      const run = db
        ?.prepare(
          'SELECT id,started_at FROM runs WHERE finished_at IS NOT NULL ORDER BY started_at,id LIMIT 1',
        )
        .get();
      const file = files[0];
      if (!run && !file) break;
      const runAt = run ? Date.parse(String(run.started_at)) : Infinity;
      if (file && file.at <= runAt) {
        check();
        rmSync(file.path, { recursive: true, force: false });
        files.shift();
      } else if (run && db) {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('DELETE FROM samples WHERE run_id=?').run(String(run.id));
          db.prepare('DELETE FROM events WHERE run_id=?').run(String(run.id));
          db.prepare('DELETE FROM runs WHERE id=?').run(String(run.id));
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        if (db.prepare('PRAGMA auto_vacuum').get()?.auto_vacuum === 0)
          db.exec('VACUUM');
      }
      deleted++;
    }
  } finally {
    db?.close();
  }
  return deleted;
}

export function startUsbRetention(history: {
  pauseDiskForMaintenance: () => boolean | Promise<boolean>;
  resumeDiskAfterMaintenance: () => void | Promise<void>;
}) {
  if (process.platform !== 'linux' || !process.env.MERCURY_LOG_USB_MOUNT)
    return;
  const worker = new Worker(new URL(import.meta.url), {
    workerData: { root: process.env.MERCURY_LOG_USB_MOUNT },
  });
  let paused = false;
  worker.on('message', async (message: string) => {
    if (message === 'pause') {
      paused = await history.pauseDiskForMaintenance();
      worker.postMessage('ready');
    } else if (message === 'done' && paused) {
      history.resumeDiskAfterMaintenance();
      paused = false;
    }
  });
  const resume = () => {
    if (paused) history.resumeDiskAfterMaintenance();
    paused = false;
  };
  worker.on('error', resume);
  worker.on('exit', resume);
  worker.unref();
}

if (!isMainThread && workerData?.root) {
  const root = String(workerData.root);
  let busy = false;
  const check = () => {
    try {
      if (!busy && isMountedUsb(root) && usbUsage(root) >= 0.8) {
        busy = true;
        parentPort?.postMessage('pause');
      }
    } catch {
      /* Missing or damaged USB: no fallback writes. */
    }
  };
  parentPort?.on('message', () => {
    try {
      cleanUsbLogs(root);
    } catch {
      /* Retry later without interrupting control. */
    } finally {
      busy = false;
      parentPort?.postMessage('done');
    }
  });
  setInterval(check, 60_000).unref();
  check();
}
