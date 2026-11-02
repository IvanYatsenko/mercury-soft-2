/**
 * Предпочтения и тексты уведомлений активного браузерного приложения.
 */
export const activeLabels: Record<string, string> = {
  started: 'Запуск профиля',
  cycleCompleted: 'Завершение цикла',
  completed: 'Завершение профиля',
  stopped: 'Остановка профиля',
  error: 'Ошибка печи',
  connectionLost: 'Потеря связи с платой',
};

export type Preferences = {
  enabled: boolean;
  sound: boolean;
  events: string[];
};
/** Загружает предпочтения локальных оповещений, сохраняя безопасные значения при повреждённом хранилище. */
export function initialAlertPreferences(value: string | null): Preferences {
  const fallback = {
    enabled: true,
    sound: false,
    events: ['started', 'completed', 'stopped', 'error', 'connectionLost'],
  };
  try {
    const p = JSON.parse(value ?? 'null');
    return p &&
      typeof p.enabled === 'boolean' &&
      typeof p.sound === 'boolean' &&
      Array.isArray(p.events)
      ? {
          enabled: p.enabled,
          sound: p.sound,
          events: p.events.filter(
            (v: unknown) =>
              typeof v === 'string' && Object.hasOwn(activeLabels, v),
          ),
        }
      : fallback;
  } catch {
    return fallback;
  }
}
export type Event = {
  id: string;
  at: string;
  kind: string;
  profileName?: string;
  cycle?: number;
  matched?: boolean;
  message?: string;
};
/** Преобразует тип события печи в пользовательский текст локального уведомления. */
export function activeAlertText(event: Event) {
  return [
    activeLabels[event.kind],
    event.profileName,
    event.cycle ? `Цикл ${event.cycle}` : '',
    event.matched === undefined
      ? ''
      : event.matched
        ? 'В допуске'
        : 'Есть отклонения',
    event.message,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 700);
}
