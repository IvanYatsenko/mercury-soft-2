import {
  Card,
  CardContent,
  Button,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { KeyboardTextField } from './OnScreenKeyboard';

export interface OvenSettings {
  fanReferenceRpm: number;
  reactToFanErrors: boolean;
  soundOnErrors: boolean;
  thermalProtection: boolean;
  thermocoupleCorrection: boolean;
}

type SettingsPageProps = {
  settings: OvenSettings;
  onChange: (settings: OvenSettings) => void;
  onBack: () => void;
};

export function SettingsPage({ settings, onChange, onBack }: SettingsPageProps) {
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button onClick={onBack} startIcon={<span aria-hidden="true">←</span>} sx={{ minHeight: 48 }}>
          Назад
        </Button>
        <Typography variant="h6">Настройки печи</Typography>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle1" fontWeight={700}>
              Вентилятор
            </Typography>
            <KeyboardTextField
              label="Обороты/мин"
              type="number"
              value={String(settings.fanReferenceRpm)}
              onChange={(value) => onChange({ ...settings, fanReferenceRpm: Number(value) })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.reactToFanErrors}
                  onChange={(_, checked) =>
                    onChange({ ...settings, reactToFanErrors: checked })
                  }
                />
              }
              label="Реагировать на ошибку оборотов"
            />
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={0.25}>
            <Typography variant="subtitle1" fontWeight={700}>
              Защита и оповещения
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.soundOnErrors}
                  onChange={(_, checked) =>
                    onChange({ ...settings, soundOnErrors: checked })
                  }
                />
              }
              label="Звуковые сигналы при ошибках"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.thermalProtection}
                  onChange={(_, checked) =>
                    onChange({ ...settings, thermalProtection: checked })
                  }
                />
              }
              label="Термозащита"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.thermocoupleCorrection}
                  onChange={(_, checked) =>
                    onChange({ ...settings, thermocoupleCorrection: checked })
                  }
                />
              }
              label="Коррекция задней термопары"
            />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
