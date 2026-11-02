/**
 * Локальная сенсорная панель: библиотека профилей, доступ, команды и жизненный цикл экранов.
 */
import { requestSignal } from './requestSignal';
import { SettingsPinDialog } from './SettingsPinDialog';
import type { TemperatureRate } from '@mercury/shared';
import {
  buildRunPlan,
  portableProfile,
  uniqueProfileName,
  ovenModelName,
  ovenModelNumber,
} from '@mercury/shared';
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
  Switch,
  SvgIcon,
  Typography,
} from '@mui/material';
import type {
  OvenModel,
  OvenSelection,
  Profile,
  RunStatus,
} from '@mercury/shared';
import { OvenSelectionForm, type SelectionDraft } from './OvenSelectionForm';
import { ProfileEditorPage } from './ProfileEditorPage';
import { ProfileChart } from './ProfileChart';
import { HistoryPage } from './HistoryPage';
import { RunProcessWindow } from './RunProcessWindow';
import { usePcLayout } from './usePcLayout';
import { useOvenIdentity } from './useOvenIdentity';
import { PcWorkspace } from './PcWorkspace';
import { StartReviewDialog } from './PcProfileTools';
import { fanWarning } from './fanWarning';
import {
  criticalBoardError,
  criticalBoardState,
  userError,
} from './boardError';
import { SettingsPage, type OvenSettings } from './SettingsPage';
import { WifiPage, type WifiStatus } from './WifiPage';

type AppProps = {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
};

