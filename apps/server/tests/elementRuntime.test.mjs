import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ElementRuntimeFile,
  readRuntimeFile,
  readElementRuntime,
  backupRuntimeAtBoot,
  readRuntimeBackup,
} from '../dist/elementRuntime.js';
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'mercury-runtime-'));
  return { root, path: join(root, 'mercury-logs', 'element-runtime.json') };
};
test('tracks each output separately, groups configurations, and survives restart without counting downtime', () => {
  const f = fixture();
  const r = new ElementRuntimeFile(f.root, () => true);
  r.observe('M300-380', { topHeater: true, infrared: false, f1: true }, 0);
  r.observe('M300-380', { topHeater: false, infrared: true, f1: true }, 3000);
  r.observe('M300-380', { topHeater: false, infrared: false, f1: false }, 5000);
  r.flush();
  let d = JSON.parse(readFileSync(f.path));
  assert.deepEqual(d.configurations['M300-380'].onSeconds, {
    topHeater: 3,
    infrared: 2,
    f1: 5,
  });
  const restarted = new ElementRuntimeFile(f.root, () => true);
  restarted.observe('M300-380', { topHeater: true }, 100000);
  restarted.observe('M300-380', { topHeater: false }, 102000);
  restarted.observe('M400-230', { infrared: true }, 103000);
  restarted.observe('M400-230', { infrared: false }, 104000);
  restarted.flush();
  d = JSON.parse(readFileSync(f.path));
  assert.equal(d.configurations['M300-380'].onSeconds.topHeater, 5);
  assert.equal(d.configurations['M400-230'].onSeconds.infrared, 1);
});
test('missing USB creates no directory and does not replay missing intervals on reconnection', () => {
  const f = fixture();
  let usb = false;
  const r = new ElementRuntimeFile(f.root, () => usb);
  r.observe('M300', { convection: true }, 0);
  assert.equal(existsSync(f.path), false);
  usb = true;
  r.observe('M300', { convection: true }, 10000);
  r.observe('M300', { convection: true }, 12000);
  usb = false;
  r.observe('M300', { convection: true }, 13000);
  usb = true;
  r.observe('M300', { convection: true }, 20000);
  r.observe('M300', { convection: false }, 21000);
  r.flush();
  // Unsaved intervals before disconnection are discarded, never backfilled.
  assert.equal(
    JSON.parse(readFileSync(f.path)).configurations.M300.onSeconds.convection,
    1,
  );
});
test('unknown state and long communication gaps do not accrue unobserved runtime', () => {
  const f = fixture();
  const r = new ElementRuntimeFile(f.root, () => true);
  r.observe('M300', { topHeater: true }, 0);
  r.observe('M300', { topHeater: true }, 1000);
  r.observe('', null, 2000);
  r.observe('M300', { topHeater: true }, 30000);
  r.observe('M300', { topHeater: false }, 40000);
  r.flush();
  assert.equal(
    JSON.parse(readFileSync(f.path)).configurations.M300.onSeconds.topHeater,
    1,
  );
});
test('corrupt files are preserved rather than replaced with zero counters', () => {
  const f = fixture();
  mkdirSync(join(f.root, 'mercury-logs'));
  writeFileSync(f.path, 'broken');
  const r = new ElementRuntimeFile(f.root, () => true);
  r.observe('M300', { topHeater: true }, 0);
  r.observe('M300', { topHeater: true }, 1000);
  r.flush();
  assert.equal(readFileSync(f.path, 'utf8'), 'broken');
  assert.equal(readRuntimeFile(f.root, () => true).available, false);
});

test('runtime report reads stored totals without writing and never reuses data after USB removal', () => {
  const f = fixture();
  const file = new ElementRuntimeFile(f.root, () => true);
  file.observe('M300', { topHeater: true }, 0);
  file.observe('M300', { topHeater: false }, 2500);
  file.flush();
  const before = readFileSync(f.path, 'utf8');
  const report = readRuntimeFile(f.root, () => true);
  assert.equal(report.available, true);
  assert.equal(report.data.configurations.M300.onSeconds.topHeater, 2.5);
  assert.equal(readFileSync(f.path, 'utf8'), before);
  assert.equal(readRuntimeFile(f.root, () => false).available, false);
  assert.equal(readRuntimeFile(f.root, () => false).data, undefined);
  const empty = fixture();
  assert.deepEqual(
    readRuntimeFile(empty.root, () => true),
    { available: true, data: null },
  );
  assert.equal(existsSync(empty.path), false);
});

test('isolated report worker does not create a fallback when USB is absent', async () => {
  const f = fixture();
  process.env.MERCURY_LOG_USB_MOUNT = f.root;
  assert.equal((await readElementRuntime()).available, false);
  assert.equal(existsSync(f.path), false);
});

test('boot backup is written once per OS boot and remains read-only when USB fails', () => {
  const f = fixture(),
    backup = join(f.root, 'element-runtime-backup.json');
  const r = new ElementRuntimeFile(f.root, () => true);
  r.observe('M300', { convection: true }, 0);
  r.observe('M300', { convection: true }, 2000);
  r.flush();
  assert.equal(
    backupRuntimeAtBoot(f.root, backup, 'boot-1', () => true),
    true,
  );
  const original = readFileSync(backup, 'utf8');
  r.observe('M300', { convection: true }, 4000);
  r.flush();
  assert.equal(
    backupRuntimeAtBoot(f.root, backup, 'boot-1', () => true),
    false,
  );
  assert.equal(readFileSync(backup, 'utf8'), original);
  assert.equal(
    backupRuntimeAtBoot(f.root, backup, 'boot-2', () => false),
    false,
  );
  const report = readRuntimeBackup(backup);
  assert.equal(report.readOnly, true);
  assert.equal(report.data.configurations.M300.onSeconds.convection, 2);
  assert.equal(readFileSync(backup, 'utf8'), original);
  assert.equal(
    backupRuntimeAtBoot(f.root, backup, 'boot-2', () => true),
    true,
  );
  assert.equal(
    readRuntimeBackup(backup).data.configurations.M300.onSeconds.convection,
    4,
  );
});
test('reset clears stored totals and pending accrual without changing USB configuration keys', () => {
  const f = fixture(),
    r = new ElementRuntimeFile(f.root, () => true);
  r.observe('M300', { convection: true }, 0);
  r.observe('M300', { convection: true }, 2000);
  r.flush();
  assert.equal(r.reset(), true);
  assert.equal(
    readRuntimeFile(f.root, () => true).data.configurations.M300.onSeconds
      .convection,
    0,
  );
  r.observe('M300', { convection: true }, 4000);
  r.observe('M300', { convection: false }, 5000);
  r.flush();
  assert.equal(
    readRuntimeFile(f.root, () => true).data.configurations.M300.onSeconds
      .convection,
    1,
  );
});
