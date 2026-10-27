import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import {
  createSettingsAccessRouter,
  protectedSettingsRequest,
} from '../dist/settingsAccess.js';

async function fixture(combinedRoles = () => true) {
  const app = express();
  app.use(express.json());
  app.use(createSettingsAccessRouter(combinedRoles));
  app.use((_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    server,
    request: async (path, method = 'GET', body) => {
      const response = await fetch(base + path, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
      });
      return {
        status: response.status,
        body: await response.json(),
        cache: response.headers.get('cache-control'),
      };
    },
  };
}
test('settings start locked, reject wrong PIN, unlock with 3457 and relock from another client', async () => {
  const f = await fixture();
  try {
    const initial = await f.request('/api/settings-access');
    assert.equal(initial.body.unlocked, false);
    assert.equal(initial.cache, 'no-store');
    assert.equal((await f.request('/api/config', 'PUT', {})).status, 423);
    assert.equal((await f.request('/API/CONFIG/', 'PUT', {})).status, 423);
    assert.equal(
      (await f.request('/api/controller/convection/', 'PUT', { enabled: true }))
        .status,
      423,
    );
    for (const pin of ['', 0, 3457, '0000', '345', '34570', null]) {
      assert.equal(
        (await f.request('/api/settings-access/unlock', 'POST', { pin }))
          .status,
        401,
      );
      assert.equal(
        (await f.request('/api/settings-access')).body.unlocked,
        false,
      );
    }
    const unlocked = await f.request('/api/settings-access/unlock', 'POST', {
      pin: '3457',
    });
    assert.equal(unlocked.body.unlocked, true);
    assert.equal(JSON.stringify(unlocked.body).includes('3457'), false);
    assert.equal((await f.request('/api/config', 'PUT', {})).status, 423);
    assert.equal((await f.request('/api/settings-access')).body.unlocked, true);
    await f.request('/api/settings-access/lock', 'POST');
    assert.equal(
      (await f.request('/api/settings-access')).body.unlocked,
      false,
    );
    assert.equal(
      (await f.request('/api/settings/thermal-protection', 'PUT', {})).status,
      423,
    );
  } finally {
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});
test('a fresh server locks access and changes boot ID', async () => {
  const a = await fixture(),
    b = await fixture();
  try {
    await a.request('/api/settings-access/unlock', 'POST', { pin: '3457' });
    const x = await a.request('/api/settings-access'),
      y = await b.request('/api/settings-access');
    assert.equal(x.body.unlocked, true);
    assert.equal(y.body.unlocked, false);
    assert.notEqual(x.body.bootId, y.body.bootId);
  } finally {
    for (const f of [a, b]) {
      f.server.closeAllConnections();
      await new Promise((r) => f.server.close(r));
    }
  }
});
test('locked settings protect changes and tests without blocking operator start, stop or 100 C switch', () => {
  for (const [method, path] of [
    ['PUT', '/api/config'],
    ['PUT', '/api/settings/sound-on-errors'],
    ['PUT', '/api/settings/thermal-protection'],
    ['PUT', '/api/settings/fan-reference'],
    ['POST', '/api/controller/test-element'],
    ['PUT', '/api/controller/convection'],
    ['POST', '/api/software-update/install'],
  ])
    assert.equal(protectedSettingsRequest(method, path), true, path);
  for (const [method, path] of [
    ['GET', '/api/config'],
    ['GET', '/api/controller/check'],
    ['GET', '/api/settings/keep-heat'],
    ['PUT', '/api/settings/keep-heat'],
    ['POST', '/api/run/start'],
    ['POST', '/api/run/stop'],
    ['POST', '/api/run/pause'],
    ['POST', '/api/run/resume'],
    ['POST', '/api/wifi/connect'],
  ])
    assert.equal(protectedSettingsRequest(method, path), false, path);
});

test('separate roles block profile writes but permit operator selection and execution; PIN grants engineering access', async () => {
  let combined = false;
  const f = await fixture(() => combined);
  const mutations = [
    ['POST', '/api/profiles'],
    ['POST', '/api/profiles/import'],
    ['PUT', '/api/profiles/example'],
    ['DELETE', '/api/profiles/example'],
    ['PUT', '/API/PROFILES/example/'],
  ];
  try {
    const initial = await f.request('/api/settings-access');
    assert.equal(initial.body.combineOperatorEngineerRoles, false);
    assert.equal(initial.body.canEditProfiles, false);
    for (const [method, path] of mutations)
      assert.equal(
        (await f.request(path, method, method === 'GET' ? undefined : {}))
          .status,
        423,
        path,
      );
    for (const [method, path] of [
      ['GET', '/api/profiles'],
      ['PUT', '/api/profiles/selected'],
      ['POST', '/api/run/start'],
      ['POST', '/api/run/stop'],
    ])
      assert.equal(
        (await f.request(path, method, method === 'GET' ? undefined : {}))
          .status,
        200,
        path,
      );
    assert.equal(
      (
        await f.request('/api/settings/combined-roles', 'PUT', {
          enabled: true,
        })
      ).status,
      423,
    );
    await f.request('/api/settings-access/unlock', 'POST', { pin: '3457' });
    assert.equal(
      (await f.request('/api/settings-access')).body.canEditProfiles,
      true,
    );
    for (const [method, path] of mutations)
      assert.equal(
        (await f.request(path, method, method === 'GET' ? undefined : {}))
          .status,
        200,
        path,
      );
    await f.request('/api/settings-access/lock', 'POST');
    assert.equal((await f.request('/api/profiles', 'POST', {})).status, 423);
    combined = true;
    assert.equal(
      (await f.request('/api/settings-access')).body.canEditProfiles,
      true,
    );
    for (const [method, path] of mutations)
      assert.equal(
        (await f.request(path, method, method === 'GET' ? undefined : {}))
          .status,
        200,
        path,
      );
    assert.equal((await f.request('/api/config', 'PUT', {})).status, 423);
  } finally {
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});

test('advanced PIN alone grants model, history and fan reference access; locking and regular PIN revoke it', async () => {
  const f = await fixture();
  const paths = [
    ['GET', '/api/history'],
    ['GET', '/API/HISTORY/example/'],
    ['PUT', '/api/config'],
    ['PUT', '/api/settings/fan-reference/'],
  ];
  try {
    for (const pin of [null, '3457', '34572', '3457', null]) {
      const result =
        pin === null
          ? await f.request('/api/settings-access/lock', 'POST')
          : await f.request('/api/settings-access/unlock', 'POST', { pin });
      assert.equal(result.body.advancedUnlocked, pin === '34572');
      for (const [method, path] of paths)
        assert.equal(
          (await f.request(path, method, method === 'GET' ? undefined : {}))
            .status,
          pin === '34572' ? 200 : 423,
        );
      assert.equal(
        (await f.request('/api/settings-access')).body.advancedUnlocked,
        pin === '34572',
      );
      assert.equal((await f.request('/api/config')).status, 200);
      assert.equal((await f.request('/api/run')).status, 200);
    }
  } finally {
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});
