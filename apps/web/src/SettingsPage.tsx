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
import { SoftwareUpdatePanel } from './SoftwareUpdatePanel';
import type { OvenModel, OvenSelection } from '@mercury/shared';

export interface OvenSettings {
  convectionEnabled: boolean;
  fanReferenceHz: number;
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
  fanHz: number | null;
  fanWear: number | null;
  onConfirmFanReference: () => void;
  savingFanReference: boolean;
  onBack: () => void;
  onHistory: () => void;
  runActive: boolean;
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
  fanHz,
  fanWear,
  onConfirmFanReference,
  savingFanReference,
  onBack,
  onHistory,
  runActive,
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

      <Button variant="outlined" onClick={onHistory} sx={{ minHeight: 44 }}>
        История запусков
      </Button>
      <SoftwareUpdatePanel disabled={runActive} />
      {runActive && (
        <Typography color="warning.main">
          Профиль выполняется. Изменение оборудования недоступно.
        </Typography>
      )}

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
            <Typography variant="body2">
              Текущая частота: {fanHz == null ? '—' : fanHz + ' Гц'} · Износ:{' '}
              {fanWear == null ? '—' : fanWear + '%'}
            </Typography>
            <KeyboardTextField
              label="Эталонная частота, Гц"
              type="number"
              value={String(settings.fanReferenceHz)}
              onChange={(value) =>
                onChange({ ...settings, fanReferenceHz: Number(value) })
              }
            />
            <Button
              variant="outlined"
              onClick={() =>
                fanHz != null &&
                onChange({ ...settings, fanReferenceHz: fanHz })
              }
              disabled={
                !settings.convectionEnabled ||
                fanHz == null ||
                fanHz < 1 ||
                savingFanReference
              }
            >
              Использовать текущую частоту
            </Button>
            <Button
              variant="contained"
              onClick={onConfirmFanReference}
              disabled={
                savingFanReference ||
                !Number.isFinite(settings.fanReferenceHz) ||
                settings.fanReferenceHz < 1 ||
                settings.fanReferenceHz > 1000
              }
            >
              Подтвердить эталон
            </Button>
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
