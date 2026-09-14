import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Save,
  Delete,
  Add,
  Remove,
  ArrowBack,
  Warning as WarningIcon,
  CheckCircle,
} from '@mui/icons-material';
import { apiService } from '../services/api';
import { ThermalProfile, TemperatureStage, ShelvesStage } from '@mercury-soft-2/shared';

const ProfileEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // State
  const [profile, setProfile] = useState<ThermalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'easy' | 'manual'>('manual');
  const [useExternalSensor, setUseExternalSensor] = useState(false);
  const [stages, setStages] = useState<TemperatureStage[]>([]);
  const [shelves, setShelves] = useState<ShelvesStage>({ time: 0, temperature: 0 });

  useEffect(() => {
    if (!id) {
      setApiError('ID профиля не указан');
      setLoading(false);
      return;
    }
    loadProfile();
  }, [id]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setApiError(null);
      const data = await apiService.getThermalProfile(id!);
      setProfile(data);
      setName(data.name);
      setMode(data.mode);
      setUseExternalSensor(data.useExternalSensor);
      setStages(data.stages);
      setShelves(data.shelves);
    } catch (error) {
      console.error('Failed to load profile:', error);
      setApiError('Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
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

      const updated = await apiService.updateThermalProfile(id!, {
        name: name.trim(),
        stages,
        mode,
        useExternalSensor,
        shelves,
      });

      setProfile(updated);
      setSuccessMessage('Профиль успешно сохранён');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save profile:', error);
      setApiError('Ошибка при сохранении профиля');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleteDialogOpen(false);
      await apiService.deleteThermalProfile(id!);
      navigate('/');
    } catch (error) {
      console.error('Failed to delete profile:', error);
      setApiError('Ошибка при удалении профиля');
    }
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

  const totalDuration = stages.reduce((acc, s) => acc + s.second, 0);
  const maxTemp = Math.max(...stages.map((s) => s.temperature), 0);

  if (loading) {
    return (
      <PanelLayout
        header={<Typography variant="h6">Редактирование профиля</Typography>}
        leftPanel={
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress />
          </Box>
        }
        rightPanel={
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress />
          </Box>
        }
        footer={<Typography>Профиль</Typography>}
      />
    );
  }

  if (apiError && !profile) {
    return (
      <PanelLayout
        header={<Typography variant="h6">Редактирование профиля</Typography>}
        leftPanel={
          <Alert severity="error">
            {apiError}
            <Button size="small" onClick={loadProfile} sx={{ ml: 1 }}>
              Повторить
            </Button>
          </Alert>
        }
        rightPanel={<Box />}
        footer={<Typography>Профиль</Typography>}
      />
    );
  }

  return (
    <PanelLayout
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button startIcon={<ArrowBack />} onClick={() => navigate('/')} size="small">
            Назад
          </Button>
          <Typography variant="h6">Редактирование профиля</Typography>
        </Box>
      }
      leftPanel={
        <>
          {/* Success Message */}
          {successMessage && (
            <Alert severity="success" icon={<CheckCircle />}>
              {successMessage}
            </Alert>
          )}

          {/* Error Message */}
          {apiError && <Alert severity="error">{apiError}</Alert>}

          {/* Profile Name */}
          <TextField
            label="Название профиля"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
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
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<Delete />}
              color="error"
              onClick={() => setDeleteDialogOpen(true)}
              sx={{ mt: 1 }}
            >
              Удалить профиль
            </Button>
          </Box>

          {/* Delete Dialog */}
          <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
            <DialogTitle>Удалить профиль?</DialogTitle>
            <DialogContent>
              <Typography>
                Вы уверены, что хотите удалить профиль &quot;{name}&quot;? Это действие нельзя
                отменить.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteDialogOpen(false)}>Отмена</Button>
              <Button onClick={handleDelete} color="error" variant="contained">
                Удалить
              </Button>
            </DialogActions>
          </Dialog>
        </>
      }
      rightPanel={
        <>
          <Typography variant="subtitle1" gutterBottom>
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
                    <Delete fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>

          {/* Stage Editor */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Редактирование стадии
            </Typography>
            {stages.length > 0 ? (
              <>
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
              </>
            ) : (
              <Alert severity="warning" icon={<WarningIcon />}>
                Нет стадий. Добавьте первую стадию.
              </Alert>
            )}
          </Box>
        </>
      }
      footer={
        <>
          <Typography variant="body2">ID: {id}</Typography>
          <Typography variant="body2">
            {profile ? `Создан: ${new Date(profile.createdAt).toLocaleDateString()}` : '—'}
          </Typography>
        </>
      }
    />
  );
};

export default ProfileEditPage;
