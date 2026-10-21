import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  utimes,
  readdir,
  rm,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cleanUsbLogs } from '../dist/usbRetention.js';
import { HistoryStorage } from '../dist/historyStorage.js';

test('80% threshold, oldest-first deletion down to 50%, current log and unrelated files preserved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mercury-retention-'));
  try {
    const logs = join(root, 'mercury-logs');
    await mkdir(logs);
    const names = [
      'server-2020-01-01.log',
      'server-2020-01-02.log',
      'server-2020-01-03.log',
    ];
    for (let i = 0; i < names.length; i++) {
      const file = join(logs, names[i]);
      await writeFile(file, 'old');
      await utimes(file, i + 1, i + 1);
    }
    const today = `server-${new Date().toISOString().slice(0, 10)}.log`;
    await writeFile(join(logs, today), 'active');
    await writeFile(join(logs, 'profiles.json'), 'unrelated');
    assert.equal(
      cleanUsbLogs(
        root,
        () => true,
        () => 0.79,
      ),
      0,
    );
    const usage = () =>
      existsSync(join(logs, names[0]))
        ? 0.8
        : existsSync(join(logs, names[1]))
          ? 0.65
          : 0.5;
    assert.equal(
      cleanUsbLogs(root, () => true, usage),
      2,
    );
    assert.deepEqual(
      (await readdir(logs)).sort(),
      [names[2], today, 'profiles.json'].sort(),
    );
    assert.equal(
      cleanUsbLogs(
        root,
        () => false,
        () => 0.99,
      ),
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cleanup removes completed history with samples/events, protects unfinished run and flushes queued samples', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mercury-retention-'));
  try {
    const history = new HistoryStorage(root, () => true);
    const insert =
      "INSERT INTO runs VALUES(?,?,?,'2020-01-01',?,'running',NULL,1)";
    history.prepare(insert).run('old', 'Old', '{}', '2020-01-02');
    history.prepare(insert).run('active', 'Active', '{}', null);
    history.prepare('INSERT INTO samples VALUES(?,?,?)').run('old', 1, '{}');
    history
      .prepare('INSERT INTO events(run_id,at,message) VALUES(?,?,?)')
      .run('old', '2020-01-01', 'old');
    assert.equal(history.pauseDiskForMaintenance(), true);
    history.prepare('INSERT INTO samples VALUES(?,?,?)').run('active', 2, '{}');
    assert.equal(
      cleanUsbLogs(
        root,
        () => true,
        () => 0.9,
      ),
      1,
    );
    history.resumeDiskAfterMaintenance();
    assert.deepEqual(
      history
        .prepare('SELECT id FROM runs')
        .all()
        .map((x) => x.id),
      ['active'],
    );
    assert.equal(history.prepare('SELECT * FROM samples').all().length, 1);
    assert.equal(history.prepare('SELECT * FROM events').all().length, 0);
    history.close();
    const disk = new DatabaseSync(join(root, 'mercury-logs/history.sqlite'));
    assert.equal(disk.prepare('PRAGMA freelist_count').get().freelist_count, 0);
    disk.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
