import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PanelLayout from '../components/PanelLayout';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import { Save, Add, Remove, ArrowBack, Description, AutoAwesome } from '@mui/icons-material';
import { apiService } from '../services/api';
import { TemperatureStage, ShelvesStage } from '@mercury-soft-2/shared';

const ProfileCreatePage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'easy' | 'manual'>('manual');
  const [useExternalSensor, setUseExternalSensor] = useState(false);
  const [stages, setStages] = useState<TemperatureStage[]>([]);
  const [shelves, setShelves] = useState<ShelvesStage>({ time: 0, temperature: 0 });

  // Templates
  const templates = [
    {
      name: 'Бессвинцовый припой',
      stages: [
        { second: 45, temperature: 150 },
        { second: 75, temperature: 217 },
        { second: 20, temperature: 250 },
        { second: 45, temperature: 100 },
      ] as TemperatureStage[],
      mode: 'easy' as const,
    },
    {
      name: 'Свинцовый припой',
      stages: [
        { second: 60, temperature: 130 },
        { second: 90, temperature: 183 },
        { second: 30, temperature: 215 },
        { second: 60, temperature: 80 },
      ] as TemperatureStage[],
      mode: 'manual' as const,
    },
    {
      name: 'Тонкая плата',
      stages: [
        { second: 30, temperature: 120 },
        { second: 60, temperature: 200 },
        { second: 15, temperature: 235 },
        { second: 30, temperature: 80 },
      ] as TemperatureStage[],
      mode: 'manual' as const,
    },
  ];

  const applyTemplate = (templateStages: TemperatureStage[]) => {
    setStages(templateStages);
  };

  const addStage = () => {
    setStages([...stages, { second: 30, temperature: 150 }]);
  };

  const removeStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, field: keyof TemperatureStage, value: number) => {
    const updated = [...stages];
    updated[index] = { ...updated[index], [field]: value };
    setStages(updated);
  };

  const moveStage = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= stages.length) return;
    const updated = [...stages];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setStages(updated);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setApiError('Название профиля обязательно');
      return;
    }
    if (stages.length === 0) {
      setApiError('Добавьте хотя бы один этап');
      return;
    }

    try {
      setSaving(true);
      setApiError(null);
      setSuccessMessage(null);

      const created = await apiService.createThermalProfile({
        name: name.trim(),
        stages,
        mode,
        useExternalSensor,
        shelves,
      });

      setSuccessMessage('Профиль успешно создан');
      setTimeout(() => {
        navigate(`/profile/edit/${created.id}`);
      }, 1500);
    } catch (error) {
      console.error('Failed to create profile:', error);
      setApiError('Ошибка при создании профиля');
    } finally {
      setSaving(false);
    }
  };

  const totalDuration = stages.reduce((acc, s) => acc + s.second, 0);
  const maxTemp = Math.max(...stages.map((s) => s.temperature), 0);

  return (
    <PanelLayout
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button startIcon={<ArrowBack />} onClick={() => navigate('/')} size="small">
            Назад
          </Button>
          <Typography variant="h6">Создание профиля</Typography>
        </Box>
      }
      leftPanel={
        <>
          {/* Success Message */}
          {successMessage && <Alert severity="success">{successMessage}</Alert>}

          {/* Error Message */}
          {apiError && <Alert severity="error">{apiError}</Alert>}

          {/* Profile Name */}
          <TextField
            label="Название профиля"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Мой профиль"
            variant="outlined"
          />

          {/* Mode */}
          <TextField
            select
            label="Режим редактирования"
            fullWidth
            value={mode}
            onChange={(e) => setMode(e.target.value as 'easy' | 'manual')}
            variant="outlined"
          >
            <MenuItem value="manual">Детальный</MenuItem>
            <MenuItem value="easy">Упрощённый</MenuItem>
          </TextField>

          {/* External Sensor */}
          <FormControlLabel
            control={
              <Switch
                checked={useExternalSensor}
                onChange={(e) => setUseExternalSensor(e.target.checked)}
              />
            }
            label="Внешний датчик"
          />

          {/* Shelves (for easy mode) */}
          {mode === 'easy' && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Параметры полки
              </Typography>
              <TextField
                label="Время (с)"
                type="number"
                fullWidth
                value={shelves.time}
                onChange={(e) => setShelves({ ...shelves, time: parseInt(e.target.value) || 0 })}
                variant="outlined"
                size="small"
                sx={{ mb: 1 }}
              />
              <TextField
                label="Температура (°C)"
                type="number"
                fullWidth
                value={shelves.temperature}
                onChange={(e) =>
                  setShelves({ ...shelves, temperature: parseInt(e.target.value) || 0 })
                }
                variant="outlined"
                size="small"
              />
            </Box>
          )}

          {/* Info */}
          <Box
            sx={{
              bgcolor: 'action.disabledBackground',
              borderRadius: 1,
              p: 1,
            }}
          >
            <Typography variant="body2">Стадий: {stages.length}</Typography>
            <Typography variant="body2">Общее время: {totalDuration} с</Typography>
            <Typography variant="body2">Макс. температура: {maxTemp}°C</Typography>
          </Box>

          <Box sx={{ mt: 'auto' }}>
            <Button
              variant="contained"
              fullWidth
              startIcon={saving ? <CircularProgress size={20} /> : <Save />}
              onClick={handleSave}
              disabled={saving || !name.trim() || stages.length === 0}
            >
              {saving ? 'Создание...' : 'Создать профиль'}
            </Button>
          </Box>
        </>
      }
      rightPanel={
        <>
          <Typography variant="subtitle1" gutterBottom>
            Шаблоны профилей
          </Typography>

          {/* Templates */}
          <List dense sx={{ mb: 2 }}>
            {templates.map((template, index) => (
              <ListItem key={index} disablePadding disableGutters sx={{ mb: 0.5 }}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<AutoAwesome fontSize="small" />}
                  onClick={() => applyTemplate(template.stages)}
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                >
                  <Box>
                    <Typography variant="body2">{template.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {template.stages.length} стадий •{' '}
                      {template.stages.reduce((acc, s) => acc + s.second, 0)} с
                    </Typography>
                  </Box>
                </Button>
              </ListItem>
            ))}
          </List>

          <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
            Стадии термопрофиля
          </Typography>

          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
          >
            <Typography variant="body2" color="text.secondary">
              {stages.length} стадий • {totalDuration} с
            </Typography>
            <Button size="small" startIcon={<Add />} onClick={addStage} variant="outlined">
              Добавить
            </Button>
          </Box>

          <List dense>
            {stages.map((stage, index) => (
              <ListItem
                key={index}
                sx={{
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  mb: 0.5,
                  boxShadow: 1,
                }}
              >
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight="bold">
                      Стадия {index + 1}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="body2" color="text.secondary">
                      {stage.second} с → {stage.temperature}°C
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    size="small"
                    onClick={() => moveStage(index, 'up')}
                    disabled={index === 0}
                    edge="start"
                    sx={{ mr: 0.5 }}
                  >
                    <ArrowBack fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => moveStage(index, 'down')}
                    disabled={index === stages.length - 1}
                    edge="start"
                    sx={{ mr: 0.5 }}
                  >
                    <Remove fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => removeStage(index)}
                    disabled={stages.length <= 1}
                    color="error"
                  >
                    <Remove fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>

          {stages.length === 0 && (
            <Alert severity="info" icon={<Description />}>
              Выберите шаблон или добавьте стадии вручную
            </Alert>
          )}

          {/* Stage Editor */}
          {stages.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Редактирование стадии
              </Typography>
              <TextField
                label="Длительность (с)"
                type="number"
                fullWidth
                value={stages[stages.length - 1].second}
                onChange={(e) =>
                  updateStage(stages.length - 1, 'second', parseInt(e.target.value) || 0)
                }
                variant="outlined"
                size="small"
                sx={{ mb: 1 }}
              />
              <TextField
                label="Температура (°C)"
                type="number"
                fullWidth
                value={stages[stages.length - 1].temperature}
                onChange={(e) =>
                  updateStage(stages.length - 1, 'temperature', parseInt(e.target.value) || 0)
                }
                variant="outlined"
                size="small"
              />
            </Box>
          )}

          {/* Quick Stats */}
          {stages.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Параметры профиля
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                <Chip label={`${stages.length} стадий`} size="small" />
                <Chip label={`${totalDuration} с`} size="small" />
                <Chip label={`${maxTemp}°C`} size="small" color="warning" />
              </Box>
            </Box>
          )}
        </>
      }
      footer={
        <>
          <Typography variant="body2">Новый профиль</Typography>
          <Typography variant="body2">
            {stages.length > 0 ? `${totalDuration} с всего` : 'Добавьте стадии'}
          </Typography>
        </>
      }
    />
  );
};

export default ProfileCreatePage;
