import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import express from 'express';
const dir = await mkdtemp(join(tmpdir(), 'mercury-calibration-'));
process.env.MERCURY_CONFIG_PATH = join(dir, 'config.json');
process.env.MERCURY_CONTROLLER_MODE = 'simulation';
await writeFile(
  process.env.MERCURY_CONFIG_PATH,
  JSON.stringify({
    ovenModel: '300',
    connectionVoltage: '230',
    custom: 'preserve',
  }),
);
const calibration = await import('../dist/temperatureCalibration.js');
const { createCalibrationRouter } = await import('../dist/calibration.js');
const { createSettingsAccessRouter } =
  await import('../dist/settingsAccess.js');
const { saveOvenSelection } = await import('../dist/ovenSettings.js');

test('calibration persists in a separate file, isolates sensors and survives program restarts', async () => {
  const before = await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8');
  assert.equal(calibration.correctTemperature(100, 'chamber'), 100);
  await Promise.all([
    calibration.saveCalibration('chamber', {
      target: 100,
      raw: 100,
      measured: 105,
    }),
    calibration.saveCalibration('board', {
      target: 100,
      raw: 100,
      measured: 97,
    }),
  ]);
  assert.equal(calibration.correctTemperature(100, 'chamber'), 105);
  assert.equal(calibration.correctTemperature(100, 'board'), 97);
  assert.equal(calibration.correctTemperature(300, 'chamber'), 300);
  assert.equal(calibration.correctTemperature(-1, 'chamber'), -1);
  assert.equal(await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'), before);
  assert.equal(
    calibration.calibrationFilePath(),
    join(dir, 'temperature-calibration.json'),
  );
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {correctTemperature} from './apps/server/dist/temperatureCalibration.js';if(correctTemperature(100,'board')!==97)process.exit(1);`,
    ],
    { cwd: process.cwd(), env: process.env, encoding: 'utf8' },
  );
  assert.equal(child.status, 0, child.stderr);
  await assert.rejects(
    calibration.saveCalibration('chamber', {
      target: 150,
      raw: 150,
      measured: 300,
    }),
  );
  await assert.rejects(
    calibration.saveCalibration('chamber', {
      target: 105,
      raw: 101,
      measured: 90,
    }),
  );
  await calibration.resetCalibration('chamber');
  assert.equal(calibration.correctTemperature(100, 'chamber'), 100);
  assert.equal(calibration.correctTemperature(100, 'board'), 97);
  await saveOvenSelection({ ovenModel: '400', connectionVoltage: '380' });
  assert.equal(calibration.correctTemperature(100, 'board'), 100);
  await saveOvenSelection({ ovenModel: '300', connectionVoltage: '230' });
  assert.equal(calibration.correctTemperature(100, 'board'), 97);
});

test('ordinary PIN opens calibration; sensor choice is mandatory, busy and stale saves are rejected', async () => {
  let active = false,
    run = { id: null, state: 'idle' },
    lastProfile;
  const runner = {
    controlling: () => active,
    snapshot: () => run,
    start: async (profile, a, b, c) => {
      lastProfile = profile;
      assert.equal(c, true);
      active = true;
      run = { id: 'calibration-run', purpose: 'calibration', state: 'running' };
      return run;
    },
    stop: async () => {
      active = false;
      run = { ...run, state: 'stopped' };
      return run;
    },
  };
  const app = express();
  app.use(express.json());
  app.use(createSettingsAccessRouter());
  app.use(createCalibrationRouter(runner));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (path, body) => {
    const r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mercury-Client': 'a'.repeat(64),
        'User-Agent': 'Electron/37.0.0',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    assert.equal((await request('/api/settings/calibration')).status, 423);
    await request('/api/settings-access/unlock', { pin: '3457' });
    assert.equal((await request('/api/settings/calibration')).status, 200);
    assert.equal(
      (await request('/api/settings/calibration/start', { target: 150 }))
        .status,
      409,
    );
    assert.equal(
      (
        await request('/api/settings/calibration/start', {
          sensor: 'board',
          target: 285,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request('/api/settings/calibration/start', {
          sensor: 'board',
          target: 150,
        })
      ).status,
      200,
    );
    assert.equal(lastProfile.board, true);
    assert.equal(lastProfile.repeat, 1);
    assert.equal(lastProfile.points.at(-1).second, 60);
    assert.equal(
      (await request('/api/settings/calibration/reset', { sensor: 'board' }))
        .status,
      409,
    );
    assert.equal(
      (
        await request('/api/settings/calibration/save', {
          runId: run.id,
          measured: 152,
        })
      ).status,
      409,
    );
    active = false;
    run = {
      ...run,
      state: 'completed',
      measuredTemperatureC: 150,
      rawMeasuredTemperatureC: 148,
      calibrationStableSeconds: 20,
    };
    assert.equal(
      (
        await request('/api/settings/calibration/save', {
          runId: 'stale',
          measured: 152,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request('/api/settings/calibration/save', {
          runId: run.id,
          measured: 152,
        })
      ).status,
      200,
    );
    assert.equal(calibration.correctTemperature(148, 'board'), 152);
    assert.equal(
      (
        await request('/api/settings/calibration/save', {
          runId: run.id,
          measured: 152,
        })
      ).status,
      409,
    );
    await request('/api/settings/calibration/start', {
      sensor: 'chamber',
      target: 100,
    });
    assert.equal(lastProfile.board, false);
    assert.equal(
      (await request('/api/settings/calibration/stop', { runId: run.id }))
        .status,
      200,
    );
    assert.equal(active, false);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test.after(async () => {
  await rm(dir, { recursive: true, force: true });
});
