/**
 * Вспомогательный модуль activeNotifications; используется прикладными экранами и общими проверками.
 */
import { Router } from 'express';
import { onOvenEvent } from './ovenEvents.js';
/** Live-only SSE: no event history, backlog or replay after reconnect. */
export function createActiveNotificationsRouter() {
  const router = Router();
  let clients = 0;
  router.get('/api/notifications/events', (req, res) => {
    if (clients >= 32) {
      res.status(503).json({ error: 'Слишком много открытых панелей.' });
      return;
    }
    clients++;
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(': connected\n\n');
    let closed = false;
    /**
     * Завершает локальный сеанс и освобождает принадлежащие ему подписки или соединения.
     */
    const close = () => {
      if (closed) return;
      closed = true;
      clients--;
      clearInterval(timer);
      off();
      res.end();
    };
    const off = onOvenEvent((event) => {
      if (!closed && !res.write('data: ' + JSON.stringify(event) + '\n\n'))
        close();
    });
    const timer = setInterval(() => {
      if (!res.write(': heartbeat\n\n')) close();
    }, 15000);
    timer.unref();
    req.on('close', close);
    res.on('error', close);
  });
  return router;
}
