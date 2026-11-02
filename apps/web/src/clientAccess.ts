/**
 * Идентификатор и заголовки отдельной клиентской сессии; введённый PIN не сохраняется.
 */
/** Desktop browsers retain their own session identity; PINs are never stored. */
export function installClientAccess() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const generated = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  let id = generated;
  const desktop =
    !/Electron\//i.test(globalThis.navigator?.userAgent ?? '') &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 900px)').matches;
  if (desktop) {
    try {
      const saved = window.localStorage.getItem('mercury.desktop.client');
      if (saved && /^[a-f0-9]{64}$/.test(saved)) id = saved;
      else window.localStorage.setItem('mercury.desktop.client', id);
    } catch {
      /* Storage may be disabled; keep an isolated in-memory session. */
    }
  }
  const original = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href,
    );
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/'))
      return original(input, options);
    const headers = new Headers(
      options?.headers ??
        (input instanceof Request ? input.headers : undefined),
    );
    headers.set('X-Mercury-Client', id);
    return original(input, { ...options, headers });
  };
}
