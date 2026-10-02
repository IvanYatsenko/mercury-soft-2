import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  SvgIcon,
  Typography,
} from '@mui/material';
import type { OvenModel, OvenSelection, Profile } from '@mercury/shared';
import { OvenSelectionForm, type SelectionDraft } from './OvenSelectionForm';
import { ProfileEditorPage } from './ProfileEditorPage';
import { SettingsPage, type OvenSettings } from './SettingsPage';
import { WifiPage, type WifiStatus } from './WifiPage';

type AppProps = {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
};

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)} мин`;
}

function formatWorkDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [
    ...(hours ? [`${hours} ч`] : []),
    ...(minutes || hours ? [`${minutes} мин`] : []),
    ...(remainingSeconds || (!hours && !minutes)
      ? [`${remainingSeconds} с`]
      : []),
  ].join(' ');
}

function temperatureColor(temperature: number | null | undefined) {
  if (temperature == null) return 'text.disabled';
  if (temperature < 50) return 'success.main';
  if (temperature < 250) return 'warning.main';
  return 'error.main';
}

function ProfileMetric({
  kind,
  label,
  value,
  color = 'text.primary',
}: {
  kind: 'temperature' | 'duration' | 'repeat' | 'total';
  label: string;
  value: string;
  color?: string;
}) {
  const paths = {
    temperature:
      'M15 13V5a3 3 0 0 0-6 0v8a5 5 0 1 0 6 0ZM12 3a2 2 0 0 1 2 2v8.5a4 4 0 1 1-4 0V5a2 2 0 0 1 2-2Zm-1 3v8.2a3 3 0 1 0 2 0V6h-2Z',
    duration:
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 2v7l5 3 1-1.7-4-2.3V6h-2Z',
    repeat:
      'M17 2v3H7a5 5 0 0 0-5 5v2h2v-2a3 3 0 0 1 3-3h10v3l5-4-5-4ZM7 22v-3h10a5 5 0 0 0 5-5v-2h-2v2a3 3 0 0 1-3 3H7v-3l-5 4 5 4Z',
    total:
      'M6 2v2h2v3a4 4 0 0 0 1.8 3.3L12 12l-2.2 1.7A4 4 0 0 0 8 17v3H6v2h12v-2h-2v-3a4 4 0 0 0-1.8-3.3L12 12l2.2-1.7A4 4 0 0 0 16 7V4h2V2H6Zm4 2h4v3a2 2 0 0 1-.9 1.7L12 9.5l-1.1-.8A2 2 0 0 1 10 7V4Zm2 10.5 1.1.8A2 2 0 0 1 14 17v3h-4v-3a2 2 0 0 1 .9-1.7l1.1-.8Z',
  };

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <SvgIcon sx={{ fontSize: 15, color: 'text.secondary', flexShrink: 0 }}>
        <path d={paths[kind]} />
      </SvgIcon>
      <Typography variant="caption" sx={{ fontSize: 11, lineHeight: 1.3 }}>
        {label}:{' '}
        <Box component="span" sx={{ color, fontWeight: 600 }}>
          {value}
        </Box>
      </Typography>
    </Stack>
  );
}

type ControllerStatus = {
  connected: boolean;
  boardType?: '220V' | '230V' | '380V' | 'unknown';
  ready?: boolean;
  state?: number;
  port?: string;
  simulated?: boolean;
  error?: string;
  telemetry?: {
    chamberTemperatureC: number | null;
    boardTemperatureC: number | null;
    convectionFanHz: number | null;
    lamps: boolean | null;
    heaters: boolean | null;
    fans: boolean | null;
    convection: boolean | null;
  };
};

type IndicatorKind = 'lamps' | 'heaters' | 'fans' | 'convection';

function IndicatorSymbol({ kind }: { kind: IndicatorKind }) {
  if (kind === 'lamps') {
    return (
      <SvgIcon fontSize="small">
        <path d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.75V17h8v-2.25A7 7 0 0 0 12 2zm2 11.7V15h-4v-1.3a5 5 0 1 1 4 0zM9 18h6v1H9z" />
      </SvgIcon>
    );
  }
  if (kind === 'heaters') {
    return (
      <SvgIcon fontSize="small">
        <path
          d="M5 20c0-2 2-2 2-4s-2-2-2-4 2-2 2-4M11 20c0-2 2-2 2-4s-2-2-2-4 2-2 2-4M17 20c0-2 2-2 2-4s-2-2-2-4 2-2 2-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </SvgIcon>
    );
  }
  return (
    <SvgIcon fontSize="small">
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10c-2-3-1-7 2-7 2 0 3 3 2 5l-2 3M14 12c3-2 7-1 7 2 0 2-3 3-5 2l-3-2M12 14c2 3 1 7-2 7-2 0-3-3-2-5l2-3M10 12c-3 2-7 1-7-2 0-2 3-3 5-2l3 2" />
      {kind === 'convection' && (
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      )}
    </SvgIcon>
  );
}

function indicator(
  kind: IndicatorKind,
  label: string,
  value: boolean | null | undefined,
) {
  return (
    <Box
      role="img"
      aria-label={`${label}: ${value == null ? 'нет данных' : value ? 'включено' : 'выключено'}`}
      title={`${label}: ${value == null ? 'нет данных' : value ? 'включено' : 'выключено'}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        color:
          value == null
            ? 'text.disabled'
            : value
              ? 'success.main'
              : 'text.secondary',
      }}
    >
      <IndicatorSymbol kind={kind} />
    </Box>
  );
}

