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
import { OvenSelectionForm, type SelectionDraft } from './OvenSelectionForm';
import { ElementTestPanel } from './ElementTestPanel';
import type { OvenModel, OvenSelection } from '@mercury/shared';

export interface OvenSettings {
  convectionEnabled: boolean;
  fanReferenceRpm: number;
  reactToFanErrors: boolean;
  soundOnErrors: boolean;
  thermalProtection: boolean;
  thermocoupleCorrection: boolean;
}

type SettingsPageProps = {
  settings: OvenSettings;
  onChange: (settings: OvenSettings) => void;
  ovenModels: { model: OvenModel; name: string }[];
  ovenSelection: SelectionDraft;
  savedOvenSelection: OvenSelection;
  onOvenSelectionChange: (value: SelectionDraft) => void;
  onSaveOvenSelection: () => void;
  savingOvenSelection: boolean;
  detectedBoardType?: '220V' | '230V' | '380V' | 'unknown' | undefined;
  controllerConnected: boolean;
  controllerReady: boolean;
  controllerSimulated: boolean;
  onConvectionChange: (enabled: boolean) => void;
  convectionChanging: boolean;
  onBack: () => void;
};

export function SettingsPage({
  settings,
  onChange,
  ovenModels,
  ovenSelection,
  savedOvenSelection,
  onOvenSelectionChange,
  onSaveOvenSelection,
  savingOvenSelection,
  detectedBoardType,
  controllerConnected,
  controllerReady,
  controllerSimulated,
  onConvectionChange,
  convectionChanging,
  onBack,
}: SettingsPageProps) {
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button
          onClick={onBack}
          startIcon={<span aria-hidden="true">←</span>}
          sx={{ minHeight: 48 }}
        >
          Назад
        </Button>
        <Typography variant="h6">Настройки печи</Typography>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <OvenSelectionForm
            models={ovenModels}
            value={ovenSelection}
            onChange={onOvenSelectionChange}
            onSave={onSaveOvenSelection}
            saving={savingOvenSelection}
            detectedBoardType={detectedBoardType}
          />
        </CardContent>
      </Card>

      <ElementTestPanel
        selected={savedOvenSelection}
        draft={ovenSelection}
        connected={controllerConnected}
        ready={controllerReady}
        simulated={controllerSimulated}
        boardType={detectedBoardType}
        convectionOn={settings.convectionEnabled}
      />

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle1" fontWeight={700}>
              Вентилятор
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.convectionEnabled}
                  disabled={
                    !controllerConnected ||
                    !controllerReady ||
                    convectionChanging
                  }
                  onChange={(_, checked) => onConvectionChange(checked)}
                />
              }
              label="Конвекционный вентилятор"
            />
            <KeyboardTextField
              label="Обороты/мин"
              type="number"
              value={String(settings.fanReferenceRpm)}
              onChange={(value) =>
                onChange({ ...settings, fanReferenceRpm: Number(value) })
              }
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
