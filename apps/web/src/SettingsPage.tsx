import {
  Card,
  Alert,
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
}

type SettingsPageProps = {
  advancedAccess: boolean;
  combinedRoles: boolean;
  combinedRolesChanging: boolean;
  onCombinedRolesChange: (enabled: boolean) => void;
  onThermalProtectionChange: (enabled: boolean) => void;
  thermalProtectionChanging: boolean;
  onSoundOnErrorsChange: (enabled: boolean) => void;
  soundOnErrorsChanging: boolean;
  fanWarning: string | null;
  onFanWarningsChange: (enabled: boolean) => void;
  fanWarningsChanging: boolean;
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
  referenceHz: number;
  onConfirmFanReference: () => void;
  savingFanReference: boolean;
  onBack: () => void;
  onHistory: () => void;
  runActive: boolean;
};

export function SettingsPage({
  advancedAccess,
  combinedRoles,
  combinedRolesChanging,
  onCombinedRolesChange,
  onThermalProtectionChange,
  thermalProtectionChanging,
  onSoundOnErrorsChange,
  soundOnErrorsChanging,
  fanWarning,
  onFanWarningsChange,
  fanWarningsChanging,
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
  referenceHz,
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

      {advancedAccess && (
        <Button variant="outlined" onClick={onHistory} sx={{ minHeight: 44 }}>
          История запусков
        </Button>
      )}
      <SoftwareUpdatePanel disabled={runActive} />
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={0.5}>
            <Typography fontWeight={700}>Доступ</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={combinedRoles}
                  disabled={combinedRolesChanging || runActive}
                  onChange={(_, checked) => onCombinedRolesChange(checked)}
                />
              }
              label="Объединять роль оператора и инженера"
            />
            <Typography variant="caption" color="text.secondary">
              Если выключено, создание и редактирование профилей доступны только
              после ввода PIN-кода настроек.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {runActive && (
        <Typography color="warning.main">
          Профиль выполняется. Изменение оборудования недоступно.
        </Typography>
      )}

      {advancedAccess && (
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
      )}

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
              Текущая частота: {fanHz == null ? '—' : fanHz + ' Гц'}
            </Typography>
            {advancedAccess && (
              <>
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
              </>
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={settings.reactToFanErrors}
                  disabled={fanWarningsChanging}
                  onChange={(_, checked) => onFanWarningsChange(checked)}
                />
              }
              label="Реагировать на ошибку оборотов"
            />
            <Typography variant="caption" color="text.secondary">
              Ниже {(referenceHz * 0.5).toLocaleString('ru-RU')} Гц —
              предупреждение о точности профиля. Ниже{' '}
              {(referenceHz * 0.2).toLocaleString('ru-RU')} Гц — дополнительно
              жёлтое мерцание при выполнении. Профиль не останавливается.
            </Typography>
            {fanWarning && <Alert severity="warning">{fanWarning}</Alert>}
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
                  disabled={soundOnErrorsChanging}
                  onChange={(_, checked) => onSoundOnErrorsChange(checked)}
                />
              }
              label="Звуковые сигналы при ошибках"
            />
            <Typography variant="caption" color="text.secondary">
              Сигнал открытой двери и программных ошибок. Звуки включения и
              завершения профиля не отключаются. Аварийный звук самой платы
              независим.
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.thermalProtection}
                  disabled={thermalProtectionChanging || runActive}
                  onChange={(_, checked) => onThermalProtectionChange(checked)}
                />
              }
              label="Термозащита"
            />
            <Typography variant="caption" color="text.secondary">
              Общий перегрев: {settings.thermalProtection ? 285 : 300} °C. При
              поддержании 100 °C: {settings.thermalProtection ? 130 : 150} °C.
              Защита платы работает независимо.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
