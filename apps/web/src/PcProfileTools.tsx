/**
 * Проверка запуска, импорт, экспорт и передача копий профилей между печами.
 */
import { requestSignal } from './requestSignal';
import { connectionVoltageLabel } from '@mercury/shared';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Profile, ProfileSource } from '@mercury/shared';
import { parseProfileFile, profileFile } from './profileFiles';
/** Разбирает JSON-ответ браузерного API и преобразует ошибочный статус в исключение интерфейса. */
export async function pcJson(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    cache: 'no-store',
    signal: requestSignal(6000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Запрос отклонён сервером');
  return result;
}
type Assessment = {
  target: ProfileSource;
  reviewKey: string;
  valid: boolean;
  hasWarnings: boolean;
  reviews: {
    name: string;
    errors: string[];
    warnings: string[];
    sensor: string;
    maximumTemperatureC: number | null;
    cycles: number;
    cycleSeconds: number | null;
    totalSeconds: number | null;
  }[];
};
/** Форматирует длительность в компактные часы, минуты и секунды без изменения исходного времени. */
function time(n: number | null) {
  return n === null
    ? '—'
    : `${Math.floor(n / 3600) ? Math.floor(n / 3600) + ' ч ' : ''}${Math.floor((n % 3600) / 60)} мин ${Math.round(n % 60)} с`;
}
/**
 * Отрисовывает Review: представление данных и действий родительского экрана.
 */
function Review({ value }: { value: Assessment }) {
  return (
    <Stack spacing={1.5}>
      <Typography color="text.secondary">
        Проверено для М{value.target.model} /{' '}
        {connectionVoltageLabel(value.target.connectionVoltage)} В
      </Typography>
      {value.reviews.map((r, index) => (
        <Box key={index}>
          <Typography fontWeight={650}>{r.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {r.sensor === 'board' ? 'Датчик на плате' : 'Датчик камеры'} ·
            максимум {r.maximumTemperatureC ?? '—'} °C · {r.cycles} цикл.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Один цикл: {time(r.cycleSeconds)} · Всего: {time(r.totalSeconds)}
          </Typography>
          {r.errors.map((m, i) => (
            <Alert key={'e' + i} severity="error" sx={{ mt: 1 }}>
              {m}
            </Alert>
          ))}
          {r.warnings.map((m, i) => (
            <Alert key={'w' + i} severity="warning" sx={{ mt: 1 }}>
              {m}
            </Alert>
          ))}
        </Box>
      ))}
      <Typography variant="caption" color="text.secondary">
        Время рассчитано по профилю, без подготовки, пауз и межцикловых
        переходов. Горячий старт может сократить первый участок.
      </Typography>
    </Stack>
  );
}
/**
 * Отрисовывает StartReviewDialog: представление данных и действий родительского экрана.
 */
export function StartReviewDialog({
  open,
  onClose,
  profile,
  onStart,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile | undefined;
  onStart: (key: string, accepted: boolean, pin: string) => void;
  disabled: boolean;
}) {
  const [review, setReview] = useState<Assessment | null>(null),
    [startPin, setStartPin] = useState(''),
    [error, setError] = useState(''),
    [accepted, setAccepted] = useState(false);
  useEffect(() => {
    let active = true;
    if (open) {
      setReview(null);
      setStartPin('');
      setError('');
      setAccepted(false);
      void pcJson(
        '/api/run/preview?profileId=' + encodeURIComponent(profile?.id ?? ''),
      )
        .then((v) => {
          if (active) setReview(v);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [open, profile?.id]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Проверка перед запуском</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {review ? (
            <Review value={review} />
          ) : (
            !error && <Typography>Проверка профиля…</Typography>
          )}
          {review?.hasWarnings && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={accepted}
                  onChange={(_, v) => setAccepted(v)}
                />
              }
              label="Предупреждения прочитаны. Подтверждаю запуск с указанными отклонениями."
            />
          )}
          <TextField
            label="PIN-код запуска"
            type="password"
            value={startPin}
            autoComplete="off"
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5 } }}
            onChange={(e) =>
              setStartPin(e.target.value.replace(/\D/g, '').slice(0, 5))
            }
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={
            disabled ||
            ![4, 5].includes(startPin.length) ||
            !review?.valid ||
            (review.hasWarnings && !accepted)
          }
          onClick={() => {
            if (review) {
              onClose();
              onStart(review.reviewKey, accepted, startPin);
              setStartPin('');
            }
          }}
        >
          Подтвердить запуск
        </Button>
      </DialogActions>
    </Dialog>
  );
}
/** Создаёт браузерную загрузку JSON-профиля и освобождает временный object URL. */
function download(profiles: Profile[], source: ProfileSource) {
  const text = profileFile(profiles, source);
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download =
    profiles.length === 1
      ? profiles[0]!.name.replace(/[^\p{L}\p{N} _-]/gu, '_') + '.json'
      : 'mercury-profiles.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/**
 * Отрисовывает ExchangeDialog: представление данных и действий родительского экрана.
 */
function ExchangeDialog({
  open,
  onClose,
  profiles,
  source,
  transfer,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  profiles: Profile[];
  source: ProfileSource | undefined;
  transfer: boolean;
  onImported: () => void;
}) {
  const [review, setReview] = useState<Assessment | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false),
    [address, setAddress] = useState('');
  const [targets, setTargets] = useState<
    {
      address: string;
      online: boolean;
      local: boolean;
      device: { name: string } | null;
    }[]
  >([]);
  useEffect(() => {
    if (open) {
      setReview(null);
      setError('');
      setAccepted(false);
      setAddress('');
      if (transfer)
        void pcJson('/api/fleet')
          .then((v) =>
            setTargets(
              v.ovens.filter(
                (e: { online: boolean; local: boolean }) =>
                  e.online && !e.local,
              ),
            ),
          )
          .catch((e) => setError(e.message));
      else {
        setBusy(true);
        void pcJson('/api/profiles/import-preview', {
          method: 'POST',
          body: JSON.stringify({ profiles, source }),
        })
          .then(setReview)
          .catch((e) => setError(e.message))
          .finally(() => setBusy(false));
      }
    }
  }, [open]);
  /** Запрашивает совместимость с выбранной печью до передачи копии профиля. */
  const preview = async () => {
    setBusy(true);
    setError('');
    try {
      const v = await pcJson(
        '/api/profiles/' +
          encodeURIComponent(profiles[0]?.id ?? '') +
          '/transfer-preview',
        { method: 'POST', body: JSON.stringify({ address }) },
      );
      setReview(v);
      setAccepted(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Нет связи с получателем');
    } finally {
      setBusy(false);
    }
  };
  /**
   * Обрабатывает подтверждение формы; ошибки запроса оставляет в текущем интерфейсе.
   */
  const submit = async () => {
    if (!review) return;
    setBusy(true);
    setError('');
    try {
      await pcJson(
        transfer
          ? '/api/profiles/' +
              encodeURIComponent(profiles[0]?.id ?? '') +
              '/transfer'
          : '/api/profiles/batch-import',
        {
          method: 'POST',
          body: JSON.stringify({
            ...(transfer ? { address } : { profiles, source }),
            reviewKey: review.reviewKey,
            acceptWarnings: accepted,
          }),
        },
      );
      onImported();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Нет подтверждения операции. Проверьте список профилей перед повтором.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>
        {transfer ? 'Передать профиль на другую печь' : 'Импорт профилей'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography color="text.secondary">
            Будут созданы новые копии. Существующие профили не перезаписываются.
            Нагрев не запускается.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {transfer && !review && (
            <>
              <TextField
                select
                label="Печь-получатель"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              >
                {targets.map((e) => (
                  <MenuItem key={e.address} value={e.address}>
                    {e.device?.name ?? 'Mercury'} · {e.address}
                  </MenuItem>
                ))}
              </TextField>
              {!targets.length && (
                <Typography color="text.secondary">
                  Нет доступных соседних печей. Добавьте адрес в разделе «Печи в
                  сети».
                </Typography>
              )}
              <Button
                disabled={!address || busy}
                onClick={() => void preview()}
              >
                Проверить совместимость
              </Button>
            </>
          )}
          {review && (
            <>
              <Review value={review} />
              {review.hasWarnings && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={accepted}
                      onChange={(_, v) => setAccepted(v)}
                    />
                  }
                  label="Предупреждения прочитаны, подтверждаю сохранение копий."
                />
              )}
            </>
          )}
          {busy && (
            <Typography color="text.secondary">
              Проверка и сохранение…
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disabled={busy || !review?.valid || (review.hasWarnings && !accepted)}
          onClick={() => void submit()}
        >
          {transfer ? 'Передать копию' : 'Импортировать копии'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
/**
 * Отрисовывает ProfileLibraryBar: представление данных и действий родительского экрана.
 */
export function ProfileLibraryBar({
  profiles,
  source,
  canEdit,
  disabled,
  onImported,
}: {
  profiles: Profile[];
  source: ProfileSource;
  canEdit: boolean;
  disabled: boolean;
  onImported: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<ReturnType<
      typeof parseProfileFile
    > | null>(null),
    [error, setError] = useState('');
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {canEdit && (
          <Button
            variant="outlined"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            Импорт JSON
          </Button>
        )}
        <Button
          variant="outlined"
          disabled={disabled || !profiles.length}
          onClick={() => {
            try {
              download(profiles, source);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Не удалось экспортировать',
              );
            }
          }}
        >
          Экспорт всех профилей
        </Button>
      </Stack>
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setError('');
          if (file.size > 80 * 1024) {
            setError('Файл должен быть не больше 80 КБ.');
            return;
          }
          void file
            .text()
            .then((text) => setPayload(parseProfileFile(text)))
            .catch((err) => setError(err.message));
        }}
      />
      {payload && (
        <ExchangeDialog
          open
          onClose={() => setPayload(null)}
          profiles={payload.profiles}
          source={payload.source}
          transfer={false}
          onImported={onImported}
        />
      )}
    </Stack>
  );
}
/**
 * Отрисовывает ProfileRowTools: представление данных и действий родительского экрана.
 */
export function ProfileRowTools({
  profile,
  source,
  canEdit,
  disabled,
  onDuplicate,
  onImported,
}: {
  profile: Profile;
  source: ProfileSource;
  canEdit: boolean;
  disabled: boolean;
  onDuplicate: () => void;
  onImported: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null),
    [exchange, setExchange] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <Button
        disabled={disabled}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={'Действия с профилем ' + profile.name}
      >
        Ещё
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {canEdit && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              onDuplicate();
            }}
          >
            Дублировать
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setAnchor(null);
            try {
              download([profile], source);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Ошибка экспорта');
            }
          }}
        >
          Экспорт JSON
        </MenuItem>
        {canEdit && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setExchange(true);
            }}
          >
            Передать на печь
          </MenuItem>
        )}
      </Menu>
      <ExchangeDialog
        open={exchange}
        onClose={() => setExchange(false)}
        profiles={[profile]}
        source={source}
        transfer
        onImported={onImported}
      />
      <Dialog open={!!error} onClose={() => setError('')}>
        <DialogContent>
          <Alert severity="error">{error}</Alert>
        </DialogContent>
      </Dialog>
    </>
  );
}
