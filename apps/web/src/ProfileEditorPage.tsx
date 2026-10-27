import type { TemperatureRate } from '@mercury/shared';
import {
  Box,
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  convertProfileMode,
  validateProfile,
  manualCoolingWarnings,
  type EasyProfile,
  type ManualProfile,
  type Profile,
  type TemperatureValue,
} from '@mercury/shared';
import { useState } from 'react';
import { KeyboardTextField } from './OnScreenKeyboard';
import { ProfileNumberField } from './ProfileNumberField';

type ProfileEditorPageProps = {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
  heatingRate?: TemperatureRate;
  coolingRate?: TemperatureRate;
};

export function ProfileEditorPage({
  profile,
  onChange,
  onCancel,
  onSave,
  onDelete,
  heatingRate = 0.7,
  coolingRate = 0.4,
}: ProfileEditorPageProps) {
  const [pendingMode, setPendingMode] = useState<'easy' | 'manual' | null>(
    null,
  );

  let validationError: string | null = null;
  try {
    validateProfile(profile);
  } catch (error) {
    validationError =
      error instanceof Error ? error.message : 'Исправьте значения профиля.';
  }

  const updatePoint = (
    index: number,
    field: keyof TemperatureValue,
    value: number,
  ) => {
    const points = profile.points.map((point, pointIndex) =>
      pointIndex === index ? { ...point, [field]: value } : point,
    );
    onChange({ ...profile, points });
  };

  const updateShelf = (
    index: number,
    field: keyof TemperatureValue,
    value: number,
  ) => {
    if (profile.mode === 'easy') {
      const shelves = profile.shelves.map((shelf, shelfIndex) =>
        shelfIndex === index ? { ...shelf, [field]: value } : shelf,
      ) as EasyProfile['shelves'];
      onChange({ ...profile, shelves });
      return;
    }

    const shelves = profile.shelves.map((shelf, shelfIndex) =>
      shelfIndex === index ? { ...shelf, [field]: value } : shelf,
    ) as ManualProfile['shelves'];
    onChange({ ...profile, shelves });
  };

  const toggleRepeat = (enabled: boolean) => {
    const updatedProfile = { ...profile };
    if (enabled) updatedProfile.repeat = profile.repeat ?? 1;
    else delete updatedProfile.repeat;
    onChange(updatedProfile);
  };

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton aria-label="Назад" onClick={onCancel} size="small">
          ←
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" noWrap sx={{ fontSize: { xs: 16, sm: 20 } }}>
            Профиль
          </Typography>
        </Box>
        <Button
          variant="contained"
          disabled={validationError !== null}
          onClick={() => {
            if (!validationError) onSave();
          }}
          title="Сохранить профиль"
          sx={{ minWidth: { xs: 38, sm: 64 }, px: { xs: 1, sm: 2 } }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Сохранить
          </Box>
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
            ✓
          </Box>
        </Button>
      </Stack>

      {validationError && <Alert severity="error">{validationError}</Alert>}

      {onDelete && (
        <Button color="error" variant="outlined" onClick={onDelete}>
          Удалить профиль
        </Button>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.25}>
            <KeyboardTextField
              label="Название профиля"
              value={profile.name}
              onChange={(name) => onChange({ ...profile, name })}
            />
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
            >
              <TextField
                select
                disabled={validationError !== null}
                label="Режим профиля"
                size="small"
                value={profile.mode}
                onChange={(event) => {
                  const nextMode = event.target.value as 'easy' | 'manual';
                  if (profile.mode === 'manual' && nextMode === 'easy') {
                    setPendingMode(nextMode);
                  } else if (nextMode !== profile.mode) {
                    onChange(
                      convertProfileMode(
                        profile,
                        nextMode,
                        heatingRate,
                        coolingRate,
                      ),
                    );
                  }
                }}
                sx={{ minWidth: 190 }}
              >
                <MenuItem value="easy">Простой</MenuItem>
                <MenuItem value="manual">Ручной</MenuItem>
              </TextField>
              <FormControlLabel
                control={
                  <Switch
                    checked={profile.board}
                    onChange={(_, checked) =>
                      onChange({ ...profile, board: checked })
                    }
                  />
                }
                label="Датчик на плате"
              />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <FormControlLabel
                control={
                  <Switch
                    checked={profile.repeat !== undefined}
                    onChange={(_, checked) => toggleRepeat(checked)}
                  />
                }
                label="Повторять профиль"
              />
              {profile.repeat !== undefined && (
                <Box sx={{ width: 110 }}>
                  <ProfileNumberField
                    label="Повторов"
                    min={1}
                    max={20}
                    integer
                    value={profile.repeat}
                    onChange={(value) =>
                      onChange({ ...profile, repeat: value })
                    }
                  />
                </Box>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {manualCoolingWarnings(profile, coolingRate).map(
        ({ index, requiredSeconds }) => (
          <Alert severity="warning" key={index}>
            Участок {index}: охлаждение слишком быстрое. Для линейного спуска
            нужно примерно {Math.floor(requiredSeconds / 60)} мин{' '}
            {requiredSeconds % 60} с. Раздели участок по температурным
            диапазонам или увеличь время.
          </Alert>
        ),
      )}
      {profile.mode === 'easy' && (
        <>
          <Typography variant="subtitle1" fontWeight={700}>
            Этапы
          </Typography>
          {profile.shelves.map((shelf, index) => {
            const shelfName = ['Выдерживание', 'Плавление', 'Охлаждение'][
              index
            ];
            const calculatedCooling = profile.mode === 'easy' && index === 2;

            return (
              <Card key={index} variant="outlined">
                <CardContent sx={{ p: '10px !important' }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {shelfName}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <ProfileNumberField
                        min={0}
                        max={99999}
                        integer
                        label={
                          calculatedCooling
                            ? 'Охлаждение рассчитывает печь'
                            : 'Время, с'
                        }
                        value={shelf.second}
                        disabled={calculatedCooling}
                        onChange={(value) =>
                          updateShelf(index, 'second', value)
                        }
                      />
                      <ProfileNumberField
                        label="Температура, °C"
                        min={0}
                        max={280}
                        value={shelf.temperature}
                        onChange={(value) =>
                          updateShelf(index, 'temperature', value)
                        }
                      />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      {profile.mode === 'manual' && (
        <>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="subtitle1" fontWeight={700}>
              Участки
            </Typography>
            <Button
              size="small"
              onClick={() =>
                onChange({
                  ...profile,
                  points: [...profile.points, { second: 30, temperature: 30 }],
                })
              }
            >
              + Участок
            </Button>
          </Stack>

          {profile.points.map((point, index) => (
            <Box
              key={index}
              sx={{ borderBottom: 1, borderColor: 'divider', py: 0.75 }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Typography variant="caption" sx={{ width: 22 }}>
                  {index + 1}
                </Typography>
                <ProfileNumberField
                  label="Время, с"
                  min={index === 0 ? 0 : 1}
                  max={index === 0 ? 0 : 99999}
                  integer
                  value={point.second}
                  onChange={(value) => updatePoint(index, 'second', value)}
                />
                <ProfileNumberField
                  label="Температура, °C"
                  min={0}
                  max={280}
                  value={point.temperature}
                  onChange={(value) => updatePoint(index, 'temperature', value)}
                />
                <Button
                  aria-label={`Удалить участок ${index + 1}`}
                  color="error"
                  size="small"
                  onClick={() =>
                    onChange({
                      ...profile,
                      points: profile.points.filter(
                        (_, pointIndex) => pointIndex !== index,
                      ),
                    })
                  }
                >
                  ×
                </Button>
              </Stack>
            </Box>
          ))}
        </>
      )}

      <Dialog open={pendingMode !== null} onClose={() => setPendingMode(null)}>
        <DialogTitle>Пересчитать профиль?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            При переходе в простой режим подробные участки будут объединены в
            полки, поэтому часть данных может потеряться. Полки и новый профиль
            будут рассчитаны с учётом максимальной температуры{' '}
            {`${Math.round(Math.max(...profile.points.map((point) => point.temperature), 0))} °C`}
            . Продолжить?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingMode(null)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pendingMode)
                onChange(
                  convertProfileMode(
                    profile,
                    pendingMode,
                    heatingRate,
                    coolingRate,
                  ),
                );
              setPendingMode(null);
            }}
          >
            Пересчитать
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
