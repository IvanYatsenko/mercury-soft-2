/**
 * Преобразование ошибок платы в пользовательский текст и признак критического состояния.
 */
const criticalMask = 2 | 4 | 8 | 64 | 128;
/** Определяет критическое состояние платы для красного пользовательского индикатора. */
export function criticalBoardState(state: number | undefined): boolean {
  return (
    state !== undefined &&
    Number.isInteger(state) &&
    state >= 0 &&
    (state & criticalMask) !== 0
  );
}
/** Формирует нейтральный пользовательский текст критической ошибки без внутренних деталей протокола. */
export function criticalBoardError(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const match = message.match(
    /Ошибка платы:\s*(\d+)|Ошибка или отключение платы\s*\((\d+)\)/,
  );
  return match !== null && criticalBoardState(Number(match[1] ?? match[2]));
}
/** Преобразует техническую ошибку в текст, пригодный для отображения оператору. */
export function userError(message: string): string {
  return criticalBoardError(message) ? 'Критическая ошибка' : message;
}
