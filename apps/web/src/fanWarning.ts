export function fanWarning(
  frequency: number | null | undefined,
  reference: number,
  enabled: boolean,
  convectionOn: boolean,
): { message: string; blink: boolean } | null {
  if (
    !enabled ||
    !convectionOn ||
    !Number.isFinite(reference) ||
    reference <= 0
  )
    return null;
  if (frequency == null || !Number.isFinite(frequency) || frequency < 0)
    return {
      message:
        'Нет данных об оборотах конвекции. Профиль может выполняться неточно.',
      blink: false,
    };
  const ratio = frequency / reference;
  if (ratio >= 0.5) return null;
  return {
    message: `${ratio < 0.2 ? 'Обороты конвекции ниже 20% эталона.' : 'Обороты конвекции ниже 50% эталона.'} Профиль может выполняться неточно.`,
    blink: ratio < 0.2,
  };
}
