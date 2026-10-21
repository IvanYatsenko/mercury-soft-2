import { parentPort, workerData } from 'node:worker_threads';
import { HistoryStorage } from './historyStorage.js';

const history = new HistoryStorage(String(workerData.root));
parentPort!.on('message', ({ id, operation, sql, args }) => {
  let value: unknown;
  try {
    if (operation === 'pause') value = history.pauseDiskForMaintenance();
    else if (operation === 'resume') history.resumeDiskAfterMaintenance();
    else if (operation === 'run') history.prepare(sql).run(...args);
    else if (operation === 'all') value = history.prepare(sql).all(...args);
  } catch {
    // Failed writes are discarded; there is no history fallback.
  }
  parentPort!.postMessage({ id, value });
});
