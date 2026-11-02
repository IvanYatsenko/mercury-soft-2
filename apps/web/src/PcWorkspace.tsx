/**
 * Адаптивный браузерный интерфейс ПК и телефона; не меняет компоновку локальной панели.
 */
import { workspaceTheme } from './workspaceTheme';
import {
  ActiveNotificationPanel,
  useActiveNotifications,
} from './ActiveNotifications';
import {
  StartReviewDialog,
  ProfileLibraryBar,
  ProfileRowTools,
} from './PcProfileTools';
import { FleetPage } from './FleetPage';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  useMediaQuery,
  Box,
  Button,
  Chip,
  IconButton,
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
} from '@mui/material';
import {
  buildRunPlan,
  type Profile,
  type ProfileSource,
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
  serverReachable: boolean;
  lastServerContact: number | null;
  source: ProfileSource;
  onDuplicate: (profile: Profile) => void;
  onImported: () => void;
  onResetDraft: () => void;
  draftDirty: boolean;
  section: PcSection;
  onSection: (section: PcSection, onApproved?: () => void) => void;
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
  onStart: (reviewKey: string, accepted: boolean, pin: string) => void;
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
/** Показывает компактную длительность без нулевых единиц времени. */
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
/** Форматирует целое температурное показание, сохраняя признак отсутствия данных. */
function degrees(value: number | null | undefined) {
  return value == null ? '—' : Math.round(value) + '°';
}
/** Рассчитывает длительность выбранного профиля для обзорного экрана. */
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
/**
 * Отрисовывает ProcessGraph: представление данных и действий родительского экрана.
 */
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
    /**
     * Читает актуальный серверный снимок для этого экрана; обработку результата выполняет владелец состояния.
     */
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
    <Stack
      sx={{
        flex: { xs: '0 0 auto', md: 1 },
        height: { xs: 180, md: 'auto' },
        minHeight: { xs: 0, md: 160 },
        minWidth: 0,
      }}
    >
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
/**
 * Отрисовывает Stat: представление данных и действий родительского экрана.
 */
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
      sx={{
        p: { xs: 1.25, md: 2 },
        borderRadius: '12px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: 'block',
          minHeight: { xs: 32, md: 0 },
          lineHeight: 1.4,
          overflowWrap: 'anywhere',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: accent ? 16 : 26, md: 26 },
          fontWeight: 650,
          mt: 0.5,
          color: accent ? 'primary.main' : 'text.primary',
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}
/**
 * Отрисовывает MobileNavIcon: представление данных и действий родительского экрана.
 */
function MobileNavIcon({
  name,
}: {
  name: 'oven' | 'profiles' | 'history' | 'settings' | 'more';
}) {
  const paths = {
    oven: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v3h14V5H5Zm0 5v9h14v-9H5Zm2 2h10v5H7v-5ZM7 6h2v1H7V6Zm8 0h2v1h-2V6Z',
    profiles: 'M4 3h16v18H4V3Zm2 2v14h12V5H6Zm2 10 3-5 3 3 2-4v8H8v-2Z',
    history:
      'M13 3a9 9 0 1 1-8.5 12H7a6.5 6.5 0 1 0 1-7H11v2H3V2h2v4a9 9 0 0 1 8-3Zm-1 4h2v5l3 2-1 1.7-4-2.7V7Z',
    settings:
      'M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L15 3h-4l-.4 3.1a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1L11 21h4l.4-3.1a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5ZM13 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z',
    more: 'M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
  };
  return (
    <SvgIcon sx={{ fontSize: 28 }} aria-hidden="true">
      <path d={paths[name]} />
    </SvgIcon>
  );
}

/**
 * Отрисовывает PcWorkspace: Адаптивный браузерный интерфейс ПК и телефона; не меняет компоновку локальной панели.
 */
export function PcWorkspace(props: Props) {
  const mobile = useMediaQuery('(max-width: 899px)');
  const activeNotifications = useActiveNotifications();
  const [moreOpen, setMoreOpen] = useState(false);
  const p = {
    ...props,
    connected: props.connected && props.serverReachable,
    ready: props.ready && props.serverReachable,
    canEdit: props.canEdit && props.serverReachable,
    busy: props.busy || !props.serverReachable,
    keepHeatBusy: props.keepHeatBusy || !props.serverReachable,
  };
  const [startReview, setStartReview] = useState(false);
  const [page, setPage] = useState<'overview' | 'profiles' | 'fleet'>(
    'overview',
  );
  const displayName = p.name;
  const theme = useMemo(() => workspaceTheme(p.mode), [p.mode]);
  const isOverview = p.section === 'profiles' && page === 'overview';
  const showProcess =
    p.run?.purpose !== 'calibration' &&
    !!p.run?.id &&
    (p.runActive || p.windowOpen);
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
              : page === 'fleet'
                ? 'Печи в сети'
                : 'Обзор печи';
  const percent =
    p.run && p.run.elapsedSeconds + p.run.remainingSeconds > 0
      ? (100 * p.run.elapsedSeconds) /
        (p.run.elapsedSeconds + p.run.remainingSeconds)
      : 0;
  /** Переключает страницу браузерной панели и закрывает временные меню. */
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
  /** Передаёт выбор профиля родительскому состоянию и возвращает к обзору. */
  const choose = (page: 'overview' | 'profiles' | 'fleet') => {
    p.onSection('profiles', () => setPage(page));
  };
  return (
    <ThemeProvider theme={theme}>
      <Snackbar
        open={Boolean(activeNotifications.toast)}
        autoHideDuration={activeNotifications.toast?.error ? null : 10000}
        onClose={activeNotifications.closeToast}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ mt: 'env(safe-area-inset-top)', maxWidth: 'calc(100% - 24px)' }}
      >
        <Alert
          severity={activeNotifications.toast?.error ? 'error' : 'success'}
          onClose={activeNotifications.closeToast}
          variant="filled"
        >
          {activeNotifications.toast?.text}
        </Alert>
      </Snackbar>
      <StartReviewDialog
        open={startReview}
        onClose={() => setStartReview(false)}
        profile={p.selected}
        onStart={p.onStart}
        disabled={p.busy || !p.ready}
      />
      <Box
        sx={{
          height: '100%',
          minHeight: mobile ? 0 : 600,
          display: 'grid',
          gridTemplateColumns: mobile ? 'minmax(0,1fr)' : '210px minmax(0,1fr)',
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        <Stack
          component="nav"
          aria-label="Навигация ПК"
          sx={{
            display: mobile ? 'none' : 'flex',
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: 2,
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
          <Stack spacing={0.75}>
            {nav('Обзор печи', isOverview, () => choose('overview'))}
            {nav(
              'Профили',
              p.section === 'profiles' && page === 'profiles',
              () => choose('profiles'),
            )}
            {nav('История запусков', p.section === 'history', () =>
              p.onSection('history'),
            )}
            {nav(
              'Настройки',
              p.section === 'settings',
              p.onSettings,
              !p.unlocked,
            )}
            {nav(
              'Печи в сети',
              p.section === 'profiles' && page === 'fleet',
              () => choose('fleet'),
            )}
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
            sx={{
              px: mobile ? 2 : 3.5,
              pt: mobile ? 'max(12px, env(safe-area-inset-top))' : 2,
              pb: mobile ? 1.5 : 2,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1, pr: 2 }}>
              {!mobile && (
                <Typography variant="caption" color="text.secondary">
                  {displayName}
                </Typography>
              )}
              <Typography
                sx={{
                  fontSize: mobile ? 20 : 24,
                  fontWeight: 650,
                  mt: mobile ? 0 : 0.4,
                  overflowWrap: 'anywhere',
                }}
              >
                {mobile && isOverview ? displayName : title}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              {mobile && p.unlocked && (
                <IconButton
                  aria-label="Заблокировать настройки"
                  title="Заблокировать настройки"
                  onClick={p.onLock}
                  sx={{ width: 44, height: 44, color: 'primary.main' }}
                >
                  <SvgIcon>
                    <path d="M7 14a5 5 0 1 1 4.9-6H22v4h-3v3h-3v-3h-4.1A5 5 0 0 1 7 14Zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                  </SvgIcon>
                </IconButton>
              )}
              {
                <Box
                  role="img"
                  aria-label={
                    !props.serverReachable
                      ? 'Нет связи с Raspberry'
                      : p.critical
                        ? 'Критическая ошибка'
                        : !p.connected
                          ? 'Нет связи с платой'
                          : p.ready
                            ? 'Плата готова к работе'
                            : 'Плата ожидает или инициализируется'
                  }
                  title={p.connectionLabel}
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor:
                      !props.serverReachable || !p.connected || p.critical
                        ? 'error.main'
                        : p.ready
                          ? 'success.main'
                          : 'warning.main',
                    boxShadow: '0 0 0 4px rgba(255,255,255,.04)',
                  }}
                />
              }
              {p.unlocked && !mobile && (
                <Button size="small" onClick={p.onLock}>
                  Закрыть доступ
                </Button>
              )}
              <IconButton
                onClick={p.onToggleMode}
                aria-label={p.mode === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                title={p.mode === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                sx={{ width: 44, height: 44, flexShrink: 0 }}
              >
                <SvgIcon>
                  <path
                    d={
                      p.mode === 'dark'
                        ? 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-1-6h2v4h-2Zm0 16h2v4h-2ZM2 11h4v2H2Zm16 0h4v2h-4ZM4.22 5.64l1.42-1.42 2.83 2.83-1.42 1.42Zm11.31 11.31 1.42-1.42 2.83 2.83-1.42 1.42ZM4.22 18.36l2.83-2.83 1.42 1.42-2.83 2.83ZM15.53 7.05l2.83-2.83 1.42 1.42-2.83 2.83Z'
                        : 'M9.37 5.51a7 7 0 0 0 9.12 9.12A7 7 0 1 1 9.37 5.51Z'
                    }
                  />
                </SvgIcon>
              </IconButton>
            </Stack>
          </Stack>
          <Box
            component="main"
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              p: mobile ? 1.5 : isOverview ? 2 : 3.5,
              pb: mobile
                ? 'calc(80px + env(safe-area-inset-bottom))'
                : undefined,
            }}
          >
            {p.critical && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Критическая ошибка
              </Alert>
            )}
            {!props.serverReachable && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Нет связи с Raspberry. Показания устарели, команды
                заблокированы.{' '}
                {props.lastServerContact
                  ? 'Последнее обновление: ' +
                    new Date(props.lastServerContact).toLocaleTimeString(
                      'ru-RU',
                    )
                  : ''}
              </Alert>
            )}
            {props.serverReachable && !p.connected && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Связь с Raspberry есть, но нет связи с платой управления.
              </Alert>
            )}
            {p.warning && p.connected && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {p.warning}
              </Alert>
            )}
            {p.section === 'profiles' && page === 'fleet' ? (
              <FleetPage unlocked={p.unlocked} onUnlock={p.onSettings} />
            ) : isOverview ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: mobile
                    ? 'minmax(0,1fr)'
                    : 'minmax(0,1fr) 270px',
                  gap: 1.5,
                  minHeight: 0,
                }}
              >
                <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1.5}>
                    <Stat
                      label="Камера"
                      value={degrees(
                        props.serverReachable && p.connected ? p.chamber : null,
                      )}
                    />
                    <Stat
                      label="Датчик на плате"
                      value={degrees(
                        props.serverReachable && p.connected ? p.board : null,
                      )}
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
                      p: 2,
                      flex: '0 0 auto',
                      height: mobile
                        ? showProcess
                          ? 'auto'
                          : 270
                        : 'clamp(210px, calc(100dvh - 320px), 360px)',
                      minHeight: 0,
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
                    <Stack
                      direction="row"
                      sx={{
                        mt: 2,
                        mb: 1,
                        gap: 1,
                        flexWrap: 'wrap',
                        flexShrink: 0,
                      }}
                    >
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
                  {mobile && isOverview && (
                    <Box
                      sx={{
                        p: 1.5,
                        bgcolor: 'background.paper',
                        borderTop: 1,
                        borderColor: 'divider',
                      }}
                    >
                      <Stack direction="row" spacing={1}>
                        {p.runActive ? (
                          p.run?.paused ? (
                            <>
                              <Button
                                fullWidth
                                variant="contained"
                                disabled={p.busy}
                                onClick={p.onResume}
                              >
                                Продолжить
                              </Button>
                              <Button
                                fullWidth
                                color="error"
                                variant="contained"
                                disabled={p.busy}
                                onClick={p.onStop}
                              >
                                Стоп
                              </Button>
                            </>
                          ) : (
                            <Button
                              fullWidth
                              variant="contained"
                              disabled={p.busy}
                              onClick={p.onPause}
                            >
                              Пауза
                            </Button>
                          )
                        ) : p.windowOpen ? (
                          <Button
                            fullWidth
                            color="success"
                            variant="contained"
                            disabled={p.busy}
                            onClick={p.onReady}
                          >
                            Готово
                          </Button>
                        ) : (
                          <Button
                            fullWidth
                            variant="contained"
                            disabled={p.busy || !p.ready || !p.selected}
                            onClick={() => setStartReview(true)}
                          >
                            Запустить профиль
                          </Button>
                        )}
                      </Stack>
                    </Box>
                  )}
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
                      disabled={p.runActive || !props.serverReachable}
                    >
                      Выбрать другой профиль →
                    </Button>
                  </Stack>
                </Stack>
                <Stack spacing={2}>
                  {mobile && (
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Typography>Поддерживать 100 °C</Typography>
                      <Switch
                        checked={p.keepHeat}
                        disabled={p.keepHeatBusy || p.runActive}
                        onChange={(_, v) => p.onKeepHeat(v)}
                      />
                    </Paper>
                  )}
                  <Paper
                    variant="outlined"
                    sx={{ p: 2, display: mobile ? 'none' : undefined }}
                  >
                    <Typography variant="overline" color="text.secondary">
                      Управление
                    </Typography>
                    <Typography sx={{ fontSize: 19, fontWeight: 650, mt: 1 }}>
                      {!p.connected
                        ? 'Команды недоступны'
                        : p.run?.paused
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
                        !p.connected
                          ? null
                          : p.runActive
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
                        onClick={() => setStartReview(true)}
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
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="overline" color="text.secondary">
                      Оборудование
                    </Typography>
                    <Stack spacing={1.2} sx={{ mt: 1.5 }}>
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
                    <Paper variant="outlined" sx={{ p: 2 }}>
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
                      disabled={p.runActive || !props.serverReachable}
                      onClick={p.onCreate}
                    >
                      + Создать профиль
                    </Button>
                  )}
                </Stack>
                <ProfileLibraryBar
                  profiles={p.profiles}
                  source={p.source}
                  canEdit={p.canEdit}
                  disabled={p.runActive || !props.serverReachable}
                  onImported={p.onImported}
                />
                {mobile ? (
                  <Stack spacing={1.5}>
                    {p.profiles.map((profile, index) => (
                      <Paper
                        key={profile.id ?? index}
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderColor:
                            p.selected?.id === profile.id
                              ? 'primary.main'
                              : 'divider',
                        }}
                      >
                        <Typography fontWeight={700}>{profile.name}</Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ my: 1 }}
                        >
                          {profile.board ? 'Датчик на плате' : 'Камера'} ·{' '}
                          {profileTime(profile, p.heatingRate, p.coolingRate)} ·{' '}
                          {profile.repeat ?? 1} цикл.
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button
                            disabled={p.runActive || !props.serverReachable}
                            onClick={() => {
                              p.onSelect(profile);
                              choose('overview');
                            }}
                          >
                            {p.selected?.id === profile.id
                              ? 'Выбран'
                              : 'Выбрать'}
                          </Button>
                          {p.canEdit && (
                            <Button
                              disabled={p.runActive || !props.serverReachable}
                              onClick={() => p.onEdit(profile, index)}
                            >
                              Изменить
                            </Button>
                          )}
                          <ProfileRowTools
                            profile={profile}
                            source={p.source}
                            canEdit={p.canEdit}
                            disabled={p.runActive || !props.serverReachable}
                            onDuplicate={() => p.onDuplicate(profile)}
                            onImported={p.onImported}
                          />
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
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
                              {profileTime(
                                profile,
                                p.heatingRate,
                                p.coolingRate,
                              )}
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={1}>
                                <Button
                                  disabled={
                                    p.runActive || !props.serverReachable
                                  }
                                  onClick={() => {
                                    p.onSelect(profile);
                                    choose('overview');
                                  }}
                                >
                                  Выбрать
                                </Button>
                                {p.canEdit && (
                                  <Button
                                    disabled={
                                      p.runActive || !props.serverReachable
                                    }
                                    onClick={() => p.onEdit(profile, index)}
                                  >
                                    Изменить
                                  </Button>
                                )}
                                <ProfileRowTools
                                  profile={profile}
                                  source={p.source}
                                  canEdit={p.canEdit}
                                  disabled={
                                    p.runActive || !props.serverReachable
                                  }
                                  onDuplicate={() => p.onDuplicate(profile)}
                                  onImported={p.onImported}
                                />
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>
                )}
              </Stack>
            ) : p.section === 'editor' ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: mobile
                    ? 'minmax(0,1fr)'
                    : 'minmax(0,1.3fr) minmax(260px,1fr)',
                  gap: 3,
                }}
              >
                <Box
                  component="fieldset"
                  disabled={!props.serverReachable}
                  sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
                >
                  {p.draftDirty && (
                    <Button
                      color="warning"
                      onClick={p.onResetDraft}
                      sx={{ mb: 2 }}
                    >
                      Отменить изменения
                    </Button>
                  )}
                  {p.content}
                </Box>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    height: mobile ? 260 : 430,
                    position: mobile ? 'static' : 'sticky',
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
              <Box
                component="fieldset"
                disabled={!props.serverReachable}
                sx={{
                  maxWidth: 1100,
                  mx: 'auto',
                  border: 0,
                  p: 0,
                  m: 0,
                  minWidth: 0,
                }}
              >
                {p.content}
              </Box>
            )}
          </Box>
        </Stack>
      </Box>
      {mobile && (
        <>
          <Box
            component="nav"
            aria-label="Мобильная навигация"
            sx={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(5,minmax(0,1fr))',
              '& button': { minWidth: 0, minHeight: 64, p: 1 },
              minHeight: 64,
              pb: 'env(safe-area-inset-bottom)',
              bgcolor: 'background.paper',
              borderTop: 1,
              borderColor: 'divider',
              zIndex: 1102,
            }}
          >
            <Button
              aria-label="Печь"
              title="Печь"
              onClick={() => choose('overview')}
              aria-current={isOverview ? 'page' : undefined}
              sx={{ color: isOverview ? 'primary.main' : 'text.secondary' }}
            >
              <MobileNavIcon name="oven" />
            </Button>
            <Button
              aria-label="Профили"
              title="Профили"
              onClick={() => choose('profiles')}
              aria-current={
                p.section === 'profiles' && page === 'profiles'
                  ? 'page'
                  : undefined
              }
              sx={{
                color:
                  p.section === 'profiles' && page === 'profiles'
                    ? 'primary.main'
                    : 'text.secondary',
              }}
            >
              <MobileNavIcon name="profiles" />
            </Button>
            <Button
              aria-label="История"
              title="История"
              onClick={() => p.onSection('history')}
              aria-current={p.section === 'history' ? 'page' : undefined}
              sx={{
                color:
                  p.section === 'history' ? 'primary.main' : 'text.secondary',
              }}
            >
              <MobileNavIcon name="history" />
            </Button>
            <Button
              aria-label="Настройки"
              title="Настройки"
              onClick={p.onSettings}
              aria-current={p.section === 'settings' ? 'page' : undefined}
              sx={{
                color:
                  p.section === 'settings' ? 'primary.main' : 'text.secondary',
              }}
            >
              <MobileNavIcon name="settings" />
            </Button>
            <Button
              aria-label="Ещё"
              title="Ещё"
              onClick={() => setMoreOpen(true)}
              sx={{ color: 'text.secondary' }}
            >
              <MobileNavIcon name="more" />
            </Button>
          </Box>
          <Dialog
            open={moreOpen}
            onClose={() => setMoreOpen(false)}
            fullWidth
            maxWidth="xs"
          >
            <DialogTitle>Меркурий</DialogTitle>
            <DialogContent>
              <Stack spacing={1}>
                <Button
                  onClick={() => {
                    setMoreOpen(false);
                    choose('fleet');
                  }}
                >
                  Печи в сети
                </Button>
                <ActiveNotificationPanel value={activeNotifications} compact />
                <Button onClick={() => setMoreOpen(false)}>Закрыть</Button>
              </Stack>
            </DialogContent>
          </Dialog>
        </>
      )}
    </ThemeProvider>
  );
}
