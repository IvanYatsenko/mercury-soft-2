/**
 * Мастер калибровки выбранной термопары. Нагрев требует явного действия; таблица сохраняется отдельно от программы.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Typography,
  FormControlLabel,
  Radio,
  RadioGroup,
  Slider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  useMediaQuery,
} from '@mui/material';
import { KeyboardTextField } from './OnScreenKeyboard';
type Sensor = 'chamber' | 'board';
type Status = {
  key: string;
  tables: Record<Sensor, { target: number; raw: number; measured: number }[]>;
  session: null | {
    runId: string;
    sensor: Sensor;
    target: number;
    saved: boolean;
  };
  run: null | {
    state: string;
    purpose?: string;
    measuredTemperatureC: number | null;
    calibrationStableSeconds?: number;
    remainingSeconds: number;
    error: string | null;
  };
  canSave: boolean;
};
/**
 * Отрисовывает CalibrationPanel: Мастер калибровки выбранной термопары. Нагрев требует явного действия; таблица сохраняется отдельно от программы.
 */
export function CalibrationPanel({ disabled = false }: { disabled?: boolean }) {
  const compact =
    useMediaQuery('(max-width: 899px)') ||
    /Electron\//i.test(navigator.userAgent);
  const [open, setOpen] = useState(false),
    [sensor, setSensor] = useState<Sensor | ''>(''),
    [target, setTarget] = useState(150),
    [measured, setMeasured] = useState('150'),
    [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmReset, setConfirmReset] = useState(false);
  const active =
    !!status?.run &&
    ['preparing', 'running', 'cooling'].includes(status.run.state);
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    /**
     * Читает актуальный серверный снимок для этого экрана; обработку результата выполняет владелец состояния.
     */
    const read = async () => {
      try {
        const r = await fetch('/api/settings/calibration', {
          signal: c.signal,
          cache: 'no-store',
        });
        const v = await r.json();
        if (!c.signal.aborted) {
          if (r.ok) setStatus(v);
          else setError(v.error || 'Не удалось прочитать калибровку.');
        }
      } catch {
        if (!c.signal.aborted) setError('Нет связи с печью.');
      } finally {
        if (!c.signal.aborted) timer = setTimeout(read, 2000);
      }
    };
    void read();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, []);
  /** Отправляет действие текущей процедуры и обновляет её состояние; ошибки остаются в мастере. */
  async function command(action: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/settings/calibration/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error || 'Операция не выполнена.');
      setStatus(v);
      setConfirmReset(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const selected = active ? (status?.session?.sensor ?? sensor) : sensor;
  const tables = selected ? (status?.tables[selected] ?? []) : [];
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="subtitle1" fontWeight={700}>
            Калибровка печи
          </Typography>
          <Typography variant="body2">
            Сравнение с внешним термометром. Поправки датчиков камеры и платы
            хранятся отдельно и сохраняются при обновлении ПО.
          </Typography>
          <Button
            variant="outlined"
            disabled={busy || (disabled && !status?.session)}
            onClick={() => {
              setSensor('');
              if (status?.session) {
                setTarget(status.session.target);
                setMeasured(String(status.session.target));
              }
              setOpen(true);
            }}
          >
            Открыть калибровку
          </Button>
          {active && (
            <Alert severity="warning">
              Идёт калибровка. Не оставляйте печь без наблюдения.
            </Alert>
          )}
        </Stack>
      </CardContent>
      <Dialog
        open={open}
        fullScreen={compact}
        fullWidth
        maxWidth="sm"
        onClose={() => {
          if (!active && !busy) setOpen(false);
        }}
      >
        <DialogTitle sx={compact ? { py: 1, fontSize: 18 } : {}}>
          Калибровка печи
        </DialogTitle>
        <DialogContent dividers sx={compact ? { p: 1.5 } : {}}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            {!selected ? (
              <>
                <Typography fontWeight={700}>
                  Какой датчик калибруем?
                </Typography>
                <RadioGroup
                  value={selected}
                  onChange={(e) => setSensor(e.target.value as Sensor)}
                >
                  <FormControlLabel
                    value="chamber"
                    disabled={busy || active}
                    control={<Radio />}
                    label="Датчик камеры"
                  />
                  <FormControlLabel
                    value="board"
                    disabled={busy || active}
                    control={<Radio />}
                    label="Датчик на плате"
                  />
                </RadioGroup>
              </>
            ) : (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography fontWeight={700}>
                  {selected === 'board' ? 'Датчик на плате' : 'Датчик камеры'}
                </Typography>
                <Button disabled={busy || active} onClick={() => setSensor('')}>
                  Изменить
                </Button>
              </Stack>
            )}
            {selected && (
              <>
                <Typography>Температура калибровки: {target} °C</Typography>
                <Slider
                  aria-label="Температура калибровки"
                  min={60}
                  max={260}
                  step={5}
                  value={target}
                  disabled={busy || active}
                  valueLabelDisplay="auto"
                  onChange={(_, v) => {
                    setTarget(v as number);
                    setMeasured(String(v));
                  }}
                />
                <Alert severity="info">
                  Разместите внешний термометр у выбранного датчика. Запишите
                  его показание по сигналу после 60 секунд выдержки. Нагрев
                  затем отключается.
                </Alert>
                {status?.session && status.session.sensor === selected && (
                  <>
                    <Typography>
                      {status.run?.state === 'preparing'
                        ? 'Подготовка'
                        : status.run?.state === 'running'
                          ? 'Нагрев и выдержка'
                          : status.session.saved
                            ? 'Поправка сохранена'
                            : status.run?.state === 'completed'
                              ? 'Выдержка завершена'
                              : 'Процесс остановлен'}{' '}
                      · {status.session.target} °C ·{' '}
                      {status.run?.measuredTemperatureC == null
                        ? '—'
                        : Math.round(status.run.measuredTemperatureC) + ' °C'}
                      {' · Стабильно: '}
                      {status.run?.calibrationStableSeconds ?? 0} с
                    </Typography>
                    {status.run?.error && (
                      <Alert severity="error">{status.run.error}</Alert>
                    )}
                    {status.canSave && (
                      <>
                        <KeyboardTextField
                          label="Температура внешнего термометра, °C"
                          numericOnly
                          value={measured}
                          onChange={setMeasured}
                          disabled={busy}
                        />
                        <Button
                          variant="contained"
                          disabled={
                            busy ||
                            !/^\d+$/.test(measured) ||
                            selected !== status.session.sensor
                          }
                          onClick={() =>
                            void command('save', {
                              runId: status.session!.runId,
                              measured: Number(measured),
                            })
                          }
                        >
                          Сохранить поправку
                        </Button>
                      </>
                    )}
                    {status.run?.state === 'completed' &&
                      !status.canSave &&
                      !status.session.saved && (
                        <Alert severity="warning">
                          Температура не стабилизировалась у заданной точки.
                          Поправка недоступна; повторите процедуру.
                        </Alert>
                      )}
                  </>
                )}
                <Typography variant="subtitle2">
                  Таблица выбранного датчика
                </Typography>
                {!tables.length ? (
                  <Typography>
                    Поправок нет: используются исходные показания.
                  </Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Уставка, °C</TableCell>
                        <TableCell>Без поправки, °C</TableCell>
                        <TableCell>Эталон, °C</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tables.map((p) => (
                        <TableRow key={p.target}>
                          <TableCell>{p.target}</TableCell>
                          <TableCell>{Math.round(p.raw)}</TableCell>
                          <TableCell>{p.measured}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <Button
                  color="warning"
                  disabled={busy || active || disabled || !tables.length}
                  onClick={() => setConfirmReset(true)}
                >
                  Сбросить калибровку выбранного датчика
                </Button>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {selected &&
            !active &&
            !(status?.canSave && status.session?.sensor === selected) && (
              <Button
                variant="contained"
                disabled={busy || disabled}
                onClick={() =>
                  void command('start', { sensor: selected, target })
                }
              >
                Начать нагрев
              </Button>
            )}
          {active && (
            <Button
              color="error"
              variant="contained"
              disabled={busy}
              onClick={() =>
                void command('stop', { runId: status?.session?.runId })
              }
            >
              Остановить
            </Button>
          )}
          <Button disabled={busy || active} onClick={() => setOpen(false)}>
            Закрыть
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={confirmReset}
        onClose={() => {
          if (!busy) setConfirmReset(false);
        }}
      >
        <DialogTitle>Сбросить калибровку?</DialogTitle>
        <DialogContent>
          Поправки выбранного датчика будут удалены. Калибровка второго датчика,
          профили и история сохранятся.
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirmReset(false)}>
            Отмена
          </Button>
          <Button
            color="warning"
            disabled={busy}
            onClick={() => void command('reset', { sensor: selected })}
          >
            Сбросить
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
