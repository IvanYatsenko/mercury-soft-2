const criticalMask = 2 | 4 | 8 | 64 | 128;
export function criticalBoardState(state: number | undefined): boolean {
  return (
    state !== undefined &&
    Number.isInteger(state) &&
    state >= 0 &&
    (state & criticalMask) !== 0
  );
}
export function criticalBoardError(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const match = message.match(
    /Ошибка платы:\s*(\d+)|Ошибка или отключение платы\s*\((\d+)\)/,
  );
  return match !== null && criticalBoardState(Number(match[1] ?? match[2]));
}
export function userError(message: string): string {
  return criticalBoardError(message) ? 'Критическая ошибка' : message;
}
