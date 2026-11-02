import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  LegacyMonitoring,
  startLegacyMonitoring,
} from '../dist/legacyMonitoring.js';

function fixture() {
  let at = 10000,
    optionsReads = 0,
    unavailable = false;
  const run = {
    id: null,
    state: 'idle',
    profileName: null,
    second: 0,
    timeHorizon: 0,
    acknowledged: false,
    profile: {},
    maximumDeviationC: 0,
  };
  const options = {
    referenceHz: 50,
    fanWarnings: true,
    coreTemperatureC: 51.125,
    controllerTemperatureC: 38,
    version: '3.2.7',
    raspberryFan: true,
    controllerFan: false,
  };
  const board = {
    connected: true,
    ready: true,
    state: 1,
    doorOpen: false,
    port: 'TEST',
    telemetry: {
      chamberTemperatureC: 150,
      boardTemperatureC: 140,
      convectionFanHz: 45,
      heaters: true,
      lamps: false,
      convection: true,
      fans: false,
    },
  };
  const monitor = new LegacyMonitoring(
    () => structuredClone(run),
    () => {
      optionsReads++;
      return { ...options };
    },
    () => at,
    () => unavailable,
  );
  return {
    run,
    options,
    board,
    monitor,
    tick(ms) {
      at += ms;
    },
    reads() {
      return optionsReads;
    },
    shutdown() {
      unavailable = true;
    },
  };
}
test('legacy response matches the supplied monitoring consumer and preserves current-cycle time', () => {
  const f = fixture();
  Object.assign(f.run, {
    id: 'run',
    state: 'running',
    profileName: 'Рабочий профиль',
    second: 70,
    timeHorizon: 100,
    elapsedSeconds: 970,
    remainingSeconds: 1100,
    profile: { name: 'Рабочий профиль' },
  });
  f.monitor.observe(f.board);
  const result = f.monitor.response();
  assert.equal(result.status, 'busy');
  assert.equal(result.state.second, 70);
  assert.equal(result.state.timeHorizon, 100);
  assert.equal(result.state.profileName, 'Рабочий профиль');
  assert.equal(result.version, '3.2.7');
  assert.equal(result.state.coreTemp, '51.13°C');
  assert.equal(result.state.temperature, 38);
  assert.deepEqual(result.state.convFreq, { Hz: 45, rel: 0.9 });
  assert.deepEqual(result.heatIndicators, {
    tens: 100,
    IR: 0,
    convection: 100,
    fans: 0,
  });
  assert.equal(result.state.indicators.length, 8);
  assert.deepEqual(result.progress, []);
  for (const name of [
    'profileError',
    'fanError',
    'doorError',
    'ovenTempError',
    'itmpError',
  ])
    assert.equal(typeof result.errorStore[name], 'number');
});
test('idle, active and paused runs, terminal finish, Ready and holding map to legacy states', () => {
  const f = fixture();
  f.monitor.observe(f.board);
  assert.equal(f.monitor.response().status, 'idle');
  f.run.id = 'run';
  for (const state of ['preparing', 'running', 'cooling']) {
    f.run.state = state;
    f.run.paused = true;
    assert.equal(f.monitor.response().status, 'busy');
  }
  for (const state of ['completed', 'stopped', 'failed']) {
    f.run.state = state;
    assert.equal(f.monitor.response().status, 'finish');
  }
  f.run.acknowledged = true;
  f.run.holdingTemperatureC = 100;
  assert.equal(f.monitor.response().status, 'idle');
});
test('error counters record episodes rather than poll count and reset at the next start', () => {
  const f = fixture();
  Object.assign(f.run, { id: 'run', state: 'running', maximumDeviationC: 5 });
  f.board.doorOpen = true;
  f.board.state = 9;
  f.board.telemetry.convectionFanHz = 10;
  f.monitor.observe(f.board);
  f.monitor.observe(f.board);
  const expected = {
    profileError: 1,
    fanError: 1,
    doorError: 1,
    ovenTempError: 1,
    itmpError: 0,
  };
  assert.deepEqual(f.monitor.response().errorStore, expected);
  for (let i = 0; i < 10; i++)
    assert.deepEqual(f.monitor.response().errorStore, expected);
  f.monitor.event({ kind: 'completed', matched: false });
  assert.equal(f.monitor.response().errorStore.profileError, 1);
  f.board.doorOpen = false;
  f.board.state = 1;
  f.board.telemetry.convectionFanHz = 50;
  f.monitor.observe(f.board);
  f.board.doorOpen = true;
  f.monitor.observe(f.board);
  assert.equal(f.monitor.response().errorStore.doorError, 2);
  f.monitor.event({ kind: 'started' });
  assert.deepEqual(f.monitor.response().errorStore, {
    profileError: 0,
    fanError: 0,
    doorError: 0,
    ovenTempError: 0,
    itmpError: 0,
  });
});
test('connection errors are counted once and offline, stale or shutting-down data are not presented as idle', () => {
  const f = fixture();
  assert.equal(f.monitor.response(), null);
  f.monitor.observe(f.board);
  f.tick(6501);
  assert.equal(f.monitor.response(), null);
  f.board.connected = false;
  f.monitor.observe(f.board);
  f.monitor.event({ kind: 'connectionLost' });
  assert.equal(f.monitor.response(), null);
  f.board.connected = true;
  f.monitor.observe(f.board);
  assert.equal(f.monitor.response().errorStore.itmpError, 1);
  f.shutdown();
  assert.equal(f.monitor.response(), null);
});
test('disabled fan warnings and a door outside a profile do not create false error episodes', () => {
  const f = fixture();
  f.options.fanWarnings = false;
  f.board.telemetry.convectionFanHz = 1;
  f.board.doorOpen = true;
  f.monitor.observe(f.board);
  const counters = f.monitor.response().errorStore;
  assert.equal(counters.fanError, 0);
  assert.equal(counters.doorError, 0);
});
test('port serves only read-only status, no PIN/configuration/heat commands, without additional device reads', async () => {
  const f = fixture();
  f.monitor.observe(f.board);
  const before = structuredClone(f.run);
  const server = startLegacyMonitoring(f.monitor, '127.0.0.1', 0);
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (let i = 0; i < 3; i++) {
      const response = await fetch(base + '/status');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).status, 'idle');
    }
    assert.equal(f.reads(), 1);
    assert.deepEqual(f.run, before);
    assert.equal(
      (await fetch(base + '/status', { method: 'POST' })).status,
      405,
    );
    assert.equal(
      (await fetch(base + '/api/run/start', { method: 'POST' })).status,
      404,
    );
    assert.equal((await fetch(base + '/api/config')).status, 404);
    f.tick(7000);
    assert.equal((await fetch(base + '/status')).status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
