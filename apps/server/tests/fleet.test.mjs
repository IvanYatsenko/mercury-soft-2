import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { once } from 'node:events';
import { allowedOvenAddress, avahiAddress } from '../dist/fleetNetwork.js';
const dir = await mkdtemp(join(tmpdir(), 'mercury-fleet-'));
process.env.MERCURY_CONFIG_PATH = join(dir, 'config.json');
await writeFile(
  process.env.MERCURY_CONFIG_PATH,
  JSON.stringify({
    ovenModel: '300',
    connectionVoltage: '380',
    fanReferenceHz: 45,
    untouched: true,
  }),
);
const settings = await import('../dist/ovenSettings.js');
const { FleetDirectory, createFleetRouter } = await import('../dist/fleet.js');
const { createSettingsAccessRouter } =
  await import('../dist/settingsAccess.js');
const interfaces = {
  eth0: [
    {
      address: '10.10.1.88',
      netmask: '255.255.0.0',
      family: 'IPv4',
      internal: false,
    },
  ],
};
const device = {
  service: 'mercury-oven',
  apiVersion: 1,
  name: 'М300',
  description: 'Линия 1',
  model: '300',
  connectionVoltage: '380',
  version: '3.2.7',
  controller: {
    connected: true,
    ready: true,
    temperature: 50,
    boardTemperature: 29,
  },
  run: { state: 'idle', profileName: null, remainingSeconds: 0 },
};
test('only private IPv4 addresses on a local interface subnet can be queried', () => {
  for (const ip of ['10.10.1.13', '10.10.20.7'])
    assert.equal(allowedOvenAddress(ip, interfaces), true);
  for (const ip of [
    '127.0.0.1',
    '169.254.169.254',
    '8.8.8.8',
    '10.11.1.2',
    '10.10.0.0',
    '10.10.255.255',
    '10.10.1.13:8075',
    'example.com',
    '::1',
  ])
    assert.equal(allowedOvenAddress(ip, interfaces), false, ip);
});
test('mDNS parser accepts only resolved Mercury IPv4 services on port 8075', () => {
  const line =
    '=;wlan0;IPv4;Mercury\\032test;_mercury._tcp;local;raspberrypi.local;10.10.1.13;8075;"api=1"';
  assert.equal(avahiAddress(line, interfaces), '10.10.1.13');
  assert.equal(avahiAddress(line.replace('8075', '22'), interfaces), null);
  assert.equal(
    avahiAddress(line.replace('_mercury', '_ssh'), interfaces),
    null,
  );
  assert.equal(
    avahiAddress(line.replace('10.10.1.13', '127.0.0.1'), interfaces),
    null,
  );
  assert.equal(avahiAddress(line.replace('=;', '+;'), interfaces), null);
});
test('identity is validated, persisted and preserves hardware and calibration', async () => {
  assert.deepEqual(settings.readOvenIdentity(), { name: '', description: '' });
  await settings.saveOvenIdentity({
    name: ' Линия 1 ',
    description: ' Стол №2 ',
  });
  assert.deepEqual(settings.readOvenIdentity(), {
    name: 'Линия 1',
    description: 'Стол №2',
  });
  await assert.rejects(
    settings.saveOvenIdentity({ name: 'x'.repeat(65), description: '' }),
  );
  await assert.rejects(
    settings.saveOvenIdentity({ name: 'ok', description: 3 }),
  );
  const config = JSON.parse(
    await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'),
  );
  assert.equal(config.fanReferenceHz, 45);
  assert.equal(config.ovenModel, '300');
  assert.equal(config.untouched, true);
  await settings.saveOvenIdentity({ name: '', description: '' });
});
test('directory merges discovery/manual addresses, keeps stale last-seen and retries without commands', async () => {
  let online = true;
  const calls = [];
  const directory = new FleetDirectory(
    async () => device,
    () => interfaces,
    async (ip) => {
      calls.push(ip);
      if (!online) throw new Error('offline');
      return device;
    },
  );
  directory.discover(
    '=;wlan0;IPv4;Mercury;_mercury._tcp;local;pi.local;10.10.1.13;8075;',
  );
  await directory.refresh();
  assert.equal(directory.snapshot().ovens.length, 2);
  await directory.add('10.10.1.13');
  assert.equal(directory.snapshot().ovens.length, 2);
  let entry = directory
    .snapshot()
    .ovens.find((e) => e.address === '10.10.1.13');
  assert.equal(entry.manual, true);
  assert.equal(entry.discovered, true);
  assert.equal(entry.online, true);
  const seen = entry.lastSeen;
  online = false;
  await directory.refresh();
  entry = directory.snapshot().ovens.find((e) => e.address === '10.10.1.13');
  assert.equal(entry.online, false);
  assert.equal(entry.lastSeen, seen);
  assert.equal(entry.device.description, 'Линия 1');
  online = true;
  await directory.refresh();
  assert.equal(entry.online, true);
  const before = calls.length;
  await assert.rejects(directory.add('127.0.0.1'));
  assert.equal(calls.length, before);
  await directory.remove('10.10.1.13');
  assert.deepEqual(settings.readFleetAddresses(), []);
  assert.equal(entry.manual, false);
});
test('existing PIN levels protect identity and manual writes while fleet discovery is public', async () => {
  const directory = new FleetDirectory(
    async () => device,
    () => interfaces,
    async () => device,
  );
  await directory.refresh();
  const app = express();
  app.use(express.json());
  app.use(createSettingsAccessRouter());
  app.use(createFleetRouter(directory, async () => device));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (path, method = 'GET', body) =>
    fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Mercury-Client': 'a'.repeat(64),
      },
      ...(body === undefined
        ? {}
        : {
            headers: {
              'Content-Type': 'application/json',
              'X-Mercury-Client': 'a'.repeat(64),
            },
            body: JSON.stringify(body),
          }),
    });
  try {
    assert.equal((await request('/api/fleet')).status, 200);
    assert.equal((await request('/api/device')).status, 200);
    assert.equal(
      (await request('/api/settings/fleet', 'POST', { address: '10.10.1.13' }))
        .status,
      423,
    );
    await request('/api/settings-access/unlock', 'POST', { pin: '3457' });
    const originalName = settings.readOvenIdentity().name;
    assert.equal(
      (
        await request('/api/settings/oven-identity', 'PUT', {
          description: ' Линия 2 ',
        })
      ).status,
      200,
    );
    assert.deepEqual(settings.readOvenIdentity(), {
      name: originalName,
      description: 'Линия 2',
    });
    assert.equal(
      (
        await request('/api/settings/oven-identity', 'PUT', {
          name: 'Name',
          description: '',
        })
      ).status,
      423,
    );
    assert.equal(
      (await request('/api/settings/fleet', 'POST', { address: '10.10.1.13' }))
        .status,
      200,
    );
    await request('/api/settings-access/unlock', 'POST', { pin: '34572' });
    assert.equal(
      (
        await request('/API/SETTINGS/OVEN-IDENTITY/', 'PUT', {
          name: 'Печь',
          description: 'Описание',
        })
      ).status,
      200,
    );
    await request('/api/settings-access/lock', 'POST');
    assert.equal(
      (
        await request('/api/settings/oven-identity', 'PUT', {
          name: '',
          description: '',
        })
      ).status,
      423,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
test.after(async () => {
  await rm(dir, { recursive: true, force: true });
});
