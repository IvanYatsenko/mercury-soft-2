import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { IsolatedHistoryStorage } from '../dist/isolatedHistoryStorage.js';

const insert =
  "INSERT INTO runs VALUES(?,?,?,'2026-10-20',NULL,'running',NULL,1)";

test('stalled USB worker cannot stall control timers and has no RAM history fallback', async () => {
  const stalled = new URL(
    'data:text/javascript,' +
      encodeURIComponent(`
    import { parentPort } from 'node:worker_threads';
    parentPort.on('message', () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000));
  `),
  );
  const history = new IsolatedHistoryStorage('/unused', stalled);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  try {
    history.prepare(insert).run('active', 'Profile', '{}');
    const query = history.storedQuery('SELECT * FROM runs');
    for (let i = 0; i < 50; i++) {
      history
        .prepare('INSERT INTO samples VALUES(?,?,?)')
        .run('active', i, '{}');
      await delay(10);
    }
    assert.ok(ticks >= 35, `control timer only ran ${ticks} times`);
    assert.equal(history.prepare('SELECT * FROM samples').all, undefined);
    assert.equal(await query, undefined);
    history
      .prepare('INSERT INTO samples VALUES(?,?,?)')
      .run('active', 51, '{}');
    assert.equal(history.prepare('SELECT * FROM samples').all, undefined);
    assert.equal(await history.storedQuery('SELECT * FROM runs'), undefined);
  } finally {
    clearInterval(timer);
    history.close();
  }
});

test('real USB worker without a mounted device never writes a fallback directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mercury-isolated-'));
  const history = new IsolatedHistoryStorage(root);
  try {
    history.prepare(insert).run('a', 'Profile', '{}');
    const rows = await history.storedQuery('SELECT id FROM runs');
    assert.deepEqual(rows, []);
    assert.deepEqual(await readdir(root), []);
  } finally {
    history.close();
    await rm(root, { recursive: true, force: true });
  }
});