/** Показывает длительность без нулевых единиц; исходные значения остаются в секундах. */
function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)} мин`;
}

/** Выбирает цвет температурного диапазона для целочисленного показания на экране. */
function temperatureColor(temperature: number | null | undefined) {
  if (temperature == null) return 'text.disabled';
  if (temperature < 50) return 'success.main';
  if (temperature < 250) return 'warning.main';
  return 'error.main';
}

type ControllerStatus = {
  doorOpen?: boolean;
  connected: boolean;
  fanReferenceHz?: number;
  reactToFanErrors?: boolean;
  soundOnErrors?: boolean;
  thermalProtection?: boolean;
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

/**
 * Отрисовывает IndicatorSymbol: представление данных и действий родительского экрана.
 */
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

/** Формирует значок фактической активности элемента, не переключая его выход. */
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
  models: {
    model: OvenModel;
    name: string;
    heatingRate?: TemperatureRate;
    coolingRate?: TemperatureRate;
  }[];
  error?: string;
};

/** Преобразует готовность и связь платы в цвет индикатора верхней панели. */
function boardIndicator(status: ControllerStatus | null) {
  if (!status)
    return { color: 'warning.main', label: 'Проверка связи с платой' };
  if (!status.connected)
    return { color: 'error.main', label: 'Нет связи с платой' };
  if (criticalBoardState(status.state))
    return { color: 'error.main', label: 'Критическая ошибка' };
  if (status.ready && status.state !== undefined && (status.state & 1) !== 0)
    return { color: 'success.main', label: 'Плата готова к работе' };
  return {
    color: 'warning.main',
    label: 'Плата ожидает действия или инициализируется',
  };
}

/**
 * Отрисовывает App: Локальная сенсорная панель: библиотека профилей, доступ, команды и жизненный цикл экранов.
 */
export function App({ mode, onToggleMode }: AppProps) {
  const pcLayout = usePcLayout();
  const [serverReachable, setServerReachable] = useState(false);
  const [lastControllerContact, setLastControllerContact] = useState<
    number | null
  >(null);
  const [lastServerContact, setLastServerContact] = useState<number | null>(
    null,
  );
  /** Отправляет команду с идентификатором текущего клиента и ограничением ожидания ответа. */
  const commandFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (
      pcLayout &&
      (!serverReachable ||
        lastServerContact === null ||
        Date.now() - lastServerContact > 7000)
    )
      throw new Error('Нет свежих данных от Raspberry. Команда не отправлена.');
    return fetch(input, {
      ...init,
      ...(pcLayout ? { signal: requestSignal(5000) } : {}),
    });
  };
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileTemplates, setProfileTemplates] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    'profiles' | 'settings' | 'editor' | 'wifi' | 'history'
  >('profiles');
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [ovenIdentity, setOvenIdentity] = useOvenIdentity();
  const [advancedSettingsUnlocked, setAdvancedSettingsUnlocked] =
    useState(false);
  const [combinedRoles, setCombinedRoles] = useState(false);
  const [combinedRolesChanging, setCombinedRolesChanging] = useState(false);
  const canEditProfiles = combinedRoles || settingsUnlocked;

  const [pinOpen, setPinOpen] = useState(false);
  const [compactStartReview, setCompactStartReview] = useState(false);
  const [lockingSettings, setLockingSettings] = useState(false);
  const accessEpoch = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    /**
     * Читает актуальный серверный снимок для этого экрана; обработку результата выполняет владелец состояния.
     */
    const read = async () => {
      const epoch = accessEpoch.current;
      try {
        const response = await fetch('/api/settings-access', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Settings access unavailable');
        const result = await response.json();
        if (!controller.signal.aborted && epoch === accessEpoch.current) {
          setSettingsUnlocked(result.unlocked === true);
          setAdvancedSettingsUnlocked(result.advancedUnlocked === true);
          setCombinedRoles(result.combineOperatorEngineerRoles === true);
        }
      } catch {
        if (!controller.signal.aborted && epoch === accessEpoch.current) {
          setSettingsUnlocked(false);
          setAdvancedSettingsUnlocked(false);
          setCombinedRoles(false);
        }
      } finally {
        if (!controller.signal.aborted)
          timer = window.setTimeout(() => void read(), 1000);
      }
    };
    void read();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (!settingsUnlocked)
      setActiveSection((current) =>
        current === 'settings' ||
        (!pcLayout && current === 'history') ||
        (pcLayout && current === 'wifi')
          ? 'profiles'
          : current,
      );
  }, [settingsUnlocked]);
  /** Открывает доступ только текущему клиенту после серверной проверки введённого кода. */
  const unlockSettings = async (pin: string) => {
    accessEpoch.current++;
    const response = await commandFetch('/api/settings-access/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const result = await response.json();
    if (!response.ok || result.unlocked !== true)
      throw new Error(result.error ?? 'Не удалось разблокировать настройки');
    setSettingsUnlocked(true);
    setAdvancedSettingsUnlocked(result.advancedUnlocked === true);
    setCombinedRoles(result.combineOperatorEngineerRoles === true);
    setPinOpen(false);
    setActiveSection('settings');
  };
  /** Закрывает права текущего клиента и скрывает защищённые действия интерфейса. */
  const lockSettings = async () => {
    accessEpoch.current++;
    setLockingSettings(true);
    try {
      const response = await commandFetch('/api/settings-access/lock', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Не удалось заблокировать настройки');
      setSettingsUnlocked(false);
      setAdvancedSettingsUnlocked(false);
      setActiveSection('profiles');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setLockingSettings(false);
    }
  };
  /** Сохраняет разрешение оператору редактировать профили и обновляет доступность кнопок. */
  const changeCombinedRoles = async (enabled: boolean) => {
    accessEpoch.current++;
    setCombinedRolesChanging(true);
    try {
      const response = await commandFetch('/api/settings/combined-roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? 'Не удалось сохранить объединение ролей.',
        );
      setCombinedRoles(result.enabled === true);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setCombinedRolesChanging(false);
    }
  };
  useEffect(() => {
    if (!canEditProfiles) {
      setTemplatePickerOpen(false);
      setActiveSection((current) =>
        current === 'editor' ? 'profiles' : current,
      );
    }
  }, [canEditProfiles]);
  const [draftProfile, setDraftProfile] = useState<Profile | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftBaseline, setDraftBaseline] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const draftDirty =
    !!draftProfile &&
    (editingIndex === null || JSON.stringify(draftProfile) !== draftBaseline);
  useEffect(() => {
    if (!pcLayout || !draftDirty) return;
    /** Отображает ошибку команды в интерфейсе без неявного повторения действия. */
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pcLayout, draftDirty]);
  const [settings, setSettings] = useState<OvenSettings>({
    convectionEnabled: true,
    fanReferenceHz: 50,
    reactToFanErrors: true,
    soundOnErrors: true,
    thermalProtection: true,
  });
  const [fanWarningsChanging, setFanWarningsChanging] = useState(false);
  const [thermalProtectionChanging, setThermalProtectionChanging] =
    useState(false);
  /** Сохраняет выбранный режим программных порогов защиты через сервер. */
  const changeThermalProtection = async (enabled: boolean) => {
    setThermalProtectionChanging(true);
    try {
      const response = await commandFetch('/api/settings/thermal-protection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSettings((current) => ({
        ...current,
        thermalProtection: result.enabled,
      }));
      setControllerStatus((current) =>
        current ? { ...current, thermalProtection: result.enabled } : current,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить термозащиту.',
      );
    } finally {
      setThermalProtectionChanging(false);
    }
  };
  const [soundOnErrorsChanging, setSoundOnErrorsChanging] = useState(false);
  /** Сохраняет разрешение звуковых сигналов ошибок на пищалке печи. */
  const changeSoundOnErrors = async (enabled: boolean) => {
    setSoundOnErrorsChanging(true);
    try {
      const response = await commandFetch('/api/settings/sound-on-errors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSettings((current) => ({ ...current, soundOnErrors: result.enabled }));
      setControllerStatus((current) =>
        current ? { ...current, soundOnErrors: result.enabled } : current,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить звуковые сигналы.',
      );
    } finally {
      setSoundOnErrorsChanging(false);
    }
  };
  /** Сохраняет включение предупреждений по частоте конвекционного вентилятора. */
  const changeFanWarnings = async (enabled: boolean) => {
    setFanWarningsChanging(true);
    try {
      const response = await commandFetch('/api/settings/fan-warnings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSettings((current) => ({
        ...current,
        reactToFanErrors: result.enabled,
      }));
      setControllerStatus((current) =>
        current ? { ...current, reactToFanErrors: result.enabled } : current,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить предупреждения.',
      );
    } finally {
      setFanWarningsChanging(false);
    }
  };
  const [savingFanReference, setSavingFanReference] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [runWindowOpen, setRunWindowOpen] = useState(false);
  const runActive =
    runStatus?.state === 'preparing' ||
    runStatus?.state === 'running' ||
    runStatus?.state === 'cooling';
  const holdingActive = runStatus?.holdingTemperatureC === 100;
  useEffect(() => {
    if (runActive && runStatus?.purpose !== 'calibration')
      setRunWindowOpen(true);
  }, [runActive, runStatus?.purpose]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    /**
     * Читает актуальный серверный снимок для этого экрана; обработку результата выполняет владелец состояния.
     */
    const read = async () => {
      try {
        const response = await fetch('/api/run', {
          signal: pcLayout
            ? requestSignal(5000, controller.signal)
            : controller.signal,
        });
        if (!response.ok) throw new Error('Сервер недоступен');
        if (!controller.signal.aborted) {
          setRunStatus(await response.json());
          setServerReachable(true);
          setLastServerContact(Date.now());
        }
      } catch {
        if (!controller.signal.aborted) setServerReachable(false);
      } finally {
        if (!controller.signal.aborted)
          timer = window.setTimeout(() => void read(), 1000);
      }
    };
    void read();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [pcLayout]);
  /** Запрашивает запуск или остановку выбранного процесса и принимает подтверждённое состояние сервера. */
  const changeRun = async (
    reviewKey?: string,
    acceptWarnings = false,
    pin?: string,
  ) => {
    if (
      !runActive &&
      !/\bElectron\//i.test(navigator.userAgent) &&
      pin === undefined
    ) {
      setCompactStartReview(true);
      return;
    }
    const selected = profiles.find(
      (profile) => profile.name === selectedProfile,
    );
    setRunBusy(true);
    try {
      const response = await commandFetch(
        runActive ? '/api/run/stop' : '/api/run/start',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: selected?.id,
            ...(reviewKey ? { reviewKey, acceptWarnings } : {}),
            ...(pin !== undefined ? { pin } : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setRunStatus(result);
      if (!holdingActive) setRunWindowOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setRunBusy(false);
    }
  };
  const [notice, setNotice] = useState('');
  /** Запрашивает паузу или продолжение; временем процесса управляет сервер, а не экран. */
  const changePause = async (action: 'pause' | 'resume') => {
    setRunBusy(true);
    try {
      const response = await commandFetch('/api/run/' + action, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? 'Не удалось изменить паузу');
      setRunStatus(result);
    } catch (error) {
      setNotice(String(error));
    } finally {
      setRunBusy(false);
    }
  };
  const [keepHeatEnabled, setKeepHeatEnabled] = useState(false);
  const [keepHeatChanging, setKeepHeatChanging] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/settings/keep-heat', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Не удалось загрузить поддержание температуры');
        const result = await response.json();
        if (!controller.signal.aborted)
          setKeepHeatEnabled(result.enabled === true);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setNotice(String(error));
      });
    return () => controller.abort();
  }, []);
  /** Сохраняет переключатель поддержания 100 °C и обрабатывает результат команды сервера. */
  const changeKeepHeat = async (enabled: boolean) => {
    setKeepHeatChanging(true);
    try {
      const response = await commandFetch('/api/settings/keep-heat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setKeepHeatEnabled(result.enabled);
    } catch (error) {
      setNotice(String(error));
    } finally {
      setKeepHeatChanging(false);
    }
  };
  /** Подтверждает завершение окна процесса через сервер и обновляет главный экран. */
  const finishRunWindow = async () => {
    setRunBusy(true);
    try {
      const response = await commandFetch('/api/run/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runStatus?.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setRunStatus(result);
      setRunWindowOpen(false);
    } catch (error) {
      setNotice(String(error));
    } finally {
      setRunBusy(false);
    }
  };
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
  const [convectionChanging, setConvectionChanging] = useState(false);
  const [controllerStatus, setControllerStatus] =
    useState<ControllerStatus | null>(null);
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [networkAddresses, setNetworkAddresses] = useState<string[] | null>(
    null,
  );
  const [networkError, setNetworkError] = useState(false);

  useEffect(() => {
    if (!aboutDialogOpen) return;
    const controller = new AbortController();
    setNetworkAddresses(null);
    setNetworkError(false);
    void fetch('/api/network', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Network status unavailable');
        const result = (await response.json()) as { addresses: string[] };
        if (!controller.signal.aborted) setNetworkAddresses(result.addresses);
      })
      .catch(() => {
        if (!controller.signal.aborted) setNetworkError(true);
      });
    return () => controller.abort();
  }, [aboutDialogOpen]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(-1);
  const isFullPage =
    activeSection === 'settings' ||
    activeSection === 'editor' ||
    activeSection === 'wifi' ||
    activeSection === 'history';
  const contentRef = useRef<HTMLElement | null>(null);

  /** Смещает прокручиваемый контейнер локальной панели по нажатию экранной стрелки. */
  const scrollContent = (direction: -1 | 1) => {
    contentRef.current?.scrollBy({ top: direction * 180, behavior: 'smooth' });
  };

  /** Отправляет выбранную аппаратную конфигурацию и обновляет зависящие от неё возможности интерфейса. */
  const saveOvenSelection = async () => {
    if (!settingsUnlocked) {
      setPinOpen(true);
      return;
    }
    if (!selectionDraft.ovenModel || !selectionDraft.connectionVoltage) return;
    setSavingSelection(true);
    try {
      const response = await commandFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectionDraft),
      });
      const result = (await response.json()) as {
        selected?: OvenSelection;
        models?: OvenConfigurationResponse['models'];
        error?: string;
      };
      if (!response.ok || !result.selected) {
        throw new Error(result.error ?? 'Не удалось сохранить настройки');
      }
      setOvenConfiguration((current) =>
        current
          ? {
              ...current,
              selected: result.selected ?? null,
              models: result.models ?? current.models,
            }
          : current,
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

  /** Открывает настройки или диалог доступа с учётом прав текущего клиента. */
  const openSettings = () => {
    if (!settingsUnlocked) {
      setPinOpen(true);
      return;
    }
    if (ovenConfiguration?.selected)
      setSelectionDraft(ovenConfiguration.selected);
    setConfigurationError(null);
    setActiveSection('settings');
  };

  /** Передаёт выбор работы конвекции на сервер; индикатор обновляется по ответу. */
  const changeConvection = async (enabled: boolean) => {
    setConvectionChanging(true);
    try {
      const response = await commandFetch('/api/controller/convection', {
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

  /** Возвращает пользователя из настроек на главный экран. */
  const closeSettings = () => {
    if (ovenConfiguration?.selected)
      setSelectionDraft(ovenConfiguration.selected);
    setConfigurationError(null);
    setActiveSection('profiles');
  };

  /** Создаёт редактируемую копию профиля вместо прямой мутации записи библиотеки. */
  const beginEditing = (profile: Profile, index: number | null) => {
    if (!canEditProfiles) return;
    setDraftProfile(structuredClone(profile));
    setDraftBaseline(JSON.stringify(profile));
    setEditingIndex(index);
    if (index !== null) setSelectedProfile(profile.name);
    setActiveSection('editor');
  };

  /** Открывает создание нового профиля при разрешённом доступе редактора. */
  const createProfile = () => {
    if (!canEditProfiles) return;
    setSelectedTemplate(-1);
    setTemplatePickerOpen(true);
  };

  /** Заполняет новый черновик выбранным шаблоном, не изменяя сам шаблон. */
  const continueWithTemplate = () => {
    if (!canEditProfiles) return;
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
    const copy = structuredClone(template);
    delete copy.id;
    let suffix = 2;
    while (profiles.some((profile) => profile.name === copy.name))
      copy.name = template.name + ' (' + suffix++ + ')';
    beginEditing(copy, null);
  };

  /** Проверяет и сохраняет черновик через API, затем обновляет библиотеку. */
  const saveDraft = async () => {
    if (!canEditProfiles) return;
    if (!draftProfile) return;
    try {
      const existing = editingIndex === null ? null : profiles[editingIndex];
      const response = await commandFetch(
        existing?.id ? '/api/profiles/' + existing.id : '/api/profiles',
        {
          method: existing?.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftProfile),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const saved = result as Profile;
      setProfiles((current) =>
        existing
          ? current.map((profile) =>
              profile.id === existing.id ? saved : profile,
            )
          : [...current, saved],
      );
      setSelectedProfile(saved.name);
      setDraftProfile(null);
      setEditingIndex(null);
      setActiveSection('profiles');
      setNotice('Профиль сохранён');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Не удалось сохранить профиль',
      );
    }
  };
  /** Запрашивает удаление выбранной записи с обновлением библиотеки после успеха. */
  const deleteDraft = async () => {
    if (!canEditProfiles) return;
    if (!draftProfile?.id) return;
    try {
      const response = await commandFetch('/api/profiles/' + draftProfile.id, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const remaining = profiles.filter(
        (profile) => profile.id !== draftProfile.id,
      );
      setProfiles(remaining);
      setSelectedProfile(remaining[0]?.name ?? null);
      setDraftProfile(null);
      setEditingIndex(null);
      setActiveSection('profiles');
    } catch (error) {
      setNotice(String(error));
    }
  };

  /** Отбрасывает локальные несохранённые изменения текущего редактора. */
  const discardDraft = () => {
    setDraftProfile(null);
    setDraftBaseline(null);
    setEditingIndex(null);
    setActiveSection('profiles');
  };
  /** Перехватывает уход из редактора, если нужно подтвердить потерю изменений. */
  const guardDraft = (action: () => void) => {
    if (pcLayout && activeSection === 'editor' && draftDirty)
      setPendingLeave(() => action);
    else action();
  };
  /** Закрывает редактор через проверку несохранённых изменений. */
  const cancelEditing = () => guardDraft(discardDraft);
  /** Создаёт независимую копию выбранного профиля с новым именем. */
  const duplicateProfile = (profile: Profile) => {
    if (!canEditProfiles) return;
    const copy = portableProfile(profile);
    copy.name = uniqueProfileName(
      profile.name + ' — копия',
      profiles.map((p) => p.name),
    );
    beginEditing(copy, null);
  };
  /** Повторно загружает библиотеку после изменения или импорта профилей. */
  const reloadProfiles = async () => {
    try {
      const r = await fetch('/api/profiles', {
        signal: requestSignal(5000),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error);
      setProfiles(value.profiles);
      setNotice('Операция с профилями завершена');
    } catch (e) {
      setNotice(String(e));
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | undefined;

    /** Загружает сохранённую конфигурацию и доступные варианты оборудования. */
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

    /** Читает состояние платы для индикаторов и проверки допустимых команд. */
    async function readStatus() {
      try {
        const response = await fetch('/api/controller/check', {
          signal: pcLayout
            ? requestSignal(5000, controller.signal)
            : controller.signal,
        });
        if (!response.ok) throw new Error('Нет актуальных данных платы');
        const result = (await response.json()) as ControllerStatus;
        if (active) {
          setControllerStatus(result);
          setLastControllerContact(Date.now());
        }
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
    /** Обновляет состояние сети для локальной панели Raspberry. */
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

    /** Загружает библиотеку и восстанавливает текущий выбор профиля. */
    async function loadProfiles() {
      try {
        const response = await fetch('/api/profile-templates', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Сервер ответил с ошибкой ${response.status}`);
        }

        const data = (await response.json()) as Profile[];
        let responseProfiles = await fetch('/api/profiles', {
          signal: controller.signal,
        });
        let savedSelection: string | null = null;
        const stored = localStorage.getItem('mercury-profiles');
        if (stored && !localStorage.getItem('mercury-profiles-imported')) {
          try {
            const legacy = JSON.parse(stored);
            if (Array.isArray(legacy?.profiles)) {
              const imported = await fetch('/api/profiles/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profiles: legacy.profiles }),
                signal: controller.signal,
              });
              if (!imported.ok) throw new Error((await imported.json()).error);
              responseProfiles = imported;
              savedSelection = legacy.selected;
              localStorage.setItem('mercury-profiles-imported', '1');
            }
          } catch (importError) {
            setNotice(
              'Не удалось перенести старые профили: ' + String(importError),
            );
          }
        }
        if (!responseProfiles.ok)
          throw new Error('Не удалось загрузить профили');
        const result = (await responseProfiles.json()) as {
          profiles: Profile[];
          selectedId: string | null;
        };
        setProfiles(result.profiles);
        setProfileTemplates(data);
        setSelectedProfile(
          result.profiles.find((profile) => profile.id === result.selectedId)
            ?.name ??
            result.profiles.find((profile) => profile.name === savedSelection)
              ?.name ??
            result.profiles[0]?.name ??
            null,
        );
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

  useEffect(() => {
    if (controllerStatus?.fanReferenceHz !== undefined) {
      setSettings((current) => ({
        ...current,
        fanReferenceHz: controllerStatus.fanReferenceHz!,
      }));
    }
  }, [controllerStatus?.fanReferenceHz]);
  useEffect(() => {
    if (
      !fanWarningsChanging &&
      controllerStatus?.reactToFanErrors !== undefined
    )
      setSettings((current) => ({
        ...current,
        reactToFanErrors: controllerStatus.reactToFanErrors!,
      }));
  }, [controllerStatus?.reactToFanErrors, fanWarningsChanging]);
  useEffect(() => {
    if (!soundOnErrorsChanging && controllerStatus?.soundOnErrors !== undefined)
      setSettings((current) => ({
        ...current,
        soundOnErrors: controllerStatus.soundOnErrors!,
      }));
  }, [controllerStatus?.soundOnErrors, soundOnErrorsChanging]);
  useEffect(() => {
    if (
      !thermalProtectionChanging &&
      controllerStatus?.thermalProtection !== undefined
    )
      setSettings((current) => ({
        ...current,
        thermalProtection: controllerStatus.thermalProtection!,
      }));
  }, [controllerStatus?.thermalProtection, thermalProtectionChanging]);
  useEffect(() => {
    if (isLoading || error) return;
    const selected = profiles.find(
      (profile) => profile.name === selectedProfile,
    );
    if (!selected?.id) return;
    const controller = new AbortController();
    void fetch('/api/profiles/selected', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id }),
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [profiles, selectedProfile, isLoading, error]);

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
          <SettingsPinDialog
            open={pinOpen}
            onClose={() => setPinOpen(false)}
            onUnlock={unlockSettings}
          />
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

  const modelOvenName =
    controllerStatus?.boardType && controllerStatus.boardType !== 'unknown'
      ? ovenModelName(
          ovenConfiguration.selected?.ovenModel ?? '',
          controllerStatus.boardType,
        )
      : (ovenConfiguration.models.find(
          ({ model }) => model === ovenConfiguration.selected?.ovenModel,
        )?.name ?? 'Меркурий');
  const selectedOvenName = [
    ovenIdentity.name || modelOvenName,
    ovenIdentity.description,
  ]
    .filter(Boolean)
    .join(' — ');
  const activeProfile = profiles.find(
    (profile) => profile.name === selectedProfile,
  );
  const profileUsesBoardSensor =
    !holdingActive && (activeProfile?.board ?? false);
  const displayedTemperature = controllerStatus?.connected
    ? profileUsesBoardSensor
      ? controllerStatus.telemetry?.boardTemperatureC
      : controllerStatus.telemetry?.chamberTemperatureC
    : null;
  const boardConnection = boardIndicator(controllerStatus);
  const fanHz = controllerStatus?.connected
    ? controllerStatus.telemetry?.convectionFanHz
    : null;
  const currentFanWarning = controllerStatus?.connected
    ? fanWarning(
        fanHz,
        controllerStatus.fanReferenceHz ?? 50,
        settings.reactToFanErrors,
        controllerStatus.telemetry?.convection === true,
      )
    : null;
  const fanWear =
    controllerStatus?.telemetry?.convection &&
    fanHz != null &&
    controllerStatus.fanReferenceHz
      ? Math.round(
          Math.max(
            0,
            Math.min(100, (1 - fanHz / controllerStatus.fanReferenceHz) * 100),
          ),
        )
      : null;
  /** Сохраняет подтверждённую эталонную частоту конвекционного вентилятора. */
  const confirmFanReference = async () => {
    setSavingFanReference(true);
    try {
      const response = await commandFetch('/api/settings/fan-reference', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fanReferenceHz: settings.fanReferenceHz }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setControllerStatus((current) =>
        current
          ? { ...current, fanReferenceHz: result.fanReferenceHz }
          : current,
      );
      setNotice('Эталонная частота сохранена');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Не удалось сохранить эталон',
      );
    } finally {
      setSavingFanReference(false);
    }
  };
  /** Выбирает показание термопары по настройке выбранного профиля. */
  const sensorTemperature = (
    label: string,
    shortLabel: string,
    value: number | null | undefined,
  ) => (
    <Typography
      variant="caption"
      title={`${label}: ${value == null ? 'нет данных' : `${Math.round(value)} °C`}`}
      aria-label={`${label}: ${value == null ? 'нет данных' : `${Math.round(value)} °C`}`}
      sx={{
        color: temperatureColor(value),
        fontSize: 10,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {shortLabel} {value == null ? '—' : `${Math.round(value)}°`}
    </Typography>
  );

  const ovenIndicators = (
    <Stack
      aria-label="Индикаторы печи"
      spacing={0.5}
      alignItems="center"
      sx={{ py: 1 }}
    >
      <Box
        role="img"
        aria-label={
          controllerStatus?.doorOpen ? 'Дверь открыта' : 'Дверь закрыта'
        }
        title={controllerStatus?.doorOpen ? 'Дверь открыта' : 'Дверь закрыта'}
        sx={{
          color:
            !controllerStatus?.connected ||
            controllerStatus.doorOpen === undefined
              ? 'text.disabled'
              : controllerStatus.doorOpen
                ? runActive
                  ? '#ff9800'
                  : 'success.main'
                : 'text.secondary',
        }}
      >
        <SvgIcon fontSize="small">
          <path
            d={
              controllerStatus?.doorOpen
                ? 'M4 2h12v2H6v16h10v2H4V2zm4 3 10-3v20l-10-3V5zm7 6v2h2v-2h-2z'
                : 'M5 2h14v20H5V2zm2 2v16h10V4H7zm7 7h2v2h-2v-2z'
            }
          />
        </SvgIcon>
      </Box>
      {indicator(
        'lamps',
        'Лампы',
        controllerStatus?.connected ? controllerStatus.telemetry?.lamps : null,
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
        controllerStatus?.connected ? controllerStatus.telemetry?.fans : null,
      )}
      {indicator(
        'convection',
        'Конвекция',
        controllerStatus?.connected
          ? controllerStatus.telemetry?.convection
          : null,
      )}
      {fanWear !== null && fanWear > 70 && (
        <Typography
          title="Снижение частоты конвекции относительно эталона"
          sx={{
            fontSize: 9,
            lineHeight: 1.2,
            textAlign: 'center',
            color: fanWear > 80 ? 'error.main' : '#ff9800',
          }}
        >
          Износ
          <br />
          {fanWear}%
        </Typography>
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
  );

  const criticalBoard =
    (controllerStatus?.connected === true &&
      criticalBoardState(controllerStatus.state)) ||
    criticalBoardError(runStatus?.error);

  const sectionContent =
    activeSection === 'settings' ? (
      <>
        {configurationError && (
          <Alert severity="error">{configurationError}</Alert>
        )}
        <SettingsPage
          identity={ovenIdentity}
          onIdentitySaved={setOvenIdentity}
          advancedAccess={advancedSettingsUnlocked}
          combinedRoles={combinedRoles}
          combinedRolesChanging={combinedRolesChanging}
          onCombinedRolesChange={(enabled) => void changeCombinedRoles(enabled)}
          onSoundOnErrorsChange={(enabled) => void changeSoundOnErrors(enabled)}
          soundOnErrorsChanging={soundOnErrorsChanging}
          thermalProtectionChanging={thermalProtectionChanging}
          onThermalProtectionChange={(enabled) =>
            void changeThermalProtection(enabled)
          }
          fanWarning={currentFanWarning?.message ?? null}
          onFanWarningsChange={(enabled) => void changeFanWarnings(enabled)}
          fanWarningsChanging={fanWarningsChanging}
          settings={{
            ...settings,
            convectionEnabled:
              controllerStatus?.telemetry?.convection ??
              settings.convectionEnabled,
          }}
          onChange={setSettings}
          fanHz={fanHz ?? null}
          referenceHz={controllerStatus?.fanReferenceHz ?? 50}
          onConfirmFanReference={() => void confirmFanReference()}
          savingFanReference={savingFanReference}
          ovenModels={ovenConfiguration.models}
          ovenSelection={selectionDraft}
          savedOvenSelection={ovenConfiguration.selected}
          onOvenSelectionChange={setSelectionDraft}
          onSaveOvenSelection={() => void saveOvenSelection()}
          savingOvenSelection={savingSelection || runActive || holdingActive}
          detectedBoardType={controllerStatus?.boardType}
          controllerConnected={controllerStatus?.connected === true}
          controllerReady={
            controllerStatus?.ready === true && !runActive && !holdingActive
          }
          controllerSimulated={controllerStatus?.simulated === true}
          onConvectionChange={(enabled) => void changeConvection(enabled)}
          convectionChanging={convectionChanging}
          onBack={closeSettings}
          onHistory={() => {
            if (settingsUnlocked) setActiveSection('history');
          }}
          runActive={runActive || holdingActive}
        />
      </>
    ) : activeSection === 'history' ? (
      <HistoryPage
        onBack={() =>
          setActiveSection(
            pcLayout && !settingsUnlocked ? 'profiles' : 'settings',
          )
        }
      />
    ) : activeSection === 'wifi' ? (
      <WifiPage
        status={wifiStatus}
        onStatusChange={setWifiStatus}
        onBack={() => setActiveSection(pcLayout ? 'settings' : 'profiles')}
      />
    ) : draftProfile ? (
      <ProfileEditorPage
        profile={draftProfile}
        heatingRate={
          ovenConfiguration.models.find(
            (model) => model.model === ovenConfiguration.selected?.ovenModel,
          )?.heatingRate ?? 0.7
        }
        coolingRate={
          ovenConfiguration.models.find(
            (model) => model.model === ovenConfiguration.selected?.ovenModel,
          )?.coolingRate ?? 0.4
        }
        onChange={setDraftProfile}
        onCancel={cancelEditing}
        onSave={() => void saveDraft()}
        {...(draftProfile.id && editingIndex !== null
          ? { onDelete: () => void deleteDraft() }
          : {})}
      />
    ) : (
      <Alert severity="warning">Профиль не выбран</Alert>
    );

  return (
    <Box
      sx={{
        height: '100dvh',
        minHeight: 320,
        p: pcLayout ? 0 : { xs: 0, sm: 2 },
        bgcolor: 'background.default',
      }}
    >
      {criticalBoard && (
        <Box
          aria-hidden="true"
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 36px 10px rgba(244, 67, 54, 0.8)',
          }}
        />
      )}
      <Snackbar
        open={criticalBoard && !runWindowOpen}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="error">Критическая ошибка</Alert>
      </Snackbar>
      <StartReviewDialog
        open={compactStartReview}
        onClose={() => setCompactStartReview(false)}
        profile={activeProfile}
        onStart={(key, accepted, pin) => void changeRun(key, accepted, pin)}
        disabled={runBusy || controllerStatus?.ready !== true}
      />
      <Dialog
        open={pendingLeave !== null}
        onClose={() => setPendingLeave(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Несохранённые изменения</DialogTitle>
        <DialogContent>
          Изменения профиля ещё не сохранены. Выйти без сохранения?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingLeave(null)}>
            Продолжить редактирование
          </Button>
          <Button
            color="warning"
            onClick={() => {
              const action = pendingLeave;
              setPendingLeave(null);
              discardDraft();
              action?.();
            }}
          >
            Выйти без сохранения
          </Button>
        </DialogActions>
      </Dialog>
      <SettingsPinDialog
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onUnlock={unlockSettings}
      />
      <RunProcessWindow
        advancedAccess={advancedSettingsUnlocked}
        criticalBoard={criticalBoard}
        fanWarning={currentFanWarning}
        indicators={ovenIndicators}
        open={
          !pcLayout && runWindowOpen && runStatus?.purpose !== 'calibration'
        }
        status={runStatus}
        busy={runBusy}
        onStop={() => void changeRun()}
        onPause={() => void changePause('pause')}
        onResume={() => void changePause('resume')}
        onClose={() => void finishRunWindow()}
        heatingRate={
          ovenConfiguration?.models.find(
            (model) => model.model === ovenConfiguration.selected?.ovenModel,
          )?.heatingRate
        }
        coolingRate={
          ovenConfiguration?.models.find(
            (model) => model.model === ovenConfiguration.selected?.ovenModel,
          )?.coolingRate
        }
      />
      {pcLayout ? (
        <PcWorkspace
          mode={mode}
          onToggleMode={onToggleMode}
          section={activeSection}
          onSection={(section, onApproved) =>
            guardDraft(() => {
              if (activeSection === 'editor' && section !== 'editor')
                discardDraft();
              setActiveSection(section);
              onApproved?.();
            })
          }
          name={selectedOvenName}
          connectionLabel={boardConnection.label}
          connected={
            controllerStatus?.connected === true &&
            lastControllerContact !== null &&
            Date.now() - lastControllerContact < 7000
          }
          ready={
            controllerStatus?.ready === true &&
            lastControllerContact !== null &&
            Date.now() - lastControllerContact < 7000
          }
          serverReachable={
            serverReachable &&
            lastServerContact !== null &&
            Date.now() - lastServerContact < 7000
          }
          lastServerContact={lastServerContact}
          source={{
            model: ovenModelNumber(
              ovenConfiguration.selected?.ovenModel ?? '',
              controllerStatus?.boardType,
            ),
            connectionVoltage:
              ovenConfiguration.selected?.connectionVoltage ?? '',
          }}
          onDuplicate={duplicateProfile}
          onImported={() => void reloadProfiles()}
          onResetDraft={() => {
            if (draftBaseline) setDraftProfile(JSON.parse(draftBaseline));
          }}
          draftDirty={draftDirty}
          profiles={profiles}
          selected={activeProfile}
          draft={draftProfile}
          run={runStatus}
          busy={runBusy}
          runActive={runActive}
          windowOpen={runWindowOpen}
          onReady={() => void finishRunWindow()}
          temperature={displayedTemperature}
          chamber={controllerStatus?.telemetry?.chamberTemperatureC}
          board={controllerStatus?.telemetry?.boardTemperatureC}
          doorOpen={controllerStatus?.doorOpen}
          lamps={controllerStatus?.telemetry?.lamps}
          heaters={controllerStatus?.telemetry?.heaters}
          fans={controllerStatus?.telemetry?.fans}
          convection={controllerStatus?.telemetry?.convection}
          canEdit={canEditProfiles}
          unlocked={settingsUnlocked}
          advanced={advancedSettingsUnlocked}
          onSelect={(profile) => setSelectedProfile(profile.name)}
          onEdit={beginEditing}
          onCreate={createProfile}
          onSettings={() => guardDraft(openSettings)}
          onAdvancedAccess={() => guardDraft(() => setPinOpen(true))}
          onLock={() => guardDraft(() => void lockSettings())}
          onStart={(key, accepted, pin) => void changeRun(key, accepted, pin)}
          onPause={() => void changePause('pause')}
          onResume={() => void changePause('resume')}
          onStop={() => void changeRun()}
          keepHeat={keepHeatEnabled}
          keepHeatBusy={keepHeatChanging}
          onKeepHeat={(enabled) => void changeKeepHeat(enabled)}
          heatingRate={
            ovenConfiguration.models.find(
              (m) => m.model === ovenConfiguration.selected?.ovenModel,
            )?.heatingRate ?? 0.7
          }
          coolingRate={
            ovenConfiguration.models.find(
              (m) => m.model === ovenConfiguration.selected?.ovenModel,
            )?.coolingRate ?? 0.4
          }
          content={sectionContent}
          warning={currentFanWarning?.message ?? null}
          critical={criticalBoard}
        />
      ) : (
        <Box
          sx={{
            width: '100%',
            maxWidth: pcLayout ? 1760 : { xs: 1000, md: 1440 },
            height: '100%',
            minHeight: 320,
            mx: 'auto',
            display: 'grid',
            gridTemplateRows: isFullPage
              ? 'minmax(0, 1fr)'
              : { xs: '36px minmax(0, 1fr)', md: '56px minmax(0, 1fr)' },
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
                px: pcLayout ? 3 : 1.25,
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
                <Typography
                  variant="subtitle2"
                  noWrap
                  sx={{
                    fontWeight: 700,
                    ...(pcLayout ? { fontSize: 20 } : {}),
                  }}
                >
                  {selectedOvenName}
                </Typography>
              </ButtonBase>
              {pcLayout && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mr: 3 }}
                >
                  {window.location.host}
                </Typography>
              )}
              <FormControlLabel
                label="100 °C"
                title="Поддерживать 100 °C"
                sx={{
                  m: 0,
                  mr: 2,
                  flexShrink: 0,
                  minHeight: 32,
                  '& .MuiFormControlLabel-label': {
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                  },
                }}
                control={
                  <Switch
                    size="small"
                    checked={keepHeatEnabled}
                    disabled={keepHeatChanging}
                    onChange={(_event, checked) => void changeKeepHeat(checked)}
                    slotProps={{
                      input: { 'aria-label': 'Поддерживать 100 °C' },
                    }}
                  />
                }
              />
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
                : pcLayout
                  ? 'minmax(0, 1.7fr) minmax(360px, 1fr)'
                  : {
                      xs: 'minmax(176px, 0.82fr) minmax(0, 1fr)',
                      sm: 'minmax(230px, 0.78fr) minmax(0, 1fr)',
                      md: 'minmax(0, 1.6fr) minmax(320px, 1fr)',
                    },
            }}
          >
            {!isFullPage && (
              <Stack
                component="section"
                aria-label="Состояние печи"
                spacing={0.6}
                sx={{
                  p: { xs: 0.75, md: 2 },
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
                      p: pcLayout ? '18px !important' : '3px 7px !important',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0,
                    }}
                  >
                    <Typography
                      sx={{
                        color: temperatureColor(displayedTemperature),
                        fontSize: { xs: '1.65rem', md: '3rem' },
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      {displayedTemperature == null
                        ? '—°'
                        : `${Math.round(displayedTemperature)}°`}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: { xs: 10, md: 14 } }}
                    >
                      {profileUsesBoardSensor
                        ? 'Датчик на плате'
                        : 'Температура камеры'}
                    </Typography>
                  </CardContent>
                </Card>

                {activeProfile ? (
                  <ProfileChart
                    profile={activeProfile}
                    heatingRate={
                      ovenConfiguration.models.find(
                        (model) =>
                          model.model === ovenConfiguration.selected?.ovenModel,
                      )?.heatingRate ?? 0.7
                    }
                    coolingRate={
                      ovenConfiguration.models.find(
                        (model) =>
                          model.model === ovenConfiguration.selected?.ovenModel,
                      )?.coolingRate ?? 0.4
                    }
                  />
                ) : (
                  <Box sx={{ flex: 1 }} />
                )}
                {runStatus?.state !== 'idle' && runStatus && !criticalBoard && (
                  <Typography
                    sx={{ fontSize: 10, lineHeight: 1.2 }}
                    color={runStatus.error ? 'error.main' : 'text.secondary'}
                  >
                    {(runStatus.error ? userError(runStatus.error) : null) ??
                      (holdingActive
                        ? 'Поддержание 100 °C'
                        : runActive
                          ? (runStatus.state === 'cooling'
                              ? 'Охлаждение'
                              : 'Цель: ' +
                                Math.round(runStatus.targetTemperatureC ?? 0) +
                                '°') +
                            ' · ' +
                            runStatus.cycle +
                            '/' +
                            runStatus.cycles +
                            ' · ' +
                            Math.floor(runStatus.elapsedSeconds / 60) +
                            ' мин ' +
                            (runStatus.elapsedSeconds % 60) +
                            ' с'
                          : runStatus.state === 'completed'
                            ? 'Завершено'
                            : runStatus.state === 'stopped'
                              ? 'Остановлено'
                              : 'Ошибка')}
                  </Typography>
                )}
                {currentFanWarning && (
                  <Typography
                    role="status"
                    color="warning.main"
                    sx={{ fontSize: 11, lineHeight: 1.25 }}
                  >
                    {currentFanWarning.message}
                  </Typography>
                )}
                <Stack spacing={0.6}>
                  <Button
                    fullWidth
                    variant="contained"
                    color="success"
                    onClick={() =>
                      runActive ? setRunWindowOpen(true) : void changeRun()
                    }
                    disabled={
                      runBusy ||
                      (!runActive &&
                        (!activeProfile || !controllerStatus?.ready))
                    }
                    sx={{
                      minHeight: pcLayout ? 52 : 42,
                      color: 'common.black',
                      fontWeight: 700,
                    }}
                  >
                    ▶ ПУСК
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={openSettings}
                    sx={{ minHeight: pcLayout ? 44 : 34 }}
                  >
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={{
                        mr: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                      }}
                    >
                      {settingsUnlocked ? (
                        '⚙'
                      ) : (
                        <SvgIcon fontSize="small">
                          <path d="M12.65 10C11.83 7.67 9.61 6 7 6a6 6 0 1 0 5.65 8H17v4h4v-4h2v-4H12.65ZM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                        </SvgIcon>
                      )}
                    </Box>{' '}
                    НАСТРОЙКИ
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
                  p: isFullPage ? { xs: 1.25, sm: 2 } : { xs: 0.75, md: 2 },
                }}
              >
                {activeSection === 'profiles' ? (
                  <Stack spacing={pcLayout ? 1.5 : 0.65}>
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
                      let duration = profile.points.reduce(
                        (total, point) => total + point.second,
                        0,
                      );
                      try {
                        const model = ovenConfiguration.models.find(
                          (item) =>
                            item.model ===
                            ovenConfiguration.selected?.ovenModel,
                        );
                        duration = buildRunPlan(
                          profile,
                          model?.heatingRate ?? 0.7,
                          model?.coolingRate ?? 0.4,
                        ).durationSeconds;
                      } catch {
                        /* Drafts without a 50 °C heating section cannot run yet. */
                      }
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
                          <CardContent
                            sx={{
                              p: pcLayout
                                ? '16px !important'
                                : '7px 9px !important',
                            }}
                          >
                            <Stack
                              direction="row"
                              alignItems="center"
                              justifyContent="space-between"
                              spacing={0.5}
                            >
                              <ButtonBase
                                disabled={runActive}
                                onClick={() => setSelectedProfile(profile.name)}
                                sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}
                              >
                                <Box sx={{ minWidth: 0, width: '100%' }}>
                                  <Typography
                                    variant="body2"
                                    noWrap
                                    sx={{
                                      fontWeight: 600,
                                      ...(pcLayout ? { fontSize: 17 } : {}),
                                    }}
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
                              {canEditProfiles && (
                                <IconButton
                                  disabled={runActive}
                                  aria-label={`Редактировать профиль ${profile.name}`}
                                  onClick={() => beginEditing(profile, index)}
                                  size="small"
                                >
                                  <Typography
                                    aria-hidden
                                    color="text.secondary"
                                  >
                                    ✎
                                  </Typography>
                                </IconButton>
                              )}
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}

                    {canEditProfiles && (
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
                    )}
                  </Stack>
                ) : (
                  sectionContent
                )}
              </Box>
              <Stack
                aria-label="Прокрутка страницы"
                sx={{
                  width: pcLayout ? 76 : 38,
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
                {activeSection === 'profiles' && ovenIndicators}
                {activeSection === 'settings' && (
                  <IconButton
                    aria-label="Заблокировать настройки"
                    title="Заблокировать настройки"
                    disabled={lockingSettings}
                    onClick={() => void lockSettings()}
                    sx={{ minWidth: 38, minHeight: 48, color: 'primary.main' }}
                  >
                    <SvgIcon>
                      <path d="M12.65 10C11.83 7.67 9.61 6 7 6a6 6 0 1 0 5.65 8H17v4h4v-4h2v-4H12.65ZM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                    </SvgIcon>
                  </IconButton>
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
      )}
      <Snackbar
        open={notice !== ''}
        autoHideDuration={3000}
        onClose={() => setNotice('')}
        message={userError(notice)}
      />

      <Dialog
        open={aboutDialogOpen}
        onClose={() => setAboutDialogOpen(false)}
        aria-labelledby="about-title"
      >
        <DialogTitle id="about-title">{selectedOvenName}</DialogTitle>
        <DialogContent>
          <Typography>Версия ПО: {__APP_VERSION__}</Typography>
          <Typography sx={{ mt: 1, overflowWrap: 'anywhere' }}>
            {networkError
              ? 'Не удалось узнать IP-адрес'
              : networkAddresses === null
                ? 'Проверка подключения…'
                : networkAddresses.length
                  ? `IP: ${networkAddresses.join(', ')}`
                  : 'Не подключена к сети'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAboutDialogOpen(false)}>Закрыть</Button>
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
