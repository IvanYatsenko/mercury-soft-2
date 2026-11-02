import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import {
  createSettingsAccessRouter,
  protectedSettingsRequest,
  isLocalPanel,
} from '../dist/settingsAccess.js';

test('only local Electron is the embedded panel; remote User-Agent spoofing cannot bypass the start PIN', () => {
  assert.equal(isLocalPanel('Electron/37.0.0', '127.0.0.1'), true);
  assert.equal(isLocalPanel('Electron/37.0.0', '10.10.1.88'), false);
  assert.equal(isLocalPanel('Mozilla/5.0', '127.0.0.1'), false);
});

async function fixture(
  combinedRoles = () => true,
  currentRunId = () => null,
  defaultUserAgent = 'Mercury Browser',
) {
  const app = express();
  app.use(express.json());
  app.use(createSettingsAccessRouter(combinedRoles, currentRunId));
  app.use((_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    server,
    request: async (
      path,
      method = 'GET',
      body,
      userAgent = defaultUserAgent,
    ) => {
      const response = await fetch(base + path, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: {
                'Content-Type': 'application/json',
                'X-Mercury-Client': 'a'.repeat(64),
              },
              body: JSON.stringify(body),
            }),
        headers: {
          'Content-Type': 'application/json',
          'X-Mercury-Client': 'a'.repeat(64),
          'User-Agent': userAgent,
        },
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
    assert.equal(
      (await f.request('/api/settings/element-runtime')).status,
      423,
    );
    assert.equal((await f.request('/api/config', 'PUT', {})).status, 423);
    assert.equal(
      (
        await f.request('/api/controller/auxiliary-cooling/test', 'POST', {
          name: 'raspberry',
        })
      ).status,
      423,
    );
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
    assert.equal(
      (await f.request('/api/settings/element-runtime')).status,
      200,
    );
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
        (
          await f.request(
            path,
            method,
            method === 'GET'
              ? undefined
              : path === '/api/run/start'
                ? { pin: '3457' }
                : {},
          )
        ).status,
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
        (
          await f.request(
            path,
            method,
            method === 'GET'
              ? undefined
              : path === '/api/run/start'
                ? { pin: '3457' }
                : {},
          )
        ).status,
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
        (
          await f.request(
            path,
            method,
            method === 'GET'
              ? undefined
              : path === '/api/run/start'
                ? { pin: '3457' }
                : {},
          )
        ).status,
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
        (
          await f.request(
            path,
            method,
            method === 'GET'
              ? undefined
              : path === '/api/run/start'
                ? { pin: '3457' }
                : {},
          )
        ).status,
        200,
        path,
      );
    assert.equal((await f.request('/api/config', 'PUT', {})).status, 423);
  } finally {
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});

