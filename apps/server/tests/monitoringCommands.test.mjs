import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { monitoringCommands } from '../dist/monitoringCommands.js';
import { profileTemplates } from '../dist/profileTemplates.js';

test('monitoring commands require advanced PIN every time and validate JSON before starting', async () => {
  let starts = 0, stops = 0, received, unavailable = false, warnings = false, assessments = 0;
  const app = express();
  app.use(monitoringCommands({ pin: '34572', unavailable: () => unavailable,
    assess: () => { assessments++; return { valid: true, hasWarnings: warnings, reviews: [] }; },
    start: async p => { starts++; received = p; return { state: 'running' }; },
    stop: async () => { stops++; return { state: 'stopped' }; },
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, pin, compatibility) => fetch(base + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(pin ? { 'X-Mercury-Pin': pin } : {}),
    ...(compatibility === undefined ? {} : { 'X-Mercury-Accept-Warnings': compatibility }),
  }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    for (const pin of [undefined, '3457', 'wrong']) {
      assert.equal((await post('/profile/start', profileTemplates[0], pin)).status, 423);
      assert.equal((await post('/profile/stop', {}, pin)).status, 423);
    }
    assert.equal((await post('/profile/start', {}, '34572')).status, 400);
    assert.equal((await post('/profile/start', '{', '34572')).status, 400);
    assert.equal(starts, 0);
    assert.equal((await post('/profile/start', profileTemplates[0], '34572')).status, 200);
    assert.equal(received.name, profileTemplates[0].name);
    assert.ok(received.id);
    warnings = true;
    assert.equal((await post('/profile/start', profileTemplates[0], '34572', 'true')).status, 409);
    const before = assessments;
    assert.equal((await post('/profile/start', profileTemplates[0], '34572', 'false')).status, 200);
    assert.equal(assessments, before);
    assert.equal((await post('/profile/start', {}, '34572', 'false')).status, 400);
    assert.equal((await post('/profile/start', profileTemplates[0], '34572', 'invalid')).status, 400);
    assert.equal((await post('/profile/start', { profile: profileTemplates[0], pin: '34572' })).status, 409);
    assert.equal((await post('/profile/start', { profile: profileTemplates[0], pin: '34572', acceptWarnings: true })).status, 200);
    assert.equal((await post('/profile/stop', {}, '34572')).status, 200);
    assert.equal(stops, 1);
    unavailable = true;
    assert.equal((await post('/profile/start', profileTemplates[0], '34572')).status, 503);
    assert.equal(starts, 3);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
