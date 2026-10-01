import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';

type KeyboardLayout = 'ru' | 'en' | 'numbers';

type OnScreenKeyboardProps = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  numericOnly?: boolean;
  fullScreen?: boolean;
};

const layouts: Record<KeyboardLayout, string[]> = {
  ru: ['й ц у к е н г ш щ з х', 'ф ы в а п р о л д ж э', 'я ч с м и т ь б ю'],
  en: ['q w e r t y u i o p', 'a s d f g h j k l', 'z x c v b n m'],
  numbers: ['1 2 3', '4 5 6', '7 8 9', '0 . -'],
};

export function OnScreenKeyboard({
  value,
  onChange,
  onClose,
  numericOnly = false,
  fullScreen = false,
}: OnScreenKeyboardProps) {
  const [layout, setLayout] = useState<KeyboardLayout>(numericOnly ? 'numbers' : 'ru');

  const add = (key: string) => onChange(value + key);
  const backspace = () => onChange(value.slice(0, -1));

  return (
    <Paper
      elevation={fullScreen ? 0 : 8}
      sx={{
        p: fullScreen ? 0 : 1,
        mt: fullScreen ? 0 : 1,
        flex: fullScreen ? 1 : undefined,
        minHeight: fullScreen ? 0 : undefined,
        display: fullScreen ? 'flex' : undefined,
      }}
      aria-label="Экранная клавиатура"
    >
      <Stack spacing={fullScreen ? 0.5 : 0.75} sx={{ flex: fullScreen ? 1 : undefined, minHeight: 0 }}>
        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
          {!numericOnly && <Button fullWidth variant={layout === 'ru' ? 'contained' : 'outlined'} onClick={() => setLayout('ru')} sx={{ minHeight: fullScreen ? 36 : 40 }}>РУС</Button>}
          {!numericOnly && <Button fullWidth variant={layout === 'en' ? 'contained' : 'outlined'} onClick={() => setLayout('en')} sx={{ minHeight: fullScreen ? 36 : 40 }}>ENG</Button>}
          <Button fullWidth variant={layout === 'numbers' ? 'contained' : 'outlined'} onClick={() => setLayout('numbers')} sx={{ minHeight: fullScreen ? 36 : 40 }}>123</Button>
          {!fullScreen && <Button variant="outlined" onClick={onClose} sx={{ minWidth: 48, minHeight: 40 }}>✓</Button>}
        </Stack>

        <Stack spacing={0.5} sx={{ flex: fullScreen ? 1 : undefined, minHeight: 0 }}>
        {layouts[layout].map((row, index) => (
          <Stack key={`${layout}-${index}`} direction="row" spacing={0.5} justifyContent="center" sx={{ flex: fullScreen ? 1 : undefined, minHeight: 0 }}>
            {row.split(' ').map((key) => (
              <Button key={key} variant="outlined" onClick={() => add(key)} sx={{ flex: 1, minWidth: 0, minHeight: fullScreen ? 24 : 42, height: fullScreen ? '100%' : undefined, px: 0.5, fontSize: 18 }}>
                {key}
              </Button>
            ))}
            {layout !== 'numbers' && index === 2 && (
              <Button variant="outlined" color="warning" onClick={backspace} sx={{ minWidth: 48, minHeight: fullScreen ? 24 : 42, height: fullScreen ? '100%' : undefined }}>⌫</Button>
            )}
          </Stack>
        ))}
        </Stack>

        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
          {!numericOnly && <Button variant="outlined" onClick={() => add(' ')} sx={{ flex: 1, minHeight: fullScreen ? 36 : 42 }}>Пробел</Button>}
          {fullScreen && <Button variant="outlined" color="warning" onClick={backspace} sx={{ minWidth: 64, minHeight: 36 }}>⌫</Button>}
          {fullScreen && <Button variant="contained" onClick={onClose} sx={{ minWidth: 72, minHeight: 36 }}>Готово</Button>}
          {!fullScreen && <Button variant="outlined" color="warning" onClick={backspace} sx={{ minWidth: 68, minHeight: 42 }}>⌫</Button>}
        </Stack>
      </Stack>
    </Paper>
  );
}

export function KeyboardTextField({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TextField
        label={label}
        type="text"
        size="small"
        fullWidth
        value={value}
        disabled={disabled}
        inputProps={{ readOnly: true, inputMode: 'none' }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
      />
      {open && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1500,
            bgcolor: 'background.default',
            p: 0.5,
            display: 'flex',
          }}
        >
          <Stack spacing={0.75} sx={{ width: '100%', flex: 1, minHeight: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
              <Button onClick={() => setOpen(false)} sx={{ minWidth: 88, minHeight: 36 }}>← Назад</Button>
              <Typography variant="subtitle1" fontWeight={700} noWrap>{label}</Typography>
            </Stack>
            <TextField
              value={value}
              fullWidth
              inputProps={{ readOnly: true, inputMode: 'none', 'aria-label': label }}
              sx={{ flexShrink: 0, '& .MuiInputBase-root': { minHeight: 48, fontSize: 24 } }}
            />
            <OnScreenKeyboard
              value={value}
              onChange={onChange}
              onClose={() => setOpen(false)}
              numericOnly={type === 'number'}
              fullScreen
            />
          </Stack>
        </Box>
      )}
    </>
  );
}
