/**
 * Живые события процесса для интерфейса, мониторинга и звука; наблюдатели не должны ломать управление.
 */
export type OvenEventKind =
  | 'started'
  | 'cycleCompleted'
  | 'completed'
  | 'stopped'
  | 'error'
  | 'connectionLost';
export type OvenEvent = {
  kind: OvenEventKind;
  id: string;
  at: string;
  profileName?: string | null;
  runId?: string | null;
  cycle?: number;
  matched?: boolean;
  message?: string;
};
import { randomUUID } from 'node:crypto';
const listeners = new Set<(event: OvenEvent) => void>();
/**
 * Подписывает слушатель и возвращает функцию удаления; владелец должен вызвать её при завершении своей сессии.
 */
export function onOvenEvent(listener: (event: OvenEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Notification failures must never change oven control. */
export function emitOvenEvent(value: Omit<OvenEvent, 'id' | 'at'>) {
  const event = { ...value, id: randomUUID(), at: new Date().toISOString() };
  queueMicrotask(() => {
    for (const listener of listeners)
      try {
        listener(event);
      } catch {
        /* An observer must not affect control. */
      }
  });
}
