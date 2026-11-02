/**
 * Ввод PIN текущего клиента без сохранения введённого кода в браузерном хранилище.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  SvgIcon,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { usePcLayout } from './usePcLayout';

/**
 * Отрисовывает SettingsPinDialog: Ввод PIN текущего клиента без сохранения введённого кода в браузерном хранилище.
 */
export function SettingsPinDialog({
  open,
  onClose,
  onUnlock,
}: {
  open: boolean;
  onClose: () => void;
  onUnlock: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const compact = useMediaQuery('(max-width:600px)');
  const pcLayout = usePcLayout();
  const [recovery, setRecovery] = useState({
    pending: false,
    remainingSeconds: 0,
  });
  useEffect(() => {
    if (!open || pcLayout) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    void fetch('/api/settings-access/recovery/arm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open: true }),
    }).catch(() => {});
    /**
     * Читает актуальный серверный снимок для этого экрана; обработку результата выполняет владелец состояния.
     */
    const read = async () => {
      try {
        const response = await fetch('/api/settings-access/recovery', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (response.ok) {
          const value = await response.json();
          if (!controller.signal.aborted) setRecovery(value);
        }
      } catch {
        /* Shutdown can close the connection. */
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void read(), 500);
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
      void fetch('/api/settings-access/recovery/arm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: false }),
      }).catch(() => {});
    };
  }, [open, pcLayout]);
  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
    }
  }, [open]);
  /** Обновляет введённый код и очищает ошибку предыдущей попытки. */
  const change = (value: string) => {
    setPin(value.replace(/\D/g, '').slice(0, pcLayout ? 5 : 8));
    setError('');
  };
  /**
   * Обрабатывает подтверждение формы; ошибки запроса оставляет в текущем интерфейсе.
   */
  const submit = async () => {
    if (busy) return;
    if (!pcLayout && recovery.pending) {
      setBusy(true);
      setError('');
      try {
        const response = await fetch('/api/settings-access/recovery/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: pin }),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || 'Сброс не выполнен.');
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Сброс не выполнен.');
        setPin('');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (pin.length !== 4 && pin.length !== 5) {
      setError('Введите корректный PIN-код');
      return;
    }
    setBusy(true);
    try {
      await onUnlock(pin);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Не удалось разблокировать настройки',
      );
      setPin('');
    } finally {
      setBusy(false);
    }
  };
  if (pcLayout)
    return (
      <Dialog
        open={open}
        fullWidth
        maxWidth="xs"
        onClose={() => {
          if (!busy) onClose();
        }}
        aria-labelledby="settings-pin-title"
        slotProps={{
          paper: {
            sx: {
              m: 2,
              width: 'calc(100% - 32px)',
              borderRadius: '20px',
              border: 1,
              borderColor: 'divider',
            },
          },
          backdrop: {
            sx: { bgcolor: 'rgba(4,10,18,.65)', backdropFilter: 'blur(3px)' },
          },
        }}
      >
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogTitle component="div" sx={{ px: 3, pt: 3, pb: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box
                sx={{
                  display: 'flex',
                  p: 1,
                  borderRadius: '12px',
                  bgcolor: 'action.hover',
                  color: 'primary.main',
                }}
              >
                <SvgIcon aria-hidden="true">
                  <path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10h14V10a2 2 0 0 0-2-2ZM10 6a2 2 0 0 1 4 0v2h-4V6Zm3 10v2h-2v-2a2 2 0 1 1 2 0Z" />
                </SvgIcon>
              </Box>
              <Typography
                id="settings-pin-title"
                component="h2"
                sx={{ flex: 1, fontSize: 20, fontWeight: 650 }}
              >
                Доступ к настройкам
              </Typography>
              <IconButton
                aria-label="Закрыть"
                disabled={busy}
                onClick={onClose}
                sx={{ width: 44, height: 44, mr: -1 }}
              >
                <SvgIcon>
                  <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4Z" />
                </SvgIcon>
              </IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent sx={{ px: 3, pb: 1 }}>
            <TextField
              autoFocus
              fullWidth
              label="PIN-код"
              type="password"
              value={pin}
              disabled={busy}
              error={Boolean(error)}
              helperText={error || undefined}
              onChange={(event) => change(event.target.value)}
              inputProps={{
                inputMode: 'numeric',
                maxLength: 5,
                autoComplete: 'off',
              }}
              sx={{
                mt: 1.5,
                '& .MuiInputBase-root': { minHeight: 56, borderRadius: '12px' },
                '& input': { fontSize: 24, letterSpacing: 6 },
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3, pt: 2, gap: 1 }}>
            <Button disabled={busy} onClick={onClose} sx={{ minHeight: 44 }}>
              Отмена
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={busy || ![4, 5].includes(pin.length)}
              sx={{ minHeight: 44, px: 2.5 }}
            >
              {busy ? 'Проверка…' : 'Открыть настройки'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    );
  return (
    <Dialog
      open={open}
      fullScreen={compact}
      fullWidth
      maxWidth="xs"
      onClose={() => {
        if (!busy) onClose();
      }}
      aria-labelledby="settings-pin-title"
      slotProps={{
        paper: {
          sx: {
            height: pcLayout ? 'auto' : compact ? '100%' : 440,
            minHeight: pcLayout ? 0 : 320,
          },
        },
      }}
    >
      <Stack
        sx={{ p: pcLayout ? 3 : 0.5, height: '100%', minHeight: 0 }}
        spacing={pcLayout ? 2 : 0.5}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Button disabled={busy} onClick={onClose} sx={{ minHeight: 36 }}>
            ← Назад
          </Button>
          <Typography id="settings-pin-title" fontWeight={700}>
            {recovery.pending
              ? `Сброс PIN · ${recovery.remainingSeconds} с`
              : 'Доступ к настройкам'}
          </Typography>
        </Stack>
        <TextField
          autoFocus
          label="PIN-код"
          type="password"
          value={pin}
          disabled={busy}
          error={Boolean(error)}
          helperText={error || undefined}
          size="small"
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          inputProps={{
            inputMode: 'numeric',
            maxLength: 8,
            autoComplete: 'off',
          }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48, fontSize: 24 } }}
        />
        {pcLayout ? (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => void submit()}
          >
            Открыть настройки
          </Button>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flex: 1,
              minHeight: 0,
              pointerEvents: busy ? 'none' : 'auto',
            }}
          >
            <OnScreenKeyboard
              value={pin}
              onChange={change}
              onClose={() => void submit()}
              numericOnly
              integerOnly
              fullScreen
            />
          </Box>
        )}
      </Stack>
    </Dialog>
  );
}
