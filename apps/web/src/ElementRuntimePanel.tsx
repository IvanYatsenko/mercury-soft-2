/**
 * Просмотр моточасов и защищённое обнуление вместе с USB-историей.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

const labels: Record<string, string> = {
  topHeater: 'Верхний ТЭН',
  bottomHeater: 'Нижний ТЭН',
  infrared: 'Лампы — пара 1',
  infrared2: 'Лампы — пара 2',
  infrared3: 'Лампы — пара 3',
  convection: 'Конвекционный вентилятор',
  f1: 'Вентиляторы охлаждения',
  f2: 'Вентилятор охлаждения 2',
  controllerCooling: 'Вентилятор контрольной платы',
  raspberryCooling: 'Вентилятор Raspberry',
};
/** Форматирует моточасы в часы и минуты; секунды пользователю не показываются. */
export function runtimeDuration(seconds: number) {
  const n = Math.floor(seconds);
  return `${Math.floor(n / 3600)} ч ${Math.floor((n % 3600) / 60)} мин`;
}
type Report = {
  available: boolean;
  readOnly?: boolean;
  error?: string;
  data?: null | {
    since: string;
    updatedAt: string;
    configurations: Record<string, { onSeconds: Record<string, number> }>;
  };
};
/**
 * Отрисовывает ElementRuntimePanel: Просмотр моточасов и защищённое обнуление вместе с USB-историей.
 */
export function ElementRuntimePanel({
  advanced = false,
  disabled = false,
}: {
  advanced?: boolean;
  disabled?: boolean;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  /**
   * Выполняет явный сброс через защищённый серверный маршрут и обновляет отображаемые данные.
   */
  const reset = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/settings/element-runtime/reset', {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || 'Не удалось сбросить моточасы.');
      setReport(result);
      setConfirm(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Не удалось сбросить моточасы.',
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    /**
     * Читает актуальный серверный снимок для этого экрана; обработку результата выполняет владелец состояния.
     */
    const read = async () => {
      try {
        const response = await fetch('/api/settings/element-runtime', {
          signal: controller.signal,
          cache: 'no-store',
        });
        const data = await response.json();
        if (!controller.signal.aborted)
          setReport(
            response.ok
              ? data
              : {
                  available: false,
                  error: data.error || 'Моточасы недоступны.',
                },
          );
      } catch {
        if (!controller.signal.aborted)
          setReport({
            available: false,
            error: 'Не удалось прочитать моточасы.',
          });
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
  const configurations = Object.entries(report?.data?.configurations ?? {});
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700}>
          Моточасы элементов печи
        </Typography>
        {report?.readOnly && (
          <Alert severity="info">
            Резервные значения. USB недоступен; моточасы не обновляются.
          </Alert>
        )}
        {advanced && (
          <Button
            color="error"
            disabled={disabled || busy || !report?.available || report.readOnly}
            onClick={() => {
              setError('');
              setConfirm(true);
            }}
          >
            Сбросить моточасы
          </Button>
        )}
        {!report ? (
          <Typography>Загрузка…</Typography>
        ) : !report.available ? (
          <Alert severity="info">{report.error}</Alert>
        ) : !configurations.length ? (
          <Typography color="text.secondary">
            На USB пока нет записей моточасов.
          </Typography>
        ) : (
          <>
            {configurations.map(([key, entry]) => (
              <div key={key}>
                <TableContainer>
                  <Table size="small" aria-label="Моточасы элементов печи">
                    <TableHead>
                      <TableRow>
                        <TableCell>Элемент</TableCell>
                        <TableCell align="right">Наработка</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(entry.onSeconds).map(
                        ([name, seconds]) => (
                          <TableRow key={name}>
                            <TableCell sx={{ overflowWrap: 'anywhere' }}>
                              {labels[name] ?? name}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                                fontSize: 13,
                                px: 1,
                              }}
                            >
                              {runtimeDuration(seconds)}
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
            ))}
          </>
        )}
      </CardContent>
      <Dialog
        open={confirm}
        onClose={() => {
          if (!busy) setConfirm(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Сбросить моточасы и историю?</DialogTitle>
        <DialogContent>
          Наработка всех элементов и конфигураций будет обнулена. История
          запусков, графики и события профилей будут удалены.{' '}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirm(false)}>
            Отмена
          </Button>
          <Button disabled={busy} color="error" onClick={() => void reset()}>
            Сбросить
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
