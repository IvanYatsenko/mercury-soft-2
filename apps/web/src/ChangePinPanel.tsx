/**
 * Изменение операторского PIN для текущей печи с подтверждением на сервере.
 */
import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import { KeyboardTextField } from './OnScreenKeyboard';
/**
 * Отрисовывает ChangePinPanel: Изменение операторского PIN для текущей печи с подтверждением на сервере.
 */
export function ChangePinPanel() {
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [repeat, setRepeat] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  /**
   * Отправляет подтверждённые изменения на сервер и обновляет состояние экрана по результату.
   */
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/settings-access/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin: current, newPin: next }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Не удалось изменить PIN.');
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить PIN.');
    } finally {
      setBusy(false);
    }
  };
  /** Удаляет недопустимые символы при вводе нового операторского кода. */
  const numeric = (value: string) => value.replace(/\D/g, '').slice(0, 5);
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography fontWeight={700}>PIN-код оператора</Typography>
          <KeyboardTextField
            label="Текущий PIN-код"
            type="password"
            numericOnly
            value={current}
            onChange={(v) => setCurrent(numeric(v))}
            disabled={busy}
          />
          <KeyboardTextField
            label="Новый PIN-код"
            type="password"
            numericOnly
            value={next}
            onChange={(v) => setNext(numeric(v))}
            disabled={busy}
          />
          <KeyboardTextField
            label="Повторите новый PIN-код"
            type="password"
            numericOnly
            value={repeat}
            onChange={(v) => setRepeat(numeric(v))}
            disabled={busy}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button
            variant="outlined"
            disabled={
              busy ||
              ![4, 5].includes(current.length) ||
              ![4, 5].includes(next.length) ||
              next !== repeat
            }
            onClick={() => void save()}
          >
            Изменить PIN-код
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
