/* Notifications only: intentionally no fetch handler, API cache or command queue. */
self.addEventListener('push', (event) => {
  let value = {};
  try {
    value = event.data?.json() ?? {};
  } catch {}
  const title =
    typeof value.title === 'string' ? value.title.slice(0, 160) : 'Меркурий';
  event.waitUntil(
    self.registration.showNotification(title, {
      body:
        typeof value.body === 'string'
          ? value.body.slice(0, 500)
          : 'Новое событие печи',
      icon: '/pc/mercury-icon.png',
      badge: '/pc/mercury-icon.png',
      tag: typeof value.tag === 'string' ? value.tag : 'mercury',
      data: { url: '/' },
      ...(typeof value.at === 'string' && Number.isFinite(Date.parse(value.at))
        ? { timestamp: Date.parse(value.at) }
        : {}),
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows)
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate('/');
          return client.focus();
        }
      return self.clients.openWindow('/');
    })(),
  );
});
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);
