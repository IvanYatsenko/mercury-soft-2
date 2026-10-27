import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  SvgIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import {
  buildRunPlan,
  type Profile,
  type ProfilePlan,
  type RunSample,
  type RunStatus,
  type TemperatureRate,
} from '@mercury/shared';
import { ProfileChart } from './ProfileChart';
import { RunProcessChart } from './RunProcessChart';

export type PcSection = 'profiles' | 'settings' | 'editor' | 'wifi' | 'history';
type Props = {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
  section: PcSection;
  onSection: (section: PcSection) => void;
  name: string;
  connectionLabel: string;
  connected: boolean;
  ready: boolean;
  profiles: Profile[];
  selected: Profile | undefined;
  draft: Profile | null;
  run: RunStatus | null;
  busy: boolean;
  runActive: boolean;
  windowOpen: boolean;
  onReady: () => void;
  temperature: number | null | undefined;
  chamber: number | null | undefined;
  board: number | null | undefined;
  doorOpen: boolean | undefined;
  lamps: boolean | null | undefined;
  heaters: boolean | null | undefined;
  fans: boolean | null | undefined;
  convection: boolean | null | undefined;
  canEdit: boolean;
  unlocked: boolean;
  advanced: boolean;
  onSelect: (profile: Profile) => void;
  onEdit: (profile: Profile, index: number) => void;
  onCreate: () => void;
  onSettings: () => void;
  onAdvancedAccess: () => void;
  onLock: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  keepHeat: boolean;
  keepHeatBusy: boolean;
  onKeepHeat: (enabled: boolean) => void;
  heatingRate: TemperatureRate;
  coolingRate: TemperatureRate;
  content: ReactNode;
  warning: string | null;
  critical: boolean;
};
const stateNames: Record<string, string> = {
  idle: 'Готова к работе',
  preparing: 'Подготовка',
  running: 'Выполнение профиля',
  cooling: 'Охлаждение',
  completed: 'Профиль завершён',
  stopped: 'Профиль остановлен',
  failed: 'Ошибка',
};
function duration(value: number) {
  const n = Math.max(0, Math.round(value));
  return (
    [
      Math.floor(n / 3600) ? Math.floor(n / 3600) + ' ч' : '',
      Math.floor((n % 3600) / 60) ? Math.floor((n % 3600) / 60) + ' мин' : '',
      n % 60 ? (n % 60) + ' с' : '',
    ]
      .filter(Boolean)
      .join(' ') || '0 с'
  );
}
function degrees(value: number | null | undefined) {
  return value == null ? '—' : Math.round(value) + '°';
}
function profileTime(
  profile: Profile,
  heating: TemperatureRate,
  cooling: TemperatureRate,
) {
  try {
    return duration(buildRunPlan(profile, heating, cooling).durationSeconds);
  } catch {
    return 'Не задано';
  }
}
function ProcessGraph({
  run,
  heating,
  cooling,
}: {
  run: RunStatus;
  heating: TemperatureRate;
  cooling: TemperatureRate;
}) {
  const [details, setDetails] = useState<{
    id: string;
    profile: Profile;
    samples: RunSample[];
    plan?: ProfilePlan;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!run.id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const id = run.id;
    const read = async () => {
      try {
        const response = await fetch('/api/history/' + encodeURIComponent(id), {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? 'Нет данных графика на USB-накопителе'
              : 'Не удалось получить график процесса',
          );
        const result = await response.json();
        if (!controller.signal.aborted) {
          setDetails({ ...result, id });
          setError('');
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Нет связи с сервером');
      } finally {
        if (
          !controller.signal.aborted &&
          ['running', 'preparing', 'cooling'].includes(run.state)
        )
          timer = setTimeout(() => void read(), 2000);
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [run.id, run.state]);
  return (
    <Stack sx={{ flex: 1, minHeight: 260 }}>
      {error && <Alert severity="warning">{error}</Alert>}
      {details?.id === run.id && details ? (
        <RunProcessChart
          profile={details.profile}
          samples={details.samples}
          cycle={run.cycle}
          savedPlan={details.plan}
          heatingRate={heating}
          coolingRate={cooling}
        />
      ) : (
        <Stack justifyContent="center" alignItems="center" sx={{ flex: 1 }}>
          <Typography color="text.secondary">
            {error ? 'График недоступен' : 'Загрузка графика…'}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 3, flex: 1, minWidth: 0 }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 26,
          fontWeight: 650,
          mt: 0.5,
          color: accent ? 'primary.main' : 'text.primary',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}
export function PcWorkspace(p: Props) {
  const [page, setPage] = useState<'overview' | 'profiles'>('overview');
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: p.mode,
          primary: { main: p.mode === 'dark' ? '#66dfc1' : '#087f6c' },
          background: {
            default: p.mode === 'dark' ? '#0a1220' : '#edf2f7',
            paper: p.mode === 'dark' ? '#111d2e' : '#ffffff',
          },
          text: {
            primary: p.mode === 'dark' ? '#e7eef8' : '#1a2940',
            secondary: p.mode === 'dark' ? '#90a2bb' : '#62738b',
          },
          divider: p.mode === 'dark' ? '#26354a' : '#dce4ee',
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily: 'Inter, Segoe UI, sans-serif',
          button: { textTransform: 'none', fontWeight: 600 },
        },
        components: {
          MuiButton: { styleOverrides: { root: { boxShadow: 'none' } } },
          MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
        },
      }),
    [p.mode],
  );
  const isOverview = p.section === 'profiles' && page === 'overview';
  const showProcess = !!p.run?.id && (p.runActive || p.windowOpen);
  const title =
    p.section === 'settings'
      ? 'Настройки'
      : p.section === 'history'
        ? 'История запусков'
        : p.section === 'editor'
          ? 'Редактор профиля'
          : p.section === 'wifi'
            ? 'Сеть и подключение'
            : page === 'profiles'
              ? 'Температурные профили'
              : 'Обзор печи';
  const percent =
    p.run && p.run.elapsedSeconds + p.run.remainingSeconds > 0
      ? (100 * p.run.elapsedSeconds) /
        (p.run.elapsedSeconds + p.run.remainingSeconds)
      : 0;
  const nav = (
    label: string,
    selected: boolean,
    onClick: () => void,
    locked = false,
  ) => (
    <Button
      fullWidth
      onClick={onClick}
      sx={{
        justifyContent: 'space-between',
        px: 2,
        py: 1.4,
        color: selected ? 'primary.main' : 'text.secondary',
        bgcolor: selected ? 'rgba(102,223,193,.10)' : 'transparent',
        borderRadius: 2,
      }}
    >
      {label}
      {locked && (
        <SvgIcon aria-label="Требуется PIN-код" sx={{ fontSize: 16 }}>
          <path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10h14V10a2 2 0 0 0-2-2ZM10 6a2 2 0 0 1 4 0v2h-4V6Zm3 10v2h-2v-2a2 2 0 1 1 2 0Z" />
        </SvgIcon>
      )}
    </Button>
  );
  const choose = (page: 'overview' | 'profiles') => {
    setPage(page);
    p.onSection('profiles');
  };
  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          height: '100%',
          minHeight: 600,
          display: 'grid',
          gridTemplateColumns: '210px minmax(0,1fr)',
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        <Stack
          component="nav"
          aria-label="Навигация ПК"
          sx={{
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: 2.5,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.2}
            sx={{ mb: 5, mt: 1 }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'background.default',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
              }}
            >
              M
            </Box>
            <Box>
              <Typography fontWeight={750} letterSpacing={1}>
                MERCURY
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Управление печью
              </Typography>
            </Box>
          </Stack>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ px: 2, mb: 1 }}
          >
            Панель печи
          </Typography>
          <Stack spacing={0.75}>
            {nav('Обзор печи', isOverview, () => choose('overview'))}
            {nav(
              'Профили',
              p.section === 'profiles' && page === 'profiles',
              () => choose('profiles'),
            )}
            {nav(
              'История запусков',
              p.section === 'history',
              () =>
                p.advanced ? p.onSection('history') : p.onAdvancedAccess(),
              !p.advanced,
            )}
            {nav(
              'Настройки',
              p.section === 'settings',
              p.onSettings,
              !p.unlocked,
            )}
            {nav('Сеть', p.section === 'wifi', () => p.onSection('wifi'))}
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: p.connected ? 'primary.main' : 'error.main',
                }}
              />
              <Typography variant="caption">
                {p.connected ? 'Печь подключена' : 'Нет связи с печью'}
              </Typography>
            </Stack>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.8, overflowWrap: 'anywhere' }}
            >
              {window.location.host}
            </Typography>
          </Paper>
          <Button
            color="inherit"
            onClick={p.onToggleMode}
            sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}
          >
            {p.mode === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          </Button>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 2, px: 1 }}
          >
            Mercury {__APP_VERSION__} · Web
          </Typography>
        </Stack>
        <Stack sx={{ minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <Stack
            component="header"
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 3.5, py: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                {p.name} / Панель печи
              </Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 650, mt: 0.4 }}>
                {title}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                label={p.critical ? 'Критическая ошибка' : p.connectionLabel}
                color={p.critical ? 'error' : p.ready ? 'success' : 'default'}
                variant="outlined"
              />
              {p.unlocked && (
                <Button size="small" onClick={p.onLock}>
                  Закрыть доступ
                </Button>
              )}
            </Stack>
          </Stack>
          <Box
            component="main"
            sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 3.5 }}
          >
            {p.critical && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Критическая ошибка
              </Alert>
            )}
            {p.warning && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {p.warning}
              </Alert>
            )}
            {isOverview ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) 270px',
                  gap: 2.5,
                  minHeight: '100%',
                }}
              >
                <Stack spacing={2.5} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1.5}>
                    <Stat
                      label="Камера"
                      value={degrees(p.connected ? p.chamber : null)}
                    />
                    <Stat
                      label="Датчик на плате"
                      value={degrees(p.connected ? p.board : null)}
                    />
                    <Stat
                      label={showProcess ? 'Осталось' : 'Длительность профиля'}
                      value={
                        showProcess
                          ? duration(p.run?.remainingSeconds ?? 0)
                          : p.selected
                            ? profileTime(
                                p.selected,
                                p.heatingRate,
                                p.coolingRate,
                              )
                            : '—'
                      }
                      accent
                    />
                  </Stack>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      flex: 1,
                      minHeight: 360,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="start"
                    >
                      <Box>
                        <Typography variant="overline" color="text.secondary">
                          {showProcess
                            ? 'Текущий процесс'
                            : 'Температурный профиль'}
                        </Typography>
                        <Typography
                          sx={{ fontSize: 20, fontWeight: 650, mt: 0.5 }}
                        >
                          {showProcess
                            ? p.run?.profileName
                            : (p.selected?.name ?? 'Выберите профиль')}
                        </Typography>
                      </Box>
                      {showProcess && (
                        <Chip
                          size="small"
                          label={
                            p.run?.paused
                              ? 'Пауза'
                              : stateNames[p.run?.state ?? 'idle']
                          }
                        />
                      )}
                    </Stack>
                    <Stack direction="row" spacing={2} sx={{ mt: 2, mb: 1 }}>
                      <Typography variant="caption" color="#66bb6a">
                        ━ Заданный профиль
                      </Typography>
                      {showProcess && (
                        <Typography variant="caption" color="#ffb74d">
                          ━ Фактическая температура
                        </Typography>
                      )}
                    </Stack>
                    {showProcess && p.run ? (
                      <ProcessGraph
                        run={p.run}
                        heating={p.heatingRate}
                        cooling={p.coolingRate}
                      />
                    ) : p.selected ? (
                      <ProfileChart
                        profile={p.selected}
                        showTitle={false}
                        heatingRate={p.heatingRate}
                        coolingRate={p.coolingRate}
                      />
                    ) : (
                      <Stack
                        sx={{ flex: 1 }}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Typography color="text.secondary">
                          Выберите профиль для просмотра графика
                        </Typography>
                        <Button
                          onClick={() => choose('profiles')}
                          sx={{ mt: 2 }}
                        >
                          Открыть профили
                        </Button>
                      </Stack>
                    )}
                    {showProcess && (
                      <>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, percent)}
                          sx={{ mt: 2, height: 5, borderRadius: 2 }}
                        />
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          sx={{ mt: 1 }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Цикл {p.run?.cycle} из {p.run?.cycles}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Прошло {duration(p.run?.elapsedSeconds ?? 0)}
                          </Typography>
                        </Stack>
                      </>
                    )}
                  </Paper>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="body2" color="text.secondary">
                      {p.selected?.board
                        ? 'Регулирование по датчику на плате'
                        : 'Регулирование по датчику камеры'}
                    </Typography>
                    <Button
                      onClick={() => choose('profiles')}
                      disabled={p.runActive}
                    >
                      Выбрать другой профиль →
                    </Button>
                  </Stack>
                </Stack>
                <Stack spacing={2}>
                  <Paper variant="outlined" sx={{ p: 2.5 }}>
                    <Typography variant="overline" color="text.secondary">
                      Управление
                    </Typography>
                    <Typography sx={{ fontSize: 19, fontWeight: 650, mt: 1 }}>
                      {p.run?.paused
                        ? 'На паузе'
                        : p.runActive
                          ? stateNames[p.run?.state ?? 'running']
                          : p.windowOpen
                            ? stateNames[p.run?.state ?? 'idle']
                            : p.keepHeat
                              ? 'Поддержание 100 °C'
                              : 'Готова к запуску'}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 48,
                        fontWeight: 650,
                        my: 2,
                        color: p.runActive ? '#ffb74d' : 'text.primary',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {degrees(
                        p.runActive
                          ? p.run?.measuredTemperatureC
                          : p.temperature,
                      )}
                      <Typography
                        component="span"
                        sx={{ fontSize: 20, color: 'text.secondary' }}
                      >
                        C
                      </Typography>
                    </Typography>
                    {p.runActive ? (
                      p.run?.paused ? (
                        <Stack spacing={1}>
                          <Button
                            variant="contained"
                            onClick={p.onResume}
                            disabled={p.busy}
                          >
                            Продолжить
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            onClick={p.onStop}
                            disabled={p.busy}
                          >
                            Остановить профиль
                          </Button>
                        </Stack>
                      ) : (
                        <Button
                          fullWidth
                          variant="contained"
                          color="warning"
                          onClick={p.onPause}
                          disabled={p.busy}
                        >
                          Приостановить
                        </Button>
                      )
                    ) : p.windowOpen && p.run?.id ? (
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={p.onReady}
                        disabled={p.busy || !p.run.canAcknowledge}
                      >
                        Готово
                      </Button>
                    ) : (
                      <Button
                        fullWidth
                        variant="contained"
                        sx={{ py: 1.3 }}
                        disabled={p.busy || !p.selected || !p.ready}
                        onClick={p.onStart}
                      >
                        Запустить профиль
                      </Button>
                    )}
                    <Divider sx={{ my: 2 }} />
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Box>
                        <Typography variant="body2">
                          Поддерживать 100 °C
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          После завершения работы
                        </Typography>
                      </Box>
                      <Switch
                        size="small"
                        checked={p.keepHeat}
                        disabled={p.keepHeatBusy}
                        onChange={(_, v) => p.onKeepHeat(v)}
                        inputProps={{ 'aria-label': 'Поддерживать 100 °C' }}
                      />
                    </Stack>
                  </Paper>
                  <Paper variant="outlined" sx={{ p: 2.5 }}>
                    <Typography variant="overline" color="text.secondary">
                      Оборудование
                    </Typography>
                    <Stack spacing={1.8} sx={{ mt: 2 }}>
                      {[
                        [
                          'Дверь',
                          p.doorOpen == null ? undefined : !p.doorOpen,
                          p.doorOpen ? 'Открыта' : 'Закрыта',
                        ],
                        ['Лампы', p.lamps],
                        ['ТЭНы', p.heaters],
                        ['Охлаждение', p.fans],
                        ['Конвекция', p.convection],
                      ].map(([label, value, text]) => (
                        <Stack
                          key={String(label)}
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <Typography variant="body2" color="text.secondary">
                            {label}
                          </Typography>
                          <Stack
                            direction="row"
                            spacing={0.8}
                            alignItems="center"
                          >
                            <Box
                              sx={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                bgcolor: value
                                  ? 'primary.main'
                                  : 'text.disabled',
                              }}
                            />
                            <Typography variant="caption">
                              {!p.connected || value == null
                                ? '—'
                                : (text ?? (value ? 'Вкл.' : 'Выкл.'))}
                            </Typography>
                          </Stack>
                        </Stack>
                      ))}
                    </Stack>
                  </Paper>
                  {p.advanced && showProcess && (
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Максимальное отклонение
                      </Typography>
                      <Typography
                        sx={{ fontSize: 28, fontWeight: 650, mt: 0.5 }}
                      >
                        Δ {Math.round(p.run?.maximumDeviationC ?? 0)} °C
                      </Typography>
                    </Paper>
                  )}
                </Stack>
              </Box>
            ) : p.section === 'profiles' ? (
              <Stack spacing={2.5}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography color="text.secondary">
                    {p.profiles.length} профилей · Выберите профиль для работы
                  </Typography>
                  {p.canEdit && (
                    <Button
                      variant="contained"
                      disabled={p.runActive}
                      onClick={p.onCreate}
                    >
                      + Создать профиль
                    </Button>
                  )}
                </Stack>
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                  <Table aria-label="Температурные профили">
                    <TableHead>
                      <TableRow>
                        <TableCell>Название</TableCell>
                        <TableCell>Режим</TableCell>
                        <TableCell>Датчик</TableCell>
                        <TableCell>Время</TableCell>
                        <TableCell>Действия</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {p.profiles.map((profile, index) => (
                        <TableRow
                          key={profile.id ?? index}
                          selected={p.selected?.id === profile.id}
                          sx={{ '& td': { py: 2.2 } }}
                        >
                          <TableCell>
                            <Typography fontWeight={600}>
                              {profile.name}
                            </Typography>
                            {p.selected?.id === profile.id && (
                              <Typography variant="caption" color="primary">
                                Выбран
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {profile.mode === 'manual' ? 'Ручной' : 'Простой'}
                          </TableCell>
                          <TableCell>
                            {profile.board ? 'На плате' : 'Камера'}
                          </TableCell>
                          <TableCell>
                            {profileTime(profile, p.heatingRate, p.coolingRate)}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button
                                disabled={p.runActive}
                                onClick={() => {
                                  p.onSelect(profile);
                                  choose('overview');
                                }}
                              >
                                Выбрать
                              </Button>
                              {p.canEdit && (
                                <Button
                                  disabled={p.runActive}
                                  onClick={() => p.onEdit(profile, index)}
                                >
                                  Изменить
                                </Button>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              </Stack>
            ) : p.section === 'editor' ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1.3fr) minmax(260px,1fr)',
                  gap: 3,
                }}
              >
                <Box>{p.content}</Box>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    height: 430,
                    position: 'sticky',
                    top: 0,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Typography variant="overline" color="text.secondary">
                    Предварительный просмотр
                  </Typography>
                  {p.draft && (
                    <ProfileChart
                      profile={p.draft}
                      heatingRate={p.heatingRate}
                      coolingRate={p.coolingRate}
                    />
                  )}
                </Paper>
              </Box>
            ) : (
              <Box sx={{ maxWidth: 1100, mx: 'auto' }}>{p.content}</Box>
            )}
          </Box>
        </Stack>
      </Box>
    </ThemeProvider>
  );
}
