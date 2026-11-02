/**
 * Список найденных и добавленных вручную печей и редактирование имени текущего устройства.
 */
import { useEffect, useState } from 'react';
import { KeyboardTextField } from './OnScreenKeyboard';
import { connectionVoltageLabel } from '@mercury/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

type Identity = { name: string; description: string };
type Entry = {
  address: string;
  url: string;
  local: boolean;
  manual: boolean;
  discovered: boolean;
  online: boolean;
  lastSeen: string | null;
  error: string | null;
  device: {
    name: string;
    description: string;
    model: string;
    connectionVoltage: string;
    version: string;
    controller: {
      connected: boolean;
      ready: boolean;
      temperature: number | null;
    };
    run: {
      state: string;
      profileName: string | null;
      remainingSeconds: number;
    };
  } | null;
};
const states: Record<string, string> = {
  idle: 'Ожидание',
  preparing: 'Подготовка',
  running: 'Выполняется',
  cooling: 'Охлаждение',
  completed: 'Завершён',
  stopped: 'Остановлен',
  failed: 'Ошибка',
};
/**
 * Отрисовывает FleetPage: Список найденных и добавленных вручную печей и редактирование имени текущего устройства.
 */
export function FleetPage({
  unlocked,
  onUnlock,
}: {
  unlocked: boolean;
  onUnlock: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [discoveryError, setDiscoveryError] = useState('');
  const [address, setAddress] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    /**
     * Читает актуальный серверный снимок для этого экрана; обработку результата выполняет владелец состояния.
     */
    const read = async () => {
      try {
        const r = await fetch('/api/fleet', {
          signal: c.signal,
          cache: 'no-store',
        });
        if (!r.ok) throw new Error('Не удалось получить список печей');
        const data = await r.json();
        if (!c.signal.aborted) {
          setEntries(data.ovens);
          setDiscoveryError(data.discoveryError ?? '');
          setError('');
        }
      } catch {
        if (!c.signal.aborted)
          setError('Нет связи с Raspberry. Список может быть устаревшим.');
      } finally {
        if (!c.signal.aborted) timer = setTimeout(() => void read(), 5000);
      }
    };
    void read();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, []);
  /**
   * Добавляет подтверждённую пользователем запись в текущий каталог.
   */
  const add = async () => {
    setBusy(true);
    setActionError('');
    try {
      const r = await fetch('/api/settings/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setEntries(data.ovens);
      setOpen(false);
      setAddress('');
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Не удалось добавить печь',
      );
    } finally {
      setBusy(false);
    }
  };
  /**
   * Удаляет запись из каталога, не изменяя удалённую печь.
   */
  const remove = async (ip: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/settings/fleet/' + encodeURIComponent(ip), {
        method: 'DELETE',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setEntries(data.ovens);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить адрес');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography sx={{ fontSize: 20, fontWeight: 650 }}>
            Печи в локальной сети
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Автоматическое обнаружение · обновление каждые 5 секунд
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={() => {
            if (!unlocked) {
              onUnlock();
              return;
            }
            setOpen(true);
          }}
        >
          + Добавить по IP
        </Button>
      </Stack>
      {error && <Alert severity="warning">{error}</Alert>}
      {discoveryError && <Alert severity="info">{discoveryError}</Alert>}
      {!entries.length && (
        <Typography color="text.secondary">
          Поиск печей… Если устройство не появилось, добавьте его по IP.
        </Typography>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))',
          gap: 2,
        }}
      >
        {entries.map((e) => (
          <Card variant="outlined" key={e.address}>
            <CardContent>
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography sx={{ fontSize: 20, fontWeight: 650 }}>
                    {e.device?.name || 'Печь ' + e.address}
                  </Typography>
                  <Chip
                    size="small"
                    label={
                      e.local ? 'Эта печь' : e.discovered ? 'Найдена' : 'По IP'
                    }
                    variant="outlined"
                  />
                </Stack>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    minHeight: 20,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {e.device?.description || 'Без описания'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {e.address}:8075 ·{' '}
                  {e.device
                    ? `М${e.device.model} / ${connectionVoltageLabel(e.device.connectionVoltage)} В · ${e.device.version}`
                    : 'Ожидание ответа'}
                </Typography>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Chip
                    size="small"
                    color={
                      !error && e.online && e.device?.controller.connected
                        ? 'success'
                        : 'warning'
                    }
                    label={
                      error || !e.online
                        ? 'Нет связи с Raspberry'
                        : !e.device?.controller.connected
                          ? 'Нет связи с платой'
                          : e.device.controller.ready
                            ? 'Готова'
                            : 'Инициализация'
                    }
                  />
                  <Typography sx={{ fontSize: 30, fontWeight: 650 }}>
                    {!error &&
                    e.online &&
                    e.device?.controller.connected &&
                    e.device.controller.temperature != null
                      ? Math.round(e.device.controller.temperature) + ' °C'
                      : '—'}
                  </Typography>
                </Stack>
                {e.device && (
                  <Box sx={{ opacity: !error && e.online ? 1 : 0.5 }}>
                    <Typography variant="body2">
                      {states[e.device.run.state] ?? e.device.run.state} ·{' '}
                      {e.device.run.profileName ?? 'Профиль не запущен'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Осталось: {Math.floor(e.device.run.remainingSeconds / 60)}{' '}
                      мин {Math.round(e.device.run.remainingSeconds % 60)} с
                    </Typography>
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary">
                  {error || !e.online ? 'Устаревшие данные. ' : ''}
                  {e.lastSeen
                    ? 'Обновлено ' +
                      new Date(e.lastSeen).toLocaleTimeString('ru-RU')
                    : 'Нет полученных данных'}
                </Typography>
                <Stack direction="row" justifyContent="space-between">
                  <Button
                    component="a"
                    href={e.url}
                    disabled={!!error || !e.online}
                    variant="outlined"
                  >
                    {e.local ? 'Открыть эту печь' : 'Перейти к печи →'}
                  </Button>
                  {e.manual && unlocked && (
                    <Button
                      color="inherit"
                      disabled={busy}
                      onClick={() => void remove(e.address)}
                    >
                      Убрать адрес
                    </Button>
                  )}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Добавить печь по IP</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Доступная печь Mercury в той же подсети. Порт 8075.
            </Typography>
            <TextField
              autoFocus
              label="IP-адрес"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="10.10.1.167"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) void add();
              }}
            />
            {actionError && <Alert severity="error">{actionError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button
            disabled={busy || !address.trim()}
            onClick={() => void add()}
            variant="contained"
          >
            {busy ? 'Проверка…' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
/**
 * Отрисовывает OvenIdentityPanel: представление данных и действий родительского экрана.
 */
export function OvenIdentityPanel({
  value,
  onSaved,
  advanced = false,
}: {
  value: Identity;
  onSaved: (v: Identity) => void;
  advanced?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setDraft(value);
  }, [value.name, value.description]);
  /**
   * Отправляет подтверждённые изменения на сервер и обновляет состояние экрана по результату.
   */
  const save = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const r = await fetch('/api/settings/oven-identity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          advanced ? draft : { description: draft.description },
        ),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      onSaved(data);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Не удалось сохранить описание',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card variant="outlined" sx={{ mb: 2.5 }}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Описание печи</Typography>
          <Typography variant="body2" color="text.secondary">
            Сохраняются на Raspberry и видны другим печам и ПК в локальной сети.
          </Typography>
          {advanced && (
            <KeyboardTextField
              label="Название печи"
              value={draft.name}
              onChange={(e) => {
                setDraft({ ...draft, name: e.slice(0, 64) });
                setSaved(false);
              }}
              helperText="До 64 символов. Пустое поле — название модели."
            />
          )}
          <KeyboardTextField
            label="Описание"
            value={draft.description}
            onChange={(e) => {
              setDraft({ ...draft, description: e.slice(0, 240) });
              setSaved(false);
            }}
            helperText="Добавляется к названию печи. Например: Линия 1. До 240 символов."
          />
          {error && <Alert severity="error">{error}</Alert>}
          {saved && (
            <Alert severity="success">Название и описание сохранены</Alert>
          )}
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() => void save()}
            sx={{ alignSelf: 'start' }}
          >
            Сохранить описание
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
