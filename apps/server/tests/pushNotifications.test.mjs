import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import webpush from 'web-push';
import {
  PushNotifications,
  validateSubscription,
  validatePushEvents,
  pushEnvironment,
} from '../dist/pushNotifications.js';
import { emitOvenEvent, onOvenEvent } from '../dist/ovenEvents.js';
function sub(id = 'phone') {
  const e = createECDH('prime256v1');
  e.generateKeys();
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/' + id,
    keys: {
      p256dh: e.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
}
function fixture(send = async () => ({})) {
  let saved = null;
  let writes = 0;
  const env = {
    enabled: true,
    reason: '',
    origin: 'https://oven.example',
    subject: 'mailto:oven@example.org',
  };
  const service = new PushNotifications(
    env,
    () => saved,
    async (c) => {
      saved = structuredClone(c);
      writes++;
    },
    send,
    () => 'М300 — линия 1',
  );
  return {
    service,
    get config() {
      return saved;
    },
    get writes() {
      return writes;
    },
  };
}
test('disabled configuration does not generate keys or write configuration; HTTPS and contact are required', async () => {
  assert.equal(pushEnvironment({}).enabled, false);
  assert.equal(
    pushEnvironment({
      MERCURY_PUBLIC_URL: 'http://10.0.0.1',
      MERCURY_PUSH_SUBJECT: 'mailto:a@example.org',
    }).enabled,
    false,
  );
  assert.equal(
    pushEnvironment({
      MERCURY_PUBLIC_URL: 'https://oven.example',
      MERCURY_PUSH_SUBJECT: 'mailto:a@example.org',
    }).enabled,
    true,
  );
  let writes = 0;
  const p = new PushNotifications(
    { enabled: false, reason: 'HTTPS', origin: '', subject: '' },
    () => null,
    async () => {
      writes++;
    },
  );
  assert.equal((await p.status()).enabled, false);
  assert.equal(writes, 0);
});
test('only known HTTPS browser push services and valid subscription keys are accepted', () => {
  const valid = sub();
  assert.deepEqual(validateSubscription(valid), valid);
  for (const endpoint of [
    'http://fcm.googleapis.com/x',
    'https://127.0.0.1/x',
    'https://10.10.1.88/x',
    'https://evil.example/x',
    'https://user:pass@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://fcm.googleapis.com.evil.example/x',
  ])
    assert.throws(() => validateSubscription({ ...valid, endpoint }));
  assert.throws(() =>
    validateSubscription({
      ...valid,
      keys: { ...valid.keys, auth: 'invalid' },
    }),
  );
  assert.throws(() => validatePushEvents(['unknown']));
  assert.throws(() => validatePushEvents([]));
  assert.deepEqual(validatePushEvents(['started', 'started']), ['started']);
});
test('keys persist once, phones are separate, preferences and unsubscribe affect only the matching subscription', async () => {
  const f = fixture(),
    one = sub('one'),
    two = sub('two');
  const status = await f.service.status();
  await f.service.status();
  assert.equal(f.writes, 1);
  assert.equal(typeof status.publicKey, 'string');
  assert.equal('privateKey' in status, false);
  await Promise.all([
    f.service.subscribe(one, ['started']),
    f.service.subscribe(two, ['completed']),
  ]);
  assert.equal(f.config.subscribers.length, 2);
  await f.service.subscribe(one, ['error']);
  assert.deepEqual((await f.service.subscription(one)).events, ['error']);
  await f.service.unsubscribe(one);
  assert.equal((await f.service.subscription(one)).subscribed, false);
  assert.equal((await f.service.subscription(two)).subscribed, true);
});
test('messages are encrypted with VAPID details and notifications do not retry or duplicate events', async () => {
  const sent = [];
  const f = fixture(async (s, p, o) => {
    const request = webpush.generateRequestDetails(s, p, o);
    assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
    assert.ok(request.headers.Authorization);
    sent.push(JSON.parse(p));
    return {};
  });
  await f.service.subscribe(sub(), ['started', 'completed']);
  const event = {
    kind: 'started',
    id: 'one',
    at: new Date().toISOString(),
    profileName: 'Паста',
    runId: 'run',
  };
  f.service.notify(event);
  f.service.notify(event);
  f.service.notify({ ...event, id: 'other', kind: 'error' });
  await f.service.settled();
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /М300/);
  assert.equal(sent[0].body, 'Паста');
  assert.equal(sent[0].url, '/');
});
test('expired subscriptions are removed while transient transport errors preserve the phone', async () => {
  const f = fixture(async (s) => {
    throw { statusCode: s.endpoint.endsWith('expired') ? 410 : 503 };
  });
  const expired = sub('expired'),
    temporary = sub('temporary');
  await f.service.subscribe(expired, ['error']);
  await f.service.subscribe(temporary, ['error']);
  f.service.notify({
    kind: 'error',
    id: 'error',
    at: new Date().toISOString(),
  });
  await f.service.settled();
  assert.equal((await f.service.subscription(expired)).subscribed, false);
  assert.equal((await f.service.subscription(temporary)).subscribed, true);
});
test('routes require the configured secure origin and PIN, never expose private credentials', async () => {
  const f = fixture();
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  app.use(f.service.createRouter());
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, headers = {}) => {
    const r = await fetch(base + '/api/push/' + path, {
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      headers: { 'Content-Type': 'application/json', ...headers },
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    const status = await request('status');
    assert.equal(status.status, 200);
    assert.equal('privateKey' in status.body, false);
    const body = { subscription: sub(), events: ['started'], pin: '3457' };
    const headers = {
      'X-Forwarded-Proto': 'https',
      Origin: 'https://oven.example',
    };
    assert.equal((await request('subscribe', body)).status, 400);
    assert.equal(
      (
        await request('subscribe', body, {
          ...headers,
          Origin: 'https://evil.example',
        })
      ).status,
      400,
    );
    assert.equal(
      (await request('subscribe', { ...body, pin: '0000' }, headers)).status,
      401,
    );
    assert.equal((await request('subscribe', body, headers)).status, 200);
    assert.equal(
      (await request('state', { subscription: body.subscription }, headers))
        .body.subscribed,
      true,
    );
    assert.equal((await request('unsubscribe', body, headers)).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
test('observers receive lifecycle events without propagating errors to oven control', async () => {
  const events = [];
  const off = onOvenEvent((e) => {
    events.push(e);
    throw Error('notification failed');
  });
  assert.doesNotThrow(() =>
    emitOvenEvent({ kind: 'completed', profileName: 'Паста', matched: true }),
  );
  await Promise.resolve();
  off();
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'completed');
  assert.ok(events[0].id);
  assert.ok(Date.parse(events[0].at));
});

test('optional notification failure and a queued unsubscribe cannot hold or change oven control', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  let sent = 0;
  const f = fixture(async () => {
    sent++;
    await gate;
    return {};
  });
  const phone = sub();
  await f.service.subscribe(phone, ['started']);
  assert.equal(
    f.service.notify({
      kind: 'started',
      id: 'first',
      at: new Date().toISOString(),
    }),
    undefined,
  );
  f.service.notify({
    kind: 'started',
    id: 'second',
    at: new Date().toISOString(),
  });
  await f.service.unsubscribe(phone);
  release();
  await f.service.settled();
  assert.equal(sent, 1);
});
