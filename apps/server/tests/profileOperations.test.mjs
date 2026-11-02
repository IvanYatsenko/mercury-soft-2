import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import express from 'express';
import {
  reviewProfile,
  portableProfile,
  uniqueProfileName,
} from '../../../packages/shared/dist/index.js';

const dir = await mkdtemp(join(tmpdir(), 'mercury-profile-tools-'));
process.env.MERCURY_CONFIG_PATH = join(dir, 'config.json');
process.env.MERCURY_DATABASE_PATH = join(dir, 'profiles.sqlite');
process.env.MERCURY_CONTROLLER_MODE = 'simulation';
process.env.NODE_ENV = 'test';
await writeFile(
  process.env.MERCURY_CONFIG_PATH,
  JSON.stringify({ ovenModel: '300', connectionVoltage: '380' }),
);
const db = await import('../dist/database.js');
const { profileAssessment, createProfileOperationsRouter } =
  await import('../dist/profileOperations.js');
const { createSettingsAccessRouter } =
  await import('../dist/settingsAccess.js');
const profile = {
  name: 'Проверка',
  mode: 'manual',
  board: false,
  repeat: 2,
  points: [
    { second: 0, temperature: 50 },
    { second: 100, temperature: 150 },
    { second: 100, temperature: 150 },
    { second: 200, temperature: 50 },
  ],
  shelves: [
    { second: 0, temperature: 50 },
    { second: 0, temperature: 150 },
    { second: 0, temperature: 50 },
  ],
};

test('review reports sensor, peak, cycles and heating/cooling feasibility', () => {
  const r = reviewProfile(profile, 0.5, 0.25);
  assert.equal(r.valid, true);
  assert.equal(r.sensor, 'chamber');
  assert.equal(r.cycles, 2);
  assert.equal(r.maximumTemperatureC, 150);
  assert.equal(r.totalSeconds, r.cycleSeconds * 2);
  assert.equal(r.warnings.length, 2);
  assert.equal(reviewProfile(profile, 1, 1, 100).valid, false);
  assert.equal(reviewProfile({ ...profile, repeat: 0 }, 1, 1).valid, false);
  assert.equal(
    reviewProfile({ ...profile, board: true }, 1, 1).sensor,
    'board',
  );
  assert.ok(
    reviewProfile(
      profile,
      1,
      1,
      280,
      { model: '400', connectionVoltage: '230' },
      { model: '300', connectionVoltage: '380' },
    ).warnings.length,
  );
});
test('portable copies strip identity and names remain unique within 80 characters', () => {
  assert.equal(
    portableProfile({ ...profile, id: 'original', secret: 'no' }).id,
    undefined,
  );
  assert.equal(portableProfile({ ...profile, secret: 'no' }).secret, undefined);
  assert.equal(uniqueProfileName('A', ['A', 'A (2)']), 'A (3)');
  assert.equal(uniqueProfileName('A'.repeat(80), ['A'.repeat(80)]).length, 80);
});
test('batch imports create independent copies and reject invalid batches atomically', () => {
  const original = db.saveProfile(profile);
  const copies = db.importProfileCopies([profile, profile]);
  assert.deepEqual(
    copies.map((p) => p.name),
    ['Проверка (2)', 'Проверка (3)'],
  );
  assert.notEqual(copies[0].id, original.id);
  const before = db.listProfiles().length;
  assert.throws(() =>
    db.importProfileCopies([profile, { ...profile, repeat: -1 }]),
  );
  assert.equal(db.listProfiles().length, before);
  assert.deepEqual(db.findProfile(original.id), original);
  assert.equal(db.importProfileCopies([profile])[0].name, 'Проверка (4)');
});
test('preview/import/receive enforce review freshness and warnings without a destination PIN or unlocking settings', async () => {
  let busy = false;
  const app = express();
  app.use(express.json());
  app.use(
    createSettingsAccessRouter(
      () => false,
      () => null,
    ),
  );
  app.use(
    createProfileOperationsRouter(
      {
        knownRemote() {
          throw Error('Unknown oven');
        },
      },
      () => busy,
    ),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body) => {
    const r = await fetch(
      base + path,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Mercury-Client': 'a'.repeat(64),
            },
            body: JSON.stringify(body),
          },
    );
    return { status: r.status, body: await r.json() };
  };
  try {
    const stored = db.listProfiles()[0];
    assert.equal(
      (await request('/api/run/preview?profileId=' + stored.id)).status,
      200,
    );
    assert.equal(
      (await request('/api/profiles/import-preview', { profiles: [profile] }))
        .status,
      423,
    );
    const assessment = profileAssessment([profile]);
    const payload = {
      profiles: [profile],
      reviewKey: assessment.reviewKey,
      acceptWarnings: true,
    };
    assert.equal(
      (await request('/api/profile-transfer/receive', payload)).status,
      200,
    );
    busy = true;
    assert.equal(
      (
        await request('/api/profile-transfer/receive', {
          ...payload,
        })
      ).status,
      409,
    );
    busy = false;
    assert.equal(
      (
        await request('/api/profile-transfer/receive', {
          ...payload,
          reviewKey: 'stale',
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request('/api/profile-transfer/receive', {
          ...payload,
        })
      ).status,
      200,
    );
    assert.equal((await request('/api/settings-access')).body.unlocked, false);
    await request('/api/settings-access/unlock', { pin: '3457' });
    assert.equal(
      (await request('/api/profiles/import-preview', { profiles: [profile] }))
        .status,
      200,
    );
    assert.equal(
      (await request('/api/profiles/batch-import', payload)).status,
      200,
    );
    assert.equal(
      (
        await request('/api/profiles/' + stored.id + '/transfer-preview', {
          address: '8.8.8.8',
        })
      ).status,
      409,
    );
    const fast = {
      ...profile,
      points: [
        { second: 0, temperature: 50 },
        { second: 1, temperature: 260 },
      ],
    };
    const warning = profileAssessment([fast]);
    assert.equal(warning.hasWarnings, true);
    assert.equal(
      (
        await request('/api/profiles/batch-import', {
          profiles: [fast],
          reviewKey: warning.reviewKey,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request('/api/profiles/batch-import', {
          profiles: [{ ...profile, name: 'Changed' }],
          reviewKey: assessment.reviewKey,
          acceptWarnings: true,
        })
      ).status,
      409,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
