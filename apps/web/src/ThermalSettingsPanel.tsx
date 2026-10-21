import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { defaultThermalSettings, type ThermalSettings } from '@mercury/shared';
import { KeyboardTextField } from './OnScreenKeyboard';

export function ThermalSettingsPanel({
  disabled,
  voltage,
}: {
  disabled: boolean;
  voltage: string;
}) {
  const [settings, setSettings] = useState<ThermalSettings>(
    defaultThermalSettings,
  );
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/settings/thermal', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Не удалось загрузить настройки регулирования');
        return response.json();
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setSettings(value);
          setReady(true);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, []);
  const locked = disabled || busy || !ready;
  function change(key: keyof ThermalSettings, value: number) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }
  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch('/api/settings/thermal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setSettings(value);
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography fontWeight={700}>Регулирование нагрева</Typography>
          <FormControl size="small" fullWidth disabled={locked}>
            <InputLabel id="heat-mode-label">Нагрев</InputLabel>
            <Select
              labelId="heat-mode-label"
              label="Нагрев"
              value={settings.mode}
              onChange={(event) => {
                setSettings((current) => ({
                  ...current,
                  mode: event.target.value as ThermalSettings['mode'],
                }));
                setSaved(false);
              }}
            >
              <MenuItem value="heaters">ТЭНы</MenuItem>
              <MenuItem value="lamps">Лампы</MenuItem>
              <MenuItem value="combined">ТЭНы и лампы</MenuItem>
            </Select>
          </FormControl>
          {(['auxiliaryPowerW'] as const).map((key) => (
            <KeyboardTextField
              key={key}
              label={
                {
                  auxiliaryPowerW: 'Вентиляторы и электроника, Вт (суммарно)',
                }[key]
              }
              value={String(settings[key])}
              type="number"
              disabled={locked}
              onChange={(value) => change(key, Number(value.replace(',', '.')))}
            />
          ))}
          <Typography variant="caption">
            {voltage === '380'
              ? '380 В: программный лимит 10 А не применяется.'
              : '220/230 В: до 10 А. Нагрузки чередуются, если совместное включение превышает лимит.'}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {saved && <Alert severity="success">Сохранено</Alert>}
          <Button
            variant="contained"
            disabled={locked}
            onClick={() => void save()}
            sx={{ minHeight: 48 }}
          >
            Сохранить регулирование
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
