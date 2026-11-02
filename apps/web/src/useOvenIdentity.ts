/**
 * Периодическое чтение имени и описания печи для заголовков интерфейса.
 */
import { useEffect, useState } from 'react';

export type OvenIdentity = { name: string; description: string };

/** Загружает имя и описание текущей печи и возвращает состояние для заголовков интерфейса. */
export function useOvenIdentity() {
  const [identity, setIdentity] = useState<OvenIdentity>({
    name: '',
    description: '',
  });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    /**
     * Читает актуальный серверный снимок для этого экрана; обработку результата выполняет владелец состояния.
     */
    const read = async () => {
      try {
        const response = await fetch('/api/settings/oven-identity', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (response.ok) {
          const value = await response.json();
          if (!controller.signal.aborted) setIdentity(value);
        }
      } catch {
        /* Preserve the name while disconnected. */
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void read(), 10000);
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return [identity, setIdentity] as const;
}
