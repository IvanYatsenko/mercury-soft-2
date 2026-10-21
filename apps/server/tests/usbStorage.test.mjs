import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HistoryStorage } from '../dist/historyStorage.js';
import { isMountedUsb, decodeMountPath } from '../dist/usbStorage.js';

const insert =
  "INSERT INTO runs VALUES(?,?,?,'2026-10-19',NULL,'running',NULL,1)";
test('missing USB discards history and never creates a fallback directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mercury-usb-'));
  try {
    const db = new HistoryStorage(root, () => false);
    db.prepare(insert).run('a', 'Profile', '{}');
    assert.equal(db.prepare('SELECT * FROM runs').all().length, 0);
    assert.deepEqual(await readdir(root), []);
    db.close();
    const restarted = new HistoryStorage(root, () => false);
    assert.equal(restarted.prepare('SELECT * FROM runs').all().length, 0);
    restarted.close();
    assert.equal(isMountedUsb(root), false);
    assert.equal(decodeMountPath('/media/USB\\040Drive'), '/media/USB Drive');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('USB history persists; removal discards new records without a RAM fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mercury-usb-'));
  try {
    let connected = true;
    const db = new HistoryStorage(root, () => connected);
    db.prepare(insert).run('a', 'Profile', '{}');
    connected = false;
    db.prepare(insert).run('b', 'Offline', '{}');
    connected = true;
    db.prepare(insert).run('c', 'Still disabled until restart', '{}');
    assert.equal(db.prepare('SELECT * FROM runs').all().length, 0);
    db.close();
    const restarted = new HistoryStorage(root, () => true);
    assert.deepEqual(
      restarted
        .prepare('SELECT id FROM runs')
        .all()
        .map((x) => x.id),
      ['a'],
    );
    restarted.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('corrupted USB database does not prevent operation or overwrite damaged history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mercury-usb-'));
  try {
    await mkdir(join(root, 'mercury-logs'));
    await writeFile(
      join(root, 'mercury-logs', 'history.sqlite'),
      'broken database',
    );
    const db = new HistoryStorage(root, () => true);
    assert.doesNotThrow(() => db.prepare(insert).run('a', 'Profile', '{}'));
    assert.equal(db.prepare('SELECT * FROM runs').all().length, 0);
    db.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
