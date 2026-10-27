import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { OnScreenKeyboard } from './OnScreenKeyboard';

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
  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
    }
  }, [open]);
  const change = (value: string) => {
    setPin(value.replace(/\D/g, '').slice(0, 5));
    setError('');
  };
  const submit = async () => {
    if (busy) return;
    if (pin.length !== 4 && pin.length !== 5) {
      setError('Введите 4 или 5 цифр');
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
        paper: { sx: { height: compact ? '100%' : 440, minHeight: 320 } },
      }}
    >
      <Stack sx={{ p: 0.5, height: '100%', minHeight: 0 }} spacing={0.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Button disabled={busy} onClick={onClose} sx={{ minHeight: 36 }}>
            ← Назад
          </Button>
          <Typography id="settings-pin-title" fontWeight={700}>
            Доступ к настройкам
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
            maxLength: 5,
            autoComplete: 'off',
          }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48, fontSize: 24 } }}
        />
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
      </Stack>
    </Dialog>
  );
}
