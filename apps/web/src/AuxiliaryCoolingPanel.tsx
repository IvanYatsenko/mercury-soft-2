/**
 * Явная проверка охлаждения Raspberry и контрольной платы через сервер.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';

type Fan = {
  temperatureC: number | null;
  enabled: boolean | null;
  error: string;
  supported?: boolean;
};
type Cooling = { raspberry: Fan; controller: Fan };

/**
 * Отрисовывает AuxiliaryCoolingPanel: Явная проверка охлаждения Raspberry и контрольной платы через сервер.
 */
export function AuxiliaryCoolingPanel({
  disabled,
  connected,
}: {
  disabled: boolean;
  connected: boolean;
}) {
  const [status, setStatus] = useState<Cooling | null>(null);
  const [testing, setTesting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /**
   * Читает актуальный серверный снимок для этого экрана; обработку результата выполняет владелец состояния.
   */
  const read = async (signal?: AbortSignal) => {
    const response = await fetch('/api/controller/auxiliary-cooling', {
      ...(signal ? { signal } : {}),
      cache: 'no-store',
    });
    if (!response.ok)
      throw new Error('Не удалось прочитать охлаждение электроники.');
    const data = await response.json();
    if (!signal?.aborted) setStatus(data);
  };
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    /**
     * Повторно запрашивает состояние, пока экран открыт; очистка эффекта останавливает опрос.
     */
    const poll = async () => {
      try {
        await read(controller.signal);
      } catch {
        if (!controller.signal.aborted) setStatus(null);
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void poll(), 5000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  /** Отправляет явную команду проверки выбранного вспомогательного вентилятора. */
  const test = async (name: 'raspberry' | 'controller') => {
    setTesting(name);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/controller/auxiliary-cooling/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.error || 'Проверка не выполнена.');
      setNotice('Проверка завершена. Автоматическое управление восстановлено.');
      await read();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Проверка не выполнена.');
    } finally {
      setTesting('');
    }
  };
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography fontWeight={700}>Охлаждение электроники</Typography>
          <Typography variant="caption" color="text.secondary">
            Проверка включает вентилятор на 3 секунды. Если охлаждение
            необходимо, после проверки он останется включённым.
          </Typography>
          {(['raspberry', 'controller'] as const).map((name) => {
            const fan = status?.[name];
            const available =
              !!fan && (name === 'raspberry' ? fan.supported : connected);
            return (
              <Stack key={name} spacing={0.5}>
                <Typography variant="body2">
                  {name === 'raspberry' ? 'Raspberry' : 'Контрольная плата'}:{' '}
                  {available && fan.temperatureC !== null
                    ? `${Math.round(fan.temperatureC)} °C`
                    : '—'}{' '}
                  ·{' '}
                  {available && fan.enabled !== null
                    ? fan.enabled
                      ? 'Вентилятор включён'
                      : 'Вентилятор выключен'
                    : 'Недоступно'}
                </Typography>
                <Button
                  variant="outlined"
                  disabled={disabled || !!testing || !available}
                  onClick={() => void test(name)}
                  sx={{ minHeight: 44 }}
                >
                  {testing === name
                    ? 'Проверка…'
                    : name === 'raspberry'
                      ? 'Проверить вентилятор Raspberry'
                      : 'Проверить вентилятор контрольной платы'}
                </Button>
                {fan?.error && <Alert severity="warning">{fan.error}</Alert>}
              </Stack>
            );
          })}
          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}
        </Stack>
      </CardContent>
    </Card>
  );
}
