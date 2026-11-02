/**
 * Оповещения активного приложения по живому потоку событий; фоновые Web Push требуют отдельной инфраструктуры.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import {
  activeLabels,
  initialAlertPreferences,
  activeAlertText,
  type Preferences,
  type Event,
} from './activeAlertState';
const key = 'mercury.active-notifications.v1';
/** Управляет потоком событий и разрешённым пользователем звуком, возвращая очистку соединения при уходе с экрана. */
export function useActiveNotifications() {
  const [prefs, setPrefs] = useState<Preferences>(() => {
      try {
        return initialAlertPreferences(localStorage.getItem(key));
      } catch {
        return initialAlertPreferences(null);
      }
    }),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [live, setLive] = useState(false),
    [soundReady, setSoundReady] = useState(false);
  const audio = useRef<AudioContext | null>(null),
    current = useRef(prefs);
  current.current = prefs;
  /**
   * Отправляет подтверждённые изменения на сервер и обновляет состояние экрана по результату.
   */
  const save = (p: Preferences) => {
    setPrefs(p);
    try {
      localStorage.setItem(key, JSON.stringify(p));
    } catch {}
  };
  /** Воспроизводит браузерный звук после разрешающего жеста; это не пищалка платы. */
  const beep = () => {
    const context = audio.current;
    if (!context || context.state !== 'running') return;
    try {
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.22);
    } catch {}
  };
  /** Разблокирует аудиоконтекст по жесту пользователя и сохраняет настройку. */
  const enableSound = async () => {
    try {
      audio.current ??= new AudioContext();
      audio.current.onstatechange = () =>
        setSoundReady(audio.current?.state === 'running');
      await audio.current.resume();
      setSoundReady(audio.current.state === 'running');
      beep();
      save({ ...current.current, sound: true });
    } catch {
      setSoundReady(false);
    }
  };
  useEffect(() => {
    if (!prefs.enabled) {
      setLive(false);
      setToast(null);
      return;
    }
    let source: EventSource | null = null,
      active = true;
    /** Закрывает текущий поток событий и отменяет запланированное переподключение. */
    const disconnect = () => {
      source?.close();
      source = null;
      setLive(false);
      setToast(null);
    };
    /** Открывает живой поток событий и обрабатывает разрыв без повторной отправки команд нагрева. */
    const connect = () => {
      disconnect();
      if (!active || document.visibilityState !== 'visible') return;
      const stream = new EventSource('/api/notifications/events');
      source = stream;
      stream.onopen = () => {
        if (source === stream) setLive(true);
      };
      stream.onerror = () => {
        if (source === stream) setLive(false);
      };
      stream.onmessage = ({ data }) => {
        if (source !== stream || document.visibilityState !== 'visible') return;
        try {
          const event = JSON.parse(data) as Event;
          if (
            !current.current.events.includes(event.kind) ||
            typeof event.id !== 'string'
          )
            return;
          setToast({
            text: activeAlertText(event),
            error: event.kind === 'error' || event.kind === 'connectionLost',
          });
          if (current.current.sound) beep();
        } catch {}
      };
    };
    /** Согласует поток событий с видимостью страницы; фоновая доставка не гарантируется. */
    const visibility = () => {
      setSoundReady(audio.current?.state === 'running');
      if (document.visibilityState === 'visible') connect();
      else disconnect();
    };
    connect();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pageshow', visibility);
    window.addEventListener('pagehide', disconnect);
    return () => {
      active = false;
      disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pageshow', visibility);
      window.removeEventListener('pagehide', disconnect);
    };
  }, [prefs.enabled]);
  useEffect(
    () => () => {
      void audio.current?.close().catch(() => {});
    },
    [],
  );
  return {
    prefs,
    save,
    toast,
    closeToast: () => setToast(null),
    live,
    soundReady,
    enableSound,
  };
}
/**
 * Отрисовывает ActiveNotificationPanel: представление данных и действий родительского экрана.
 */
export function ActiveNotificationPanel({
  value,
  compact = false,
}: {
  value: ReturnType<typeof useActiveNotifications>;
  compact?: boolean;
}) {
  return (
    <Stack spacing={1.5}>
      <Typography fontWeight={700}>Оповещения открытой панели</Typography>
      {!compact && (
        <Alert severity="info">
          Работают по локальной сети без интернета, пока приложение открыто на
          экране. В свёрнутом виде и при блокировке телефона доставка не
          гарантируется.
        </Alert>
      )}
      <FormControlLabel
        control={
          <Switch
            checked={value.prefs.enabled}
            onChange={(_, enabled) => value.save({ ...value.prefs, enabled })}
          />
        }
        label="Показывать оповещения"
      />
      <Typography variant="body2">
        {!value.prefs.enabled
          ? 'Выключены'
          : value.live
            ? 'Ожидание событий печи'
            : 'Подключение к печи…'}
      </Typography>
      {Object.entries(activeLabels).map(([kind, label]) => (
        <FormControlLabel
          key={kind}
          control={
            <Checkbox
              disabled={!value.prefs.enabled}
              checked={value.prefs.events.includes(kind)}
              onChange={(_, enabled) =>
                value.save({
                  ...value.prefs,
                  events: enabled
                    ? [...value.prefs.events, kind]
                    : value.prefs.events.filter((v) => v !== kind),
                })
              }
            />
          }
          label={label}
        />
      ))}
      <FormControlLabel
        control={
          <Switch
            disabled={!value.prefs.enabled}
            checked={value.prefs.sound}
            onChange={(_, enabled) => {
              if (enabled) void value.enableSound();
              else value.save({ ...value.prefs, sound: false });
            }}
          />
        }
        label="Звук на этом устройстве"
      />
      {value.prefs.sound && !value.soundReady && (
        <Alert severity="warning">
          Для звука нажмите кнопку ниже после открытия приложения. Без
          разрешения браузера сообщения будут показываться без звука.
        </Alert>
      )}
      <Button
        disabled={!value.prefs.enabled}
        onClick={() => void value.enableSound()}
      >
        Разрешить и проверить звук
      </Button>
      <Typography variant="caption" color="text.secondary">
        Громкость и беззвучный режим телефона влияют на звук. Настройки
        относятся к этому устройству. История событий не сохраняется.
      </Typography>
    </Stack>
  );
}
