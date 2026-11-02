import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { once } from 'node:events';
const directory = await mkdtemp(join(tmpdir(), 'mercury-client-access-'));
process.env.MERCURY_CONFIG_PATH = join(directory, 'config.json');
process.env.MERCURY_CONTROLLER_MODE = 'simulation';
await writeFile(
  process.env.MERCURY_CONFIG_PATH,
  JSON.stringify({
    ovenModel: '300',
    connectionVoltage: '380',
    unchanged: true,
  }),
);
const { createSettingsAccessRouter } =
  await import('../dist/settingsAccess.js');
const { checkAccessPin, checkOperatorPin, saveOperatorPin } =
  await import('../dist/operatorPin.js');
const { PinRecovery, allowDuringShutdown, pinRecovery } =
  await import('../dist/pinRecovery.js');

async function fixture() {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  app.use(createSettingsAccessRouter(() => false));
  app.use((_q, r) => r.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    server,
    async call(id, path, body, agent = 'Browser', forwarded = '') {
      const response = await fetch(
        'http://127.0.0.1:' + server.address().port + path,
        {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Mercury-Client': id.repeat(64),
            'User-Agent': agent,
            ...(forwarded ? { 'X-Forwarded-For': forwarded } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      return { status: response.status, body: await response.json() };
    },
  };
}
test('panel, phone and each PC session unlock and lock independently on one address', async () => {
  const f = await fixture();
  try {
    await f.call(
      'a',
      '/api/settings-access/unlock',
      { pin: '34572' },
      'Electron/37.0.0',
    );
    for (const id of ['b', 'c', 'd'])
      assert.equal(
        (await f.call(id, '/api/settings-access')).body.unlocked,
        false,
      );
    assert.equal((await f.call('b', '/api/config', {})).status, 423);
    await f.call('b', '/api/settings-access/unlock', { pin: '3457' });
    assert.equal(
      (await f.call('b', '/api/settings/element-runtime/reset', {})).status,
      423,
    );
    assert.equal(
      (await f.call('a', '/api/settings/element-runtime/reset', {})).status,
      200,
    );
    await f.call('a', '/api/settings-access/lock', {});
    assert.equal(
      (await f.call('a', '/api/settings-access')).body.unlocked,
      false,
    );
    assert.equal(
      (await f.call('b', '/api/settings-access')).body.unlocked,
      true,
    );
    assert.equal(
      (await f.call('c', '/api/settings-access')).body.unlocked,
      false,
    );
  } finally {
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});
test('operator PIN persists hashed, old PIN stops working, advanced PIN remains and change revokes every session', async () => {
  const f = await fixture();
  try {
    await f.call('a', '/api/settings-access/unlock', { pin: '3457' });
    await f.call('b', '/api/settings-access/unlock', { pin: '34572' });
    assert.equal(
      (
        await f.call('c', '/api/settings-access/change-pin', {
          currentPin: '3457',
          newPin: '4567',
        })
      ).status,
      423,
    );
    assert.equal(
      (
        await f.call('a', '/api/settings-access/change-pin', {
          currentPin: '0000',
          newPin: '4567',
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await f.call('a', '/api/settings-access/change-pin', {
          currentPin: '3457',
          newPin: '34572',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.call('a', '/api/settings-access/change-pin', {
          currentPin: '3457',
          newPin: '4567',
        })
      ).status,
      200,
    );
    assert.equal(await checkOperatorPin('3457'), false);
    assert.equal(await checkOperatorPin('4567'), true);
    assert.equal(await checkAccessPin('34572'), true);
    for (const id of ['a', 'b'])
      assert.equal(
        (await f.call(id, '/api/settings-access')).body.unlocked,
        false,
      );
    const data = JSON.parse(
      await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'),
    );
    assert.equal(data.unchanged, true);
    assert.equal(data.operatorPin.hash.length, 64);
    assert.notEqual(data.operatorPin.hash, '4567');
    assert.equal(
      (await f.call('a', '/api/run/start', { pin: '3457' })).status,
      423,
    );
    assert.equal(
      (await f.call('a', '/api/run/start', { pin: '4567' })).status,
      200,
    );
    await saveOperatorPin('3457');
  } finally {
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});
test('recovery endpoints cannot be armed remotely and require a physical shutdown window', async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.call('a', '/api/settings-access/recovery/arm', { open: true }))
        .status,
      403,
    );
    assert.equal(
      (
        await f.call('a', '/api/settings-access/recovery/reset', {
          code: '88888888',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.call(
          'a',
          '/api/settings-access/recovery/arm',
          { open: true },
          'Electron/37.0.0',
          '10.10.1.44',
        )
      ).status,
      403,
    );
    assert.equal(
      (await f.call('a', '/api/run/start', {}, 'Electron/37.0.0', '10.10.1.44'))
        .status,
      423,
    );
    assert.equal(
      (
        await f.call(
          'a',
          '/api/settings-access/recovery/arm',
          { open: true },
          'Electron/37.0.0',
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await f.call(
          'a',
          '/api/settings-access/recovery/reset',
          { code: '88888888' },
          'Electron/37.0.0',
        )
      ).status,
      409,
    );
    await f.call(
      'a',
      '/api/settings-access/recovery/arm',
      { open: false },
      'Electron/37.0.0',
    );
  } finally {
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});
test('local recovery during virtual shutdown restores default PIN and emits one long pulse while preserving other outputs', async () => {
  const f = await fixture();
  const { virtualBoard } = await import('../dist/controller/virtualBoard.js');
  const { initializeControllerConnection } =
    await import('../dist/controller/checkControllerConnection.js');
  try {
    virtualBoard.reset();
    await initializeControllerConnection();
    await saveOperatorPin('4567');
    await f.call(
      'a',
      '/api/settings-access/recovery/arm',
      { open: true },
      'Electron/37.0.0',
    );
    virtualBoard.call('poweroff', [30]);
    const before = virtualBoard.snapshot();
    const waiting = pinRecovery.beginShutdown();
    assert.ok(waiting);
    assert.equal(
      (
        await f.call(
          'b',
          '/api/settings-access/recovery/reset',
          { code: '88888888' },
          'Electron/37.0.0',
        )
      ).status,
      409,
    );
    const response = f.call(
      'a',
      '/api/settings-access/recovery/reset',
      { code: '88888888' },
      'Electron/37.0.0',
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(virtualBoard.snapshot().lowVoltageOutputs[3], 1);
    assert.equal((await response).status, 200);
    await waiting;
    assert.equal(await checkOperatorPin('3457'), true);
    assert.equal(await checkOperatorPin('4567'), false);
    const after = virtualBoard.snapshot();
    assert.equal(after.lowVoltageOutputs[3], 0);
    assert.deepEqual(after.highVoltageOutputs, before.highVoltageOutputs);
    assert.deepEqual(
      after.lowVoltageOutputs.filter((_, i) => i !== 3),
      before.lowVoltageOutputs.filter((_, i) => i !== 3),
    );
  } finally {
    pinRecovery.complete();
    virtualBoard.reset();
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});
test('physical recovery expires, rejects other clients and replays, and ends only after confirmation', async () => {
  const r = new PinRecovery(25);
  assert.equal(r.beginShutdown(), null);
  r.arm('a', true);
  const waiting = r.beginShutdown();
  assert.ok(waiting);
  assert.equal(r.status('b').pending, false);
  assert.equal(r.claim('b', '88888888'), false);
  assert.equal(r.claim('a', '00000000'), false);
  assert.equal(r.claim('a', '88888888'), true);
  assert.equal(r.claim('a', '88888888'), false);
  let done = false;
  void waiting.then(() => {
    done = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(done, false);
  r.complete();
  await waiting;
  assert.equal(done, true);
  r.arm('a', true);
  await r.beginShutdown();
  assert.equal(r.claim('a', '88888888'), false);
  r.arm('a', true);
  r.arm('a', false);
  assert.equal(r.beginShutdown(), null);
});
test('shutdown keeps only the recovery transport open until final process termination', () => {
  assert.equal(allowDuringShutdown('/api/run/start', true, false), false);
  assert.equal(
    allowDuringShutdown('/api/settings-access/unlock', true, false),
    false,
  );
  assert.equal(
    allowDuringShutdown('/api/settings-access/recovery', true, false),
    true,
  );
  assert.equal(
    allowDuringShutdown('/api/settings-access/recovery/reset', true, false),
    true,
  );
  assert.equal(
    allowDuringShutdown('/api/settings-access/recovery/reset', true, true),
    false,
  );
});
test.after(async () => rm(directory, { recursive: true, force: true }));
