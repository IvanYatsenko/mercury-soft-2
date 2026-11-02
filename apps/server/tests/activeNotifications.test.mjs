import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createActiveNotificationsRouter } from '../dist/activeNotifications.js';
import { emitOvenEvent } from '../dist/ovenEvents.js';
test('live SSE delivers only new events and does not replay on a new connection', async () => {
  const app = express();
  app.use(createActiveNotificationsRouter());
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/notifications/events`;
  const first = new AbortController(),
    second = new AbortController();
  try {
    emitOvenEvent({ kind: 'started', profileName: 'Old profile' });
    await Promise.resolve();
    const response = await fetch(url, { signal: first.signal });
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const reader = response.body.getReader();
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /connected/,
    );
    emitOvenEvent({
      kind: 'completed',
      profileName: 'Current profile',
      matched: true,
    });
    const payload = new TextDecoder().decode((await reader.read()).value);
    assert.match(payload, /Current profile/);
    assert.doesNotMatch(payload, /Old profile/);
    first.abort();
    const next = await fetch(url, { signal: second.signal });
    const nextReader = next.body.getReader();
    const initial = new TextDecoder().decode((await nextReader.read()).value);
    assert.doesNotMatch(initial, /profile/);
    emitOvenEvent({ kind: 'stopped', profileName: 'After reconnect' });
    assert.match(
      new TextDecoder().decode((await nextReader.read()).value),
      /After reconnect/,
    );
  } finally {
    first.abort();
    second.abort();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
