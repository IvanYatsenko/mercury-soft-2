import type { TemperatureRate } from '@mercury/shared';
import { Alert, Box, Button, Dialog, Stack, Typography } from '@mui/material';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  Profile,
  ProfilePlan,
  RunSample,
  RunStatus,
} from '@mercury/shared';
import { RunProcessChart } from './RunProcessChart';
import { userError } from './boardError';

function time(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return (
    [
      Math.floor(total / 3600) ? `${Math.floor(total / 3600)} часов` : '',
      Math.floor((total % 3600) / 60)
        ? `${Math.floor((total % 3600) / 60)} мин`
        : '',
      total % 60 ? `${total % 60} с` : '',
    ]
      .filter(Boolean)
      .join(' ') || '0 с'
  );
}

export function RunProcessWindow({
  open,
  status,
  busy,
  onStop,
  onPause,
  onResume,
  onClose,
  heatingRate = 0.7,
  coolingRate = 0.4,
  indicators,
  fanWarning,
  criticalBoard,
  advancedAccess,
}: {
  open: boolean;
  status: RunStatus | null;
  busy: boolean;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onClose: () => void;
  heatingRate?: TemperatureRate | undefined;
  coolingRate?: TemperatureRate | undefined;
  indicators: ReactNode;
  fanWarning: { message: string; blink: boolean } | null;
  criticalBoard: boolean;
  advancedAccess: boolean;
}) {
  const [details, setDetails] = useState<{
    id: string;
    profile: Profile;
    samples: RunSample[];
    plan?: ProfilePlan | null;
  } | null>(null);
  const [chartError, setChartError] = useState('');
  useEffect(() => {
    if (!open || !status?.id) return;
    const id = status.id;
    const controller = new AbortController();
    let timer: number | undefined;
    async function read() {
      try {
        const response = await fetch('/api/history/' + encodeURIComponent(id), {
          signal: controller.signal,
        });
        if (response.status === 404) {
          if (!controller.signal.aborted) {
            setDetails(null);
            setChartError('Нет данных графика на USB-накопителе');
          }
          return;
        }
        if (!response.ok) throw new Error('Не удалось загрузить график');
        const result = await response.json();
        if (!controller.signal.aborted) {
          setDetails({ id, ...result });
          setChartError('');
        }
      } catch {
        if (!controller.signal.aborted)
          setChartError('График не обновляется: нет связи с сервером');
      } finally {
        if (
          !controller.signal.aborted &&
          (status?.state === 'preparing' ||
            status?.state === 'running' ||
            status?.state === 'cooling')
        )
          timer = window.setTimeout(() => void read(), 2000);
      }
    }
    void read();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, status?.id, status?.state]);
  const active =
    status?.state === 'preparing' ||
    status?.state === 'running' ||
    status?.state === 'cooling';
  const finished =
    !busy && ['completed', 'stopped', 'failed'].includes(status?.state ?? '');
  const label = busy
    ? 'Отправка команды…'
    : status?.paused
      ? 'Пауза'
      : status?.state === 'preparing'
        ? `Подготовка до ${Math.round(status.targetTemperatureC ?? 50)} °C`
        : status?.state === 'running'
          ? 'Выполнение профиля'
          : status?.state === 'cooling'
            ? 'Охлаждение'
            : status?.state === 'completed'
              ? 'Профиль завершён'
              : status?.state === 'stopped'
                ? 'Профиль остановлен'
                : status?.state === 'failed'
                  ? criticalBoard
                    ? ''
                    : 'Ошибка'
                  : 'Запуск…';
  return (
    <Dialog
      open={open}
      fullScreen
      disableEscapeKeyDown={!finished}
      onClose={() => {
        if (finished) onClose();
      }}
      aria-labelledby="run-window-title"
      slotProps={{
        paper: {
          sx: {
            position: 'relative',
            '&::after':
              !criticalBoard && fanWarning?.blink && active && !status?.paused
                ? {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    zIndex: 1,
                    animation: 'fan-warning-pulse 2s ease-in-out infinite',
                  }
                : undefined,
            '@keyframes fan-warning-pulse': {
              '0%, 100%': {
                boxShadow: 'inset 0 0 20px 4px rgba(255, 193, 7, 0.15)',
              },
              '50%': { boxShadow: 'inset 0 0 32px 8px rgba(255, 193, 7, 0.8)' },
            },
          },
        },
      }}
    >
      <Stack direction="row" sx={{ height: '100%', minHeight: 320 }}>
        <Stack sx={{ flex: 1, minWidth: 0, p: 1, gap: 0.5 }}>
          <Typography id="run-window-title" fontWeight={700} noWrap>
            {status?.profileName ?? 'Запуск профиля'}
          </Typography>
          {fanWarning && active && (
            <Alert
              severity="warning"
              sx={{ py: 0, '& .MuiAlert-message': { fontSize: 12 } }}
            >
              {fanWarning.message}
            </Alert>
          )}
          {(status?.state !== 'running' || status?.paused) && (
            <Typography
              color={
                status?.state === 'failed' ? 'error.main' : 'text.secondary'
              }
            >
              {label}
            </Typography>
          )}
          {details?.id === status?.id && details ? (
            <RunProcessChart
              profile={details.profile}
              savedPlan={details.plan}
              samples={details.samples}
              cycle={status?.cycle ?? 1}
              heatingRate={heatingRate}
              coolingRate={coolingRate}
            />
          ) : (
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption">
                {chartError ? 'График недоступен' : 'Загрузка графика…'}
              </Typography>
            </Box>
          )}
          {status?.doorOpen && active && (
            <Alert severity="warning" sx={{ py: 0 }}>
              Дверь открыта — нагрев выключен
            </Alert>
          )}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
          >
            <Typography
              sx={{ fontSize: 30, fontWeight: 700, color: '#ffb74d' }}
            >
              {status?.measuredTemperatureC == null
                ? '—'
                : `${Math.round(status.measuredTemperatureC)} °C`}
            </Typography>
            <Stack sx={{ textAlign: 'right' }}>
              {status && status.cycles > 1 && (
                <Typography variant="caption">
                  Цикл: {status.cycle} / {status.cycles}
                </Typography>
              )}
              {active && (
                <Typography
                  sx={{ color: 'success.main', fontSize: 18, fontWeight: 700 }}
                >
                  {time(status?.remainingSeconds ?? 0)}
                </Typography>
              )}
            </Stack>
          </Stack>
          {chartError && (
            <Typography variant="caption" color="warning.main">
              {chartError}
            </Typography>
          )}
          {(status?.error || criticalBoard) && (
            <Alert severity="error" sx={{ maxHeight: 90, overflowY: 'auto' }}>
              {criticalBoard ? 'Критическая ошибка' : userError(status!.error!)}
            </Alert>
          )}
          {finished ? (
            <Button
              fullWidth
              variant="contained"
              color="success"
              onClick={onClose}
              disabled={busy}
              sx={{ minHeight: 48 }}
            >
              Готово
            </Button>
          ) : status?.paused ? (
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                variant="contained"
                color="success"
                disabled={busy}
                onClick={onResume}
                sx={{ minHeight: 48 }}
              >
                Продолжить
              </Button>
              <Button
                fullWidth
                variant="contained"
                color="error"
                disabled={busy}
                onClick={onStop}
                sx={{ minHeight: 48 }}
              >
                Стоп
              </Button>
            </Stack>
          ) : (
            <Button
              fullWidth
              variant="contained"
              color="warning"
              disabled={busy || !active}
              onClick={onPause}
              sx={{ minHeight: 48 }}
            >
              Пауза
            </Button>
          )}
        </Stack>
        <Stack
          component="aside"
          aria-label="Состояние элементов печи"
          justifyContent="center"
          sx={{
            width: 38,
            flexShrink: 0,
            borderLeft: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          {indicators}
          {advancedAccess && status?.id && (
            <Box
              aria-label={`Максимальное отклонение от графика: ${Math.round(status.maximumDeviationC ?? 0)} °C`}
              sx={{ textAlign: 'center', mt: 1, lineHeight: 1.3 }}
            >
              <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>
                Δ max
              </Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                {Math.round(status.maximumDeviationC ?? 0)}°
              </Typography>
            </Box>
          )}
        </Stack>
      </Stack>
    </Dialog>
  );
}