type OvenConfigurationResponse = {
  selected: OvenSelection | null;
  models: { model: OvenModel; name: string }[];
  error?: string;
};

function boardIndicator(status: ControllerStatus | null) {
  if (!status)
    return { color: 'warning.main', label: 'Проверка связи с платой' };
  if (!status.connected)
    return { color: 'error.main', label: 'Нет связи с платой' };
  if (status.ready && status.state !== undefined && (status.state & 1) !== 0)
    return { color: 'success.main', label: 'Плата готова к работе' };
  return {
    color: 'warning.main',
    label: 'Плата ожидает действия или инициализируется',
  };
}

export function App({ mode, onToggleMode }: AppProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileTemplates, setProfileTemplates] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    'profiles' | 'settings' | 'editor' | 'wifi'
  >('profiles');
  const [draftProfile, setDraftProfile] = useState<Profile | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<OvenSettings>({
    convectionEnabled: true,
    fanReferenceRpm: 1500,
    reactToFanErrors: true,
    soundOnErrors: true,
    thermalProtection: true,
    thermocoupleCorrection: false,
  });
  const [notice, setNotice] = useState('');
  const [ovenConfiguration, setOvenConfiguration] =
    useState<OvenConfigurationResponse | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(
    null,
  );
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft>({
    ovenModel: null,
    connectionVoltage: null,
  });
  const [savingSelection, setSavingSelection] = useState(false);
  const [controllerAction, setControllerAction] = useState(false);
  const [convectionChanging, setConvectionChanging] = useState(false);
  const [controllerStatus, setControllerStatus] =
    useState<ControllerStatus | null>(null);
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const [powerOffDialogOpen, setPowerOffDialogOpen] = useState(false);
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(-1);
  const isFullPage =
    activeSection === 'settings' ||
    activeSection === 'editor' ||
    activeSection === 'wifi';
  const contentRef = useRef<HTMLElement | null>(null);

  const scrollContent = (direction: -1 | 1) => {
    contentRef.current?.scrollBy({ top: direction * 180, behavior: 'smooth' });
  };

  const saveOvenSelection = async () => {
    if (!selectionDraft.ovenModel || !selectionDraft.connectionVoltage) return;
    setSavingSelection(true);
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectionDraft),
      });
      const result = (await response.json()) as {
        selected?: OvenSelection;
        error?: string;
      };
      if (!response.ok || !result.selected) {
        throw new Error(result.error ?? 'Не удалось сохранить настройки');
      }
      setOvenConfiguration((current) =>
        current ? { ...current, selected: result.selected ?? null } : current,
      );
      setSelectionDraft(result.selected);
      setConfigurationError(null);
      setNotice('Модель и подключение печи сохранены');
    } catch (saveError) {
      setConfigurationError(
        saveError instanceof Error
          ? saveError.message
          : 'Не удалось сохранить настройки',
      );
    } finally {
      setSavingSelection(false);
    }
  };

  const openSettings = () => {
    if (ovenConfiguration?.selected)
      setSelectionDraft(ovenConfiguration.selected);
    setConfigurationError(null);
    setActiveSection('settings');
  };

  const changeConvection = async (enabled: boolean) => {
    setConvectionChanging(true);
    try {
      const response = await fetch('/api/controller/convection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const result = (await response.json()) as ControllerStatus;
      if (!response.ok)
        throw new Error(result.error ?? 'Не удалось переключить вентилятор.');
      setControllerStatus(result);
      setSettings((current) => ({ ...current, convectionEnabled: enabled }));
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Не удалось переключить вентилятор.',
      );
    } finally {
      setConvectionChanging(false);
    }
  };

  const closeSettings = () => {
    if (ovenConfiguration?.selected)
      setSelectionDraft(ovenConfiguration.selected);
    setConfigurationError(null);
    setActiveSection('profiles');
  };

  const beginEditing = (profile: Profile, index: number | null) => {
    setDraftProfile(structuredClone(profile));
    setEditingIndex(index);
    setSelectedProfile(profile.name);
    setActiveSection('editor');
  };

  const createProfile = () => {
    setSelectedTemplate(-1);
    setTemplatePickerOpen(true);
  };

  const continueWithTemplate = () => {
    const blankProfile: Profile = {
      mode: 'manual',
      name: 'Новый профиль',
      board: false,
      points: [{ second: 0, temperature: 30 }],
      shelves: [
        { second: 0, temperature: 30 },
        { second: 0, temperature: 30 },
        { second: 0, temperature: 30 },
      ],
    };

    const template =
      selectedTemplate < 0 ? blankProfile : profileTemplates[selectedTemplate];
    if (!template) return;

    setTemplatePickerOpen(false);
    beginEditing(structuredClone(template), null);
  };

  const saveDraft = () => {
    if (!draftProfile) return;

    setProfiles((current) => {
      if (editingIndex === null) return [...current, draftProfile];
      return current.map((profile, index) =>
        index === editingIndex ? draftProfile : profile,
      );
    });
    setSelectedProfile(draftProfile.name);
    setDraftProfile(null);
    setEditingIndex(null);
    setActiveSection('profiles');
    setNotice('Сохранено в браузере; на сервер профиль пока не записан');
  };

  const cancelEditing = () => {
    setDraftProfile(null);
    setEditingIndex(null);
    setActiveSection('profiles');
  };

  const powerOffBoard = async () => {
    setControllerAction(true);
    try {
      const response = await fetch('/api/controller/poweroff', {
        method: 'POST',
      });
      const result = (await response.json()) as {
        error?: string;
        port?: string;
        simulated?: boolean;
        connected?: boolean;
        ready?: boolean;
        state?: number;
      };
      if (!response.ok) {
        const message = result.error?.includes('504 timeout')
          ? `Нет подтверждения команды poweroff [5] от платы по ${result.port ?? 'COM-порту'} (504). Проверь питание платы и закрой программы, которые могут занимать этот порт.`
          : (result.error ?? `Сервер ответил с ошибкой ${response.status}`);
        throw new Error(message);
      }
      setNotice(
        result.simulated
          ? 'Симуляция: плата выключена'
          : 'Команда выключения отправлена плате',
      );
    } catch (commandError) {
      setNotice(
        commandError instanceof Error
          ? commandError.message
          : 'Не удалось отправить команду',
      );
    } finally {
      setControllerAction(false);
      setPowerOffDialogOpen(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | undefined;

    async function loadConfiguration() {
      try {
        const response = await fetch('/api/config', {
          signal: controller.signal,
        });
        const result = (await response.json()) as OvenConfigurationResponse;
        if (!response.ok)
          throw new Error(result.error ?? 'Не удалось прочитать config.json');
        setOvenConfiguration(result);
        setSelectionDraft(
          result.selected ?? { ovenModel: null, connectionVoltage: null },
        );
        setConfigurationError(null);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setConfigurationError(
          loadError instanceof Error ? loadError.message : 'Сервер недоступен',
        );
        retryTimer = window.setTimeout(() => void loadConfiguration(), 2000);
      }
    }

    void loadConfiguration();
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: number | undefined;

    async function readStatus() {
      try {
        const response = await fetch('/api/controller/check', {
          signal: controller.signal,
        });
        const result = (await response.json()) as ControllerStatus;
        if (active) setControllerStatus(result);
      } catch (checkError) {
        if (!active || controller.signal.aborted) return;
        setControllerStatus({
          connected: false,
          error:
            checkError instanceof Error
              ? checkError.message
              : 'Сервер недоступен',
        });
      } finally {
        if (active) timer = window.setTimeout(() => void readStatus(), 2000);
      }
    }

    void readStatus();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    async function readWifi() {
      try {
        const response = await fetch('/api/wifi/status', {
          signal: controller.signal,
        });
        const result = (await response.json()) as WifiStatus;
        if (!controller.signal.aborted)
          setWifiStatus(
            response.ok
              ? result
              : {
                  available: false,
                  enabled: false,
                  connected: false,
                  ssid: null,
                  device: null,
                  error: result.error ?? 'Не удалось узнать состояние Wi-Fi.',
                },
          );
      } catch {
        if (!controller.signal.aborted)
          setWifiStatus({
            available: false,
            enabled: false,
            connected: false,
            ssid: null,
            device: null,
            error: 'Сервер недоступен.',
          });
      } finally {
        if (!controller.signal.aborted)
          timer = window.setTimeout(() => void readWifi(), 10_000);
      }
    }
    void readWifi();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | undefined;

    async function loadProfiles() {
      try {
        const response = await fetch('/api/profile-templates', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Сервер ответил с ошибкой ${response.status}`);
        }

        const data = (await response.json()) as Profile[];
        setProfiles(data);
        setProfileTemplates(data);
        setSelectedProfile(data[0]?.name ?? null);
        setError(null);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError')
          return;
        setError('Сервер недоступен. Повторяем подключение…');
        retryTimer = window.setTimeout(() => void loadProfiles(), 2000);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadProfiles();
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, []);

  if (!ovenConfiguration?.selected) {
    return (
      <Box
        sx={{
          height: '100dvh',
          maxWidth: 480,
          mx: 'auto',
          p: 1.5,
          overflowY: 'auto',
          bgcolor: 'background.paper',
        }}
      >
        <Stack spacing={1.25}>
          <Typography variant="h6">Первый запуск</Typography>
          {configurationError && (
            <Alert severity="error">{configurationError}</Alert>
          )}
          {ovenConfiguration ? (
            <OvenSelectionForm
              models={ovenConfiguration.models}
              value={selectionDraft}
              onChange={setSelectionDraft}
              onSave={() => void saveOvenSelection()}
              saving={savingSelection}
              detectedBoardType={controllerStatus?.boardType}
            />
          ) : (
            <Typography>Загрузка настроек…</Typography>
          )}
        </Stack>
      </Box>
    );
  }

  const selectedOvenName =
    ovenConfiguration.models.find(
      ({ model }) => model === ovenConfiguration.selected?.ovenModel,
    )?.name ?? 'Меркурий';
  const activeProfile = profiles.find(
    (profile) => profile.name === selectedProfile,
  );
  const profileUsesBoardSensor = activeProfile?.board ?? false;
  const profileDuration = activeProfile?.points.reduce(
    (total, point) => total + point.second,
    0,
  );
  const profileMaxTemperature = activeProfile?.points.reduce<number | null>(
    (maximum, point) =>
      maximum === null
        ? point.temperature
        : Math.max(maximum, point.temperature),
    null,
  );
  const displayedTemperature = controllerStatus?.connected
    ? profileUsesBoardSensor
      ? controllerStatus.telemetry?.boardTemperatureC
      : controllerStatus.telemetry?.chamberTemperatureC
    : null;
  const boardConnection = boardIndicator(controllerStatus);
  const sensorTemperature = (
    label: string,
    shortLabel: string,
    value: number | null | undefined,
  ) => (
    <Typography
      variant="caption"
      title={`${label}: ${value == null ? 'нет данных' : `${value} °C`}`}
      aria-label={`${label}: ${value == null ? 'нет данных' : `${value} °C`}`}
      sx={{
        color: temperatureColor(value),
        fontSize: 10,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {shortLabel} {value == null ? '—' : `${value}°`}
    </Typography>
  );

  return (
    <Box
      sx={{
        height: '100dvh',
        minHeight: 320,
        p: { xs: 0, sm: 2 },
        bgcolor: 'background.default',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 1000,
          height: '100%',
          minHeight: 320,
          mx: 'auto',
          display: 'grid',
          gridTemplateRows: isFullPage
            ? 'minmax(0, 1fr)'
            : '36px minmax(0, 1fr)',
          overflow: 'hidden',
          bgcolor: 'background.paper',
          border: { xs: 0, sm: 1 },
          borderColor: 'divider',
          borderRadius: { xs: 0, sm: 1 },
        }}
      >
        {!isFullPage && (
          <Box
            component="header"
            sx={{
              px: 1.25,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'action.hover',
            }}
          >
            <Box
              role="img"
              aria-label={boardConnection.label}
              title={
                controllerStatus?.connected === false
                  ? `${boardConnection.label}. Переподключение выполняется автоматически.${controllerStatus.error ? ` ${controllerStatus.error}` : ''}`
                  : boardConnection.label
              }
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: boardConnection.color,
                flexShrink: 0,
              }}
            />
            <ButtonBase
              component="button"
              aria-label={`О программе ${selectedOvenName}`}
              onClick={() => setAboutDialogOpen(true)}
              sx={{
                flex: 1,
                minWidth: 0,
                justifyContent: 'flex-start',
                textAlign: 'left',
              }}
            >
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                {selectedOvenName}
              </Typography>
            </ButtonBase>
            <IconButton
              aria-label={
                wifiStatus?.connected
                  ? `Wi-Fi: ${wifiStatus.ssid ?? 'подключено'}`
                  : 'Настроить Wi-Fi'
              }
              title={
                wifiStatus?.connected
                  ? `Wi-Fi: ${wifiStatus.ssid ?? 'подключено'}`
                  : (wifiStatus?.error ?? 'Wi-Fi не подключён')
              }
              onClick={() => setActiveSection('wifi')}
              size="small"
              sx={{
                p: 0.5,
                color: wifiStatus?.connected
                  ? 'success.main'
                  : wifiStatus?.available
                    ? 'text.secondary'
                    : 'text.disabled',
              }}
            >
              <SvgIcon fontSize="small">
                <path d="M1 9l2 2c5-5 13-5 18 0l2-2C17 3 7 3 1 9zm8 8 3 3 3-3c-1.65-1.65-4.35-1.65-6 0zm-4-4 2 2c2.76-2.76 7.24-2.76 10 0l2-2c-3.86-3.86-10.14-3.86-14 0z" />
              </SvgIcon>
            </IconButton>
            <IconButton
              aria-label="Выключить плату"
              title="Выключение платы: poweroff [5]"
              disabled={controllerAction}
              onClick={() => setPowerOffDialogOpen(true)}
              size="small"
              sx={{ p: 0.5 }}
            >
              <SvgIcon sx={{ fontSize: 16 }}>
                <path d="M11 2h2v10h-2V2Zm-4.6 3.4 1.4 1.4a7 7 0 1 0 8.4 0l1.4-1.4a9 9 0 1 1-11.2 0Z" />
              </SvgIcon>
            </IconButton>
            <IconButton
              aria-label="Переключить тему"
              onClick={onToggleMode}
              size="small"
              sx={{ ml: 0.5 }}
            >
              <Typography component="span" variant="caption">
                {mode === 'dark' ? '☀' : '☾'}
              </Typography>
            </IconButton>
          </Box>
        )}

        <Box
          component="main"
          sx={{
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            display: isFullPage ? 'block' : 'grid',
            gridTemplateColumns: isFullPage
              ? undefined
              : {
                  xs: 'minmax(176px, 0.82fr) minmax(0, 1fr)',
                  sm: 'minmax(230px, 0.78fr) minmax(0, 1fr)',
                },
          }}
        >
          {!isFullPage && (
            <Stack
              component="section"
              aria-label="Состояние печи"
              spacing={0.6}
              sx={{
                p: 0.75,
                minWidth: 0,
                minHeight: 0,
                height: '100%',
                borderRight: 1,
                borderColor: 'divider',
              }}
            >
              <Card variant="outlined" sx={{ flex: '0 0 auto' }}>
                <CardContent
                  sx={{
                    p: '7px !important',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.2,
                  }}
                >
                  <Typography
                    sx={{
                      color: temperatureColor(displayedTemperature),
                      fontSize: '1.65rem',
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {displayedTemperature == null
                      ? '—°'
                      : `${displayedTemperature}°`}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: 10 }}
                  >
                    {profileUsesBoardSensor
                      ? 'Датчик на плате'
                      : 'Температура камеры'}
                  </Typography>
                </CardContent>
              </Card>

              {activeProfile && profileDuration !== undefined && (
                <Card variant="outlined" sx={{ flex: '0 0 auto' }}>
                  <CardContent sx={{ p: '7px !important' }}>
                    <Typography
                      variant="body2"
                      noWrap
                      title={activeProfile.name}
                      sx={{ fontWeight: 700, mb: 0.5 }}
                    >
                      {activeProfile.name}
                    </Typography>
                    <Stack spacing={0.25}>
                      {profileMaxTemperature !== null &&
                        profileMaxTemperature !== undefined && (
                          <ProfileMetric
                            kind="temperature"
                            label="Макс."
                            value={`${profileMaxTemperature} °C`}
                            color={temperatureColor(profileMaxTemperature)}
                          />
                        )}
                      <ProfileMetric
                        kind="duration"
                        label="Время"
                        value={formatWorkDuration(profileDuration)}
                      />
                      {activeProfile.repeat !== undefined &&
                        activeProfile.repeat > 1 && (
                          <ProfileMetric
                            kind="repeat"
                            label="Повторы"
                            value={String(activeProfile.repeat)}
                          />
                        )}
                      {activeProfile.repeat !== undefined &&
                        activeProfile.repeat > 1 && (
                          <ProfileMetric
                            kind="total"
                            label="Всего"
                            value={formatWorkDuration(
                              profileDuration * activeProfile.repeat,
                            )}
                          />
                        )}
                    </Stack>
                  </CardContent>
                </Card>
              )}

              <Box sx={{ flex: 1 }} />
              <Stack spacing={0.6}>
                <Button
                  fullWidth
                  variant="contained"
                  color="success"
                  onClick={() =>
                    setNotice('Демо: нагрев печи пока не подключён')
                  }
                  sx={{ minHeight: 42, color: 'common.black', fontWeight: 700 }}
                >
                  ▶ &nbsp; ПУСК
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={openSettings}
                  sx={{ minHeight: 34 }}
                >
                  ⚙ &nbsp; НАСТРОЙКИ
                </Button>
              </Stack>
            </Stack>
          )}

          <Box
            sx={{
              minWidth: 0,
              minHeight: 0,
              height: '100%',
              display: 'flex',
              overflow: 'hidden',
            }}
          >
            <Box
              component="section"
              ref={contentRef}
              sx={{
                minWidth: 0,
                minHeight: 0,
                flex: 1,
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                overscrollBehavior: 'contain',
                p: isFullPage ? { xs: 1.25, sm: 2 } : 0.75,
              }}
            >
              {activeSection === 'profiles' ? (
                <Stack spacing={0.65}>
                  <Typography
                    variant="overline"
                    sx={{
                      minHeight: 26,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    Термопрофили
                  </Typography>

                  {isLoading && <LinearProgress />}
                  {error && <Alert severity="error">{error}</Alert>}

                  {profiles.map((profile, index) => {
                    const duration = profile.points.reduce(
                      (total, point) => total + point.second,
                      0,
                    );
                    const isSelected = selectedProfile === profile.name;

                    return (
                      <Card
                        key={`${index}-${profile.name}`}
                        variant="outlined"
                        sx={{
                          borderLeft: 3,
                          borderLeftColor: isSelected
                            ? 'success.main'
                            : 'info.main',
                          bgcolor: isSelected
                            ? 'action.selected'
                            : 'background.paper',
                        }}
                      >
                        <CardContent sx={{ p: '7px 9px !important' }}>
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            spacing={0.5}
                          >
                            <ButtonBase
                              onClick={() => setSelectedProfile(profile.name)}
                              sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}
                            >
                              <Box sx={{ minWidth: 0, width: '100%' }}>
                                <Typography
                                  variant="body2"
                                  noWrap
                                  sx={{ fontWeight: 600 }}
                                >
                                  {profile.name}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  noWrap
                                >
                                  {profile.mode === 'manual'
                                    ? 'Ручной'
                                    : 'Простой'}
                                  {' • '}
                                  {formatDuration(duration)}
                                </Typography>
                              </Box>
                            </ButtonBase>
                            <IconButton
                              aria-label={`Редактировать профиль ${profile.name}`}
                              onClick={() => beginEditing(profile, index)}
                              size="small"
                            >
                              <Typography aria-hidden color="text.secondary">
                                ✎
                              </Typography>
                            </IconButton>
                          </Stack>
                        </CardContent>
                      </Card>
                    );
                  })}

                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={createProfile}
                    startIcon={
                      <SvgIcon sx={{ fontSize: 16 }}>
                        <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
                      </SvgIcon>
                    }
                    sx={{
                      minHeight: 48,
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                    }}
                  >
                    Новый профиль
                  </Button>
                </Stack>
              ) : activeSection === 'settings' ? (
                <>
                  {configurationError && (
                    <Alert severity="error">{configurationError}</Alert>
                  )}
                  <SettingsPage
                    settings={{
                      ...settings,
                      convectionEnabled:
                        controllerStatus?.telemetry?.convection ??
                        settings.convectionEnabled,
                    }}
                    onChange={setSettings}
                    ovenModels={ovenConfiguration.models}
                    ovenSelection={selectionDraft}
                    savedOvenSelection={ovenConfiguration.selected}
                    onOvenSelectionChange={setSelectionDraft}
                    onSaveOvenSelection={() => void saveOvenSelection()}
                    savingOvenSelection={savingSelection}
                    detectedBoardType={controllerStatus?.boardType}
                    controllerConnected={controllerStatus?.connected === true}
                    controllerReady={controllerStatus?.ready === true}
                    controllerSimulated={controllerStatus?.simulated === true}
                    onConvectionChange={(enabled) =>
                      void changeConvection(enabled)
                    }
                    convectionChanging={convectionChanging}
                    onBack={closeSettings}
                  />
                </>
              ) : activeSection === 'wifi' ? (
                <WifiPage
                  status={wifiStatus}
                  onStatusChange={setWifiStatus}
                  onBack={() => setActiveSection('profiles')}
                />
              ) : draftProfile ? (
                <ProfileEditorPage
                  profile={draftProfile}
                  onChange={setDraftProfile}
                  onCancel={cancelEditing}
                  onSave={saveDraft}
                />
              ) : (
                <Alert severity="warning">Профиль не выбран</Alert>
              )}
            </Box>
            <Stack
              aria-label="Прокрутка страницы"
              sx={{
                width: 38,
                flexShrink: 0,
                borderLeft: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover',
              }}
              justifyContent="space-between"
            >
              <Button
                aria-label="Прокрутить вверх"
                onClick={() => scrollContent(-1)}
                sx={{ minWidth: 38, minHeight: 54, fontSize: 24 }}
              >
                ↑
              </Button>
              {activeSection === 'profiles' && (
                <Stack
                  aria-label="Индикаторы печи"
                  spacing={0.5}
                  alignItems="center"
                  sx={{ py: 1 }}
                >
                  {indicator(
                    'lamps',
                    'Лампы',
                    controllerStatus?.connected
                      ? controllerStatus.telemetry?.lamps
                      : null,
                  )}
                  {indicator(
                    'heaters',
                    'ТЭНы',
                    controllerStatus?.connected
                      ? controllerStatus.telemetry?.heaters
                      : null,
                  )}
                  {indicator(
                    'fans',
                    'Вентиляторы',
                    controllerStatus?.connected
                      ? controllerStatus.telemetry?.fans
                      : null,
                  )}
                  {indicator(
                    'convection',
                    'Конвекция',
                    controllerStatus?.connected
                      ? controllerStatus.telemetry?.convection
                      : null,
                  )}
                  <Stack
                    spacing={0.25}
                    alignItems="center"
                    sx={{
                      pt: 0.5,
                      borderTop: 1,
                      borderColor: 'divider',
                      width: '100%',
                    }}
                  >
                    {sensorTemperature(
                      'Камера',
                      'К',
                      controllerStatus?.connected
                        ? controllerStatus.telemetry?.chamberTemperatureC
                        : null,
                    )}
                    {sensorTemperature(
                      'Датчик на плате',
                      'П',
                      controllerStatus?.connected
                        ? controllerStatus.telemetry?.boardTemperatureC
                        : null,
                    )}
                  </Stack>
                </Stack>
              )}
              <Button
                aria-label="Прокрутить вниз"
                onClick={() => scrollContent(1)}
                sx={{ minWidth: 38, minHeight: 54, fontSize: 24 }}
              >
                ↓
              </Button>
            </Stack>
          </Box>
        </Box>
      </Box>

      <Snackbar
        open={notice !== ''}
        autoHideDuration={3000}
        onClose={() => setNotice('')}
        message={notice}
      />

      <Dialog
        open={aboutDialogOpen}
        onClose={() => setAboutDialogOpen(false)}
        aria-labelledby="about-title"
      >
        <DialogTitle id="about-title">{selectedOvenName}</DialogTitle>
        <DialogContent>
          <Typography>Версия ПО: {__APP_VERSION__}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAboutDialogOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={powerOffDialogOpen}
        onClose={() => setPowerOffDialogOpen(false)}
      >
        <DialogTitle>Выключить плату?</DialogTitle>
        <DialogContent>
          Будет отправлена команда <code>poweroff [5]</code>. Raspberry Pi
          останется включённой.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPowerOffDialogOpen(false)}>Отмена</Button>
          <Button
            color="error"
            variant="contained"
            disabled={controllerAction}
            onClick={() => void powerOffBoard()}
          >
            Выключить плату
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        fullScreen
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            py: 0.5,
            px: 1,
          }}
        >
          <Button
            onClick={() => setTemplatePickerOpen(false)}
            sx={{ minHeight: 40, minWidth: 88 }}
          >
            ← Назад
          </Button>
          Выберите шаблон
        </DialogTitle>
        <DialogContent sx={{ px: 1.5, py: 0, flex: 1, overflowY: 'auto' }}>
          <RadioGroup
            value={String(selectedTemplate)}
            onChange={(event) =>
              setSelectedTemplate(Number(event.target.value))
            }
          >
            <FormControlLabel
              value="-1"
              control={<Radio />}
              label="Пустой профиль"
              sx={{
                minHeight: 48,
                m: 0,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            />
            {profileTemplates.map((template, index) => (
              <FormControlLabel
                key={`${index}-${template.name}`}
                value={String(index)}
                control={<Radio />}
                label={template.name}
                sx={{
                  minHeight: 48,
                  m: 0,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              />
            ))}
          </RadioGroup>
        </DialogContent>
        <DialogActions sx={{ p: 0.5 }}>
          <Button
            fullWidth
            variant="contained"
            onClick={continueWithTemplate}
            sx={{ minHeight: 44 }}
          >
            Продолжить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
