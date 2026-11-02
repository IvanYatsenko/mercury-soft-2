/**
 * Совместимое с Safari объединение отмены навигации и таймаута HTTP-запроса.
 */
/** Safari-compatible timeout/cancellation without AbortSignal.any or .timeout. */
export function requestSignal(
  milliseconds: number,
  parent?: AbortSignal,
): AbortSignal {
  const controller = new AbortController();
  if (parent?.aborted) {
    controller.abort();
    return controller.signal;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Отменяет связанное ожидание запроса и освобождает таймер ограничения времени. */
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
    controller.abort();
  };
  parent?.addEventListener('abort', cancel, { once: true });
  timer = setTimeout(cancel, milliseconds);
  return controller.signal;
}
