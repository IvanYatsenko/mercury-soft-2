import { userError } from './boardError';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import type { Profile, RunRecord, RunSample } from '@mercury/shared';

const stateNames = {
  idle: 'Ожидание',
  preparing: 'Подготовка до 50 °C',
  running: 'Выполнение',
  cooling: 'Охлаждение',
  completed: 'Завершён',
  stopped: 'Остановлен',
  failed: 'Ошибка',
};
export function HistoryPage({ onBack }: { onBack: () => void }) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selected, setSelected] = useState<RunRecord | null>(null);
  const [details, setDetails] = useState<{
    profile: Profile;
    samples: RunSample[];
    events: { at: string; message: string }[];
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/history', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Не удалось загрузить историю');
        return r.json() as Promise<RunRecord[]>;
      })
      .then(setRuns)
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetails(null);
    void fetch('/api/history/' + selected.id, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Не удалось загрузить измерения');
        return r.json();
      })
      .then(setDetails)
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [selected]);
  const samples = details?.samples ?? [];
  const duration = Math.max(1, samples.at(-1)?.elapsedSeconds ?? 1);
  const maximum = Math.max(
    50,
    ...samples.flatMap((s) => [
      s.targetTemperatureC,
      s.chamberTemperatureC,
      s.boardTemperatureC,
    ]),
  );
  const line = (
    field: 'targetTemperatureC' | 'chamberTemperatureC' | 'boardTemperatureC',
  ) =>
    samples
      .map(
        (s) =>
          `${30 + (s.elapsedSeconds / duration) * 370},${150 - (s[field] / maximum) * 125}`,
      )
      .join(' ');
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" alignItems="center">
        <Button
          onClick={() => (selected ? setSelected(null) : onBack())}
          sx={{ minHeight: 44 }}
        >
          ← Назад
        </Button>
        <Typography fontWeight={700}>История запусков</Typography>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {selected ? (
        <>
          <Typography fontWeight={700}>
            {selected.profileName} · {stateNames[selected.state]}
          </Typography>
          {selected.error && (
            <Alert severity="error">{userError(selected.error)}</Alert>
          )}
          <Typography variant="caption">
            {selected.simulated ? 'Виртуальная плата' : 'Реальная печь'} ·{' '}
            {new Date(selected.startedAt).toLocaleString('ru-RU')}
          </Typography>
          {details ? (
            <>
              <Box
                component="svg"
                viewBox="0 0 420 175"
                role="img"
                aria-label="Заданный и фактический графики"
                sx={{ width: '100%', height: 160, color: 'text.secondary' }}
              >
                <text x="3" y="16" fill="currentColor" fontSize="12">
                  °C
                </text>
                {[0, Math.round(maximum)].map((t) => (
                  <g key={t}>
                    <text
                      x="27"
                      y={154 - (t / maximum) * 125}
                      textAnchor="end"
                      fontSize="11"
                      fill="currentColor"
                    >
                      {t}
                    </text>
                    <line
                      x1="30"
                      x2="400"
                      y1={150 - (t / maximum) * 125}
                      y2={150 - (t / maximum) * 125}
                      stroke="currentColor"
                      opacity="0.2"
                    />
                  </g>
                ))}
                <polyline
                  points={line('targetTemperatureC')}
                  fill="none"
                  stroke="#ffb74d"
                  strokeWidth="2"
                />
                <polyline
                  points={line(
                    details.profile.board
                      ? 'boardTemperatureC'
                      : 'chamberTemperatureC',
                  )}
                  fill="none"
                  stroke="#66bb6a"
                  strokeWidth="2"
                />
                <text x="30" y="171" fill="currentColor" fontSize="12">
                  0
                </text>
                <text
                  x="400"
                  y="171"
                  textAnchor="end"
                  fill="currentColor"
                  fontSize="12"
                >
                  {Math.round(duration)} с
                </text>
              </Box>
              <Typography variant="caption">
                Оранжевый — профиль · зелёный — фактическая температура
              </Typography>
              {details.events.map((event, index) => (
                <Typography key={index} variant="caption">
                  {new Date(event.at).toLocaleTimeString('ru-RU')} ·{' '}
                  {event.message === 'completed'
                    ? 'Завершено'
                    : event.message === 'stopped'
                      ? 'Остановлено'
                      : event.message === 'failed'
                        ? 'Ошибка'
                        : event.message}
                </Typography>
              ))}
            </>
          ) : (
            <Typography>Загрузка измерений…</Typography>
          )}
        </>
      ) : runs.length ? (
        runs.map((run) => (
          <Button
            key={run.id}
            variant="outlined"
            onClick={() => setSelected(run)}
            sx={{
              minHeight: 48,
              textAlign: 'left',
              justifyContent: 'flex-start',
              textTransform: 'none',
            }}
          >
            <Stack>
              <Typography fontSize={13}>
                {run.profileName} · {stateNames[run.state]}
              </Typography>
              <Typography variant="caption">
                {new Date(run.startedAt).toLocaleString('ru-RU')} ·{' '}
                {run.simulated ? 'Виртуальная плата' : 'Печь'}
              </Typography>
            </Stack>
          </Button>
        ))
      ) : (
        <Typography>Запусков пока нет</Typography>
      )}
    </Stack>
  );
}
