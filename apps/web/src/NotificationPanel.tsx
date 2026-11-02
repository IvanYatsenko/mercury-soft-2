/**
 * Необязательная настройка подписок браузерных уведомлений.
 */
import { requestSignal } from './requestSignal';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
const labels: Record<string, string> = {
  started: 'Запуск профиля',
  cycleCompleted: 'Завершение каждого цикла',
  completed: 'Завершение профиля',
  stopped: 'Остановка профиля',
  error: 'Ошибка печи',
  connectionLost: 'Потеря связи с платой',
};
const defaults = ['started', 'completed', 'error', 'connectionLost'];
/** Выполняет запрос панели подписок с проверкой HTTP-статуса и разбором JSON. */
async function request(path: string, body?: unknown) {
  const response = await fetch('/api/push/' + path, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }),
    cache: 'no-store',
    signal: requestSignal(8000),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(value.error ?? 'Служба уведомлений недоступна.');
  return value;
}
/** Декодирует открытый VAPID-ключ в формат API браузерных push-подписок. */
function applicationKey(value: string) {
  return Uint8Array.from(
    atob(value.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  );
}
/**
 * Отрисовывает NotificationPanel: Необязательная настройка подписок браузерных уведомлений.
 */
export function NotificationPanel() {
  const [status, setStatus] = useState<{
      enabled: boolean;
      reason?: string;
      publicKey?: string;
    } | null>(null),
    [events, setEvents] = useState(defaults),
    [subscription, setSubscription] = useState<PushSubscription | null>(null),
    [pin, setPin] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const secure = window.isSecureContext;
  const supported =
    secure &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const value = await request('status');
        if (!active) return;
        setStatus(value);
        if (supported) {
          const registration =
            await navigator.serviceWorker.getRegistration('/');
          const sub = await registration?.pushManager.getSubscription();
          if (sub) {
            const state = await request('state', {
              subscription: sub.toJSON(),
            });
            if (active && state.subscribed) {
              setSubscription(sub);
              setEvents(state.events);
            }
          }
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'Нет связи с сервером.');
      }
    })();
    return () => {
      active = false;
    };
  }, [supported]);
  /** Запрашивает разрешение браузера и регистрирует подписку только по действию пользователя. */
  const enable = async () => {
    if (!supported || !status?.publicKey) return;
    setBusy(true);
    setError('');
    setNotice('');
    let created: PushSubscription | null = null;
    try {
      // Permission request is the first asynchronous call after the user's tap.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted')
        throw Error(
          'Разрешите уведомления в настройках браузера или телефона.',
        );
      const registration = await navigator.serviceWorker.register(
        '/push-sw.js',
        { scope: '/', updateViaCache: 'none' },
      );
      await navigator.serviceWorker.ready;
      const expectedKey = applicationKey(status.publicKey);
      let sub = await registration.pushManager.getSubscription();
      const existingKey = sub?.options.applicationServerKey;
      if (
        sub &&
        existingKey &&
        (new Uint8Array(existingKey).length !== expectedKey.length ||
          new Uint8Array(existingKey).some(
            (value, index) => value !== expectedKey[index],
          ))
      ) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKey,
        });
        created = sub;
      }
      const result = await request('subscribe', {
        subscription: sub.toJSON(),
        events,
        pin,
      });
      setSubscription(sub);
      setEvents(result.events);
      setNotice('Уведомления для этого телефона включены.');
    } catch (e) {
      if (created)
        try {
          await created.unsubscribe();
        } catch {}
      setError(
        e instanceof Error ? e.message : 'Не удалось включить уведомления.',
      );
    } finally {
      setBusy(false);
      setPin('');
    }
  };
  /** Согласует флаг занятости и ошибку вокруг асинхронного действия панели. */
  const action = async (kind: 'unsubscribe' | 'test') => {
    if (!subscription) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(kind, { subscription: subscription.toJSON(), pin });
      if (kind === 'unsubscribe') {
        try {
          await subscription.unsubscribe();
        } catch {
          /* Server subscription is already removed. */
        }
        setSubscription(null);
        setNotice('Уведомления для этого телефона выключены.');
      } else
        setNotice(
          'Тест отправлен в push-службу. Проверьте уведомление на телефоне.',
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить запрос.');
    } finally {
      setBusy(false);
      setPin('');
    }
  };
  const enabled = supported && status?.enabled === true;
  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Typography fontWeight={700}>Уведомления на этот телефон</Typography>
      <Typography variant="body2" color="text.secondary">
        События выбранной печи. Настройки относятся только к этому телефону.
        Уведомления могут задерживаться и не заменяют сигнализацию печи.
      </Typography>
      {!secure && (
        <Alert severity="info">
          Для фоновых уведомлений нужен доверенный HTTPS-адрес печи. На текущем
          HTTP они недоступны.
        </Alert>
      )}
      {secure && !supported && (
        <Alert severity="info">
          Браузер не предоставляет Web Push. На iPhone добавьте Mercury на экран
          «Домой» и откройте его оттуда.
        </Alert>
      )}
      {status && !status.enabled && (
        <Alert severity="info">{status.reason}</Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      <Typography variant="body2">
        Состояние: {subscription ? 'включены' : 'не подключены'}
      </Typography>
      {Object.entries(labels).map(([kind, label]) => (
        <FormControlLabel
          key={kind}
          control={
            <Checkbox
              disabled={!enabled || busy}
              checked={events.includes(kind)}
              onChange={(_, v) =>
                setEvents((current) =>
                  v ? [...current, kind] : current.filter((k) => k !== kind),
                )
              }
            />
          }
          label={label}
        />
      ))}
      <TextField
        label="PIN-код уведомлений"
        type="password"
        autoComplete="off"
        value={pin}
        disabled={!enabled || busy}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4 } }}
      />
      <Button
        variant="contained"
        disabled={!enabled || busy || pin.length !== 4 || !events.length}
        onClick={() => void enable()}
      >
        {subscription ? 'Сохранить события' : 'Включить уведомления'}
      </Button>
      {subscription && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button
            disabled={!enabled || busy || pin.length !== 4}
            onClick={() => void action('test')}
          >
            Тест уведомления
          </Button>
          <Button
            color="warning"
            disabled={!enabled || busy || pin.length !== 4}
            onClick={() => void action('unsubscribe')}
          >
            Выключить
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