test('model remains advanced-only while operator PIN permits fan reference; locking revokes both', async () => {
  const f = await fixture();
  const paths = [
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
          (
            await f.request(
              path,
              method,
              method === 'GET'
                ? undefined
                : path === '/api/run/start'
                  ? { pin: '3457' }
                  : {},
            )
          ).status,
          (path.includes('fan-reference') ? pin !== null : pin === '34572')
            ? 200
            : 423,
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

test('calibration is appliance-only even for unlocked desktop and mobile sessions', async () => {
  const f = await fixture();
  try {
    for (const pin of ['3457', '34572']) {
      await f.request('/api/settings-access/unlock', 'POST', { pin });
      for (const agent of [
        'Mozilla/5.0 Chrome/130.0',
        'Mozilla/5.0 iPhone Safari/605.1',
      ]) {
        assert.equal(
          (
            await f.request(
              '/api/settings/calibration',
              'GET',
              undefined,
              agent,
            )
          ).status,
          403,
        );
        for (const action of ['start', 'save', 'stop', 'reset'])
          assert.equal(
            (
              await f.request(
                '/api/settings/calibration/' + action,
                'POST',
                {},
                agent,
              )
            ).status,
            403,
          );
      }
      assert.equal(
        (
          await f.request(
            '/api/settings/calibration',
            'GET',
            undefined,
            'Electron/37.0.0',
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await f.request(
            '/api/settings/fan-reference',
            'PUT',
            {},
            'Mozilla/5.0',
          )
        ).status,
        200,
      );
    }
  } finally {
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});

test('Electron operator can read current chart while locked and all history after ordinary PIN', async () => {
  let current = 'current-run';
  const f = await fixture(
    () => false,
    () => current,
    'Electron/37.0.0',
  );
  try {
    assert.equal((await f.request('/api/history/current-run')).status, 200);
    assert.equal((await f.request('/API/HISTORY/CURRENT-RUN/')).status, 200);
    assert.equal((await f.request('/api/history')).status, 423);
    assert.equal((await f.request('/api/history/archived-run')).status, 423);
    assert.equal(
      (await f.request('/api/history/current-run', 'POST', {})).status,
      423,
    );
    await f.request('/api/settings-access/unlock', 'POST', { pin: '3457' });
    assert.equal((await f.request('/api/history/current-run')).status, 200);
    assert.equal((await f.request('/api/history/archived-run')).status, 200);
    current = 'next-run';
    assert.equal((await f.request('/api/history/current-run')).status, 200);
    assert.equal((await f.request('/api/history/next-run')).status, 200);
    current = null;
    assert.equal((await f.request('/api/history/next-run')).status, 200);
  } finally {
    f.server.closeAllConnections();
    await new Promise((r) => f.server.close(r));
  }
});

test('every web start requires its own exact PIN, regardless of settings unlock; Electron start remains available', async () => {
  const f = await fixture();
  try {
    for (const pin of [
      undefined,
      '0000',
      '345',
      '34570',
      '345720',
      3457,
      34572,
    ])
      assert.equal(
        (await f.request('/api/run/start', 'POST', { pin })).status,
        423,
      );
    assert.equal(
      (await f.request('/api/run/start', 'POST', { pin: '3457' })).status,
      200,
    );
    assert.equal(
      (await f.request('/api/run/start', 'POST', { pin: '34572' })).status,
      200,
    );
    await f.request('/api/settings-access/unlock', 'POST', { pin: '3457' });
    assert.equal((await f.request('/api/run/start', 'POST', {})).status, 423);
    await f.request('/api/settings-access/lock', 'POST', {});
    assert.equal(
      (
        await f.request(
          '/api/run/start',
          'POST',
          {},
          'Mozilla/5.0 Electron/37.0.0',
        )
      ).status,
      200,
    );
    assert.equal((await f.request('/api/run/stop', 'POST', {})).status, 200);
  } finally {
    await new Promise((r) => f.server.close(r));
  }
});
test('network settings are appliance-only even after web PIN unlock; Electron history uses ordinary PIN', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/api/wifi/status')).status, 200);
    assert.equal(
      (
        await f.request(
          '/api/wifi/networks',
          'GET',
          undefined,
          'Electron/37.0.0',
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.request('/api/wifi/radio', 'POST', {}, 'Electron/37.0.0'))
        .status,
      200,
    );
    assert.equal((await f.request('/api/wifi/networks')).status, 403);
    assert.equal(
      (await f.request('/api/wifi/connect', 'POST', {})).status,
      403,
    );
    assert.equal(
      (await f.request('/api/history', 'GET', undefined, 'Electron/37.0.0'))
        .status,
      423,
    );
    await f.request('/api/settings-access/unlock', 'POST', { pin: '3457' });
    assert.equal((await f.request('/api/wifi/networks')).status, 403);
    assert.equal(
      (await f.request('/api/wifi/disconnect', 'POST', {})).status,
      403,
    );
    assert.equal(
      (await f.request('/api/history', 'GET', undefined, 'Electron/37.0.0'))
        .status,
      200,
    );
    assert.equal(
      (
        await f.request(
          '/api/history/old-run',
          'GET',
          undefined,
          'Electron/37.0.0',
        )
      ).status,
      200,
    );
    assert.equal((await f.request('/api/history')).status, 200);
    await f.request('/api/settings-access/lock', 'POST', {});
    assert.equal((await f.request('/api/wifi/networks')).status, 403);
  } finally {
    await new Promise((r) => f.server.close(r));
  }
});
