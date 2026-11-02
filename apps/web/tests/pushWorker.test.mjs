import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
test('push worker shows a notification and click opens only the oven root without API fetch or command replay', async () => {
  const handlers = {},
    shown = [],
    navigated = [];
  let work;
  const self = {
    location: { origin: 'https://oven.example' },
    registration: { showNotification: async (...a) => shown.push(a) },
    clients: {
      claim: async () => {},
      matchAll: async () => [
        {
          url: 'https://oven.example/',
          navigate: async (url) => navigated.push(url),
          focus: async () => {},
        },
      ],
      openWindow: async (url) => navigated.push(url),
    },
    addEventListener: (kind, callback) => (handlers[kind] = callback),
  };
  vm.runInNewContext(
    readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8'),
    { self, URL, Date, Number },
  );
  assert.equal(handlers.fetch, undefined);
  handlers.push({
    data: {
      json: () => ({
        title: 'М300',
        body: 'Профиль завершён',
        url: 'https://evil.example',
      }),
    },
    waitUntil: (p) => (work = p),
  });
  await work;
  assert.equal(shown[0][0], 'М300');
  assert.equal(shown[0][1].data.url, '/');
  handlers.notificationclick({
    notification: { close() {} },
    waitUntil: (p) => (work = p),
  });
  await work;
  assert.deepEqual(navigated, ['/']);
});
