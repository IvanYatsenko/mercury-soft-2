/**
 * Выбор браузерной компоновки; Electron всегда использует интерфейс локальной панели.
 */
/** Electron keeps the appliance UI at every window size. */
export function isPcLayout(userAgent: string, _wide: boolean): boolean {
  return !/Electron\//i.test(userAgent);
}
