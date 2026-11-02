/**
 * Выбор модели, платы и подключения; не является проверкой реальной проводки.
 */
import { Box, Button, Stack, Typography } from '@mui/material';
import type { ConnectionVoltage, OvenModel } from '@mercury/shared';
import { ovenModelName, supportsConnection } from '@mercury/shared';

export type SelectionDraft = {
  ovenModel: OvenModel | null;
  connectionVoltage: ConnectionVoltage | null;
};

type OvenSelectionFormProps = {
  models: { model: OvenModel; name: string }[];
  value: SelectionDraft;
  onChange: (value: SelectionDraft) => void;
  onSave: () => void;
  saving: boolean;
  detectedBoardType?: '220V' | '230V' | '380V' | 'unknown' | undefined;
};

/**
 * Отрисовывает OvenSelectionForm: Выбор модели, платы и подключения; не является проверкой реальной проводки.
 */
export function OvenSelectionForm({
  models,
  value,
  onChange,
  onSave,
  saving,
  detectedBoardType,
}: OvenSelectionFormProps) {
  return (
    <Stack spacing={1.25}>
      <Typography variant="subtitle2" fontWeight={700}>
        Серия печи — модель определяется по плате
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 0.75,
        }}
      >
        {models.map(({ model, name }) => (
          <Button
            key={model}
            variant={value.ovenModel === model ? 'contained' : 'outlined'}
            onClick={() => onChange({ ...value, ovenModel: model })}
            sx={{ minHeight: 44 }}
          >
            {detectedBoardType && detectedBoardType !== 'unknown'
              ? ovenModelName(model, detectedBoardType)
              : name}
          </Button>
        ))}
      </Box>
      <Typography variant="subtitle2" fontWeight={700}>
        Подключение печи
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 0.75,
        }}
      >
        <Button
          variant={value.connectionVoltage === '230' ? 'contained' : 'outlined'}
          onClick={() => onChange({ ...value, connectionVoltage: '230' })}
          sx={{ minHeight: 44 }}
        >
          220 В
        </Button>
        <Button
          variant={value.connectionVoltage === '380' ? 'contained' : 'outlined'}
          disabled={detectedBoardType === '220V'}
          onClick={() => onChange({ ...value, connectionVoltage: '380' })}
          sx={{ minHeight: 44 }}
        >
          380 В
        </Button>
      </Box>
      {detectedBoardType === '220V' && (
        <Typography variant="body2" color="text.secondary">
          Старая плата: М300/М400, только 220 В.
        </Typography>
      )}
      {(detectedBoardType === '230V' || detectedBoardType === '380V') && (
        <Typography variant="body2" color="text.secondary">
          Новая плата: М301/М401. Выберите фактическое подключение 220 или 380
          В.
        </Typography>
      )}
      <Button
        fullWidth
        variant="contained"
        disabled={
          !value.ovenModel ||
          !value.connectionVoltage ||
          !supportsConnection(
            detectedBoardType,
            value.connectionVoltage ?? '',
          ) ||
          saving
        }
        onClick={onSave}
        sx={{ minHeight: 44 }}
      >
        {saving ? 'Сохранение…' : 'Сохранить'}
      </Button>
    </Stack>
  );
}
