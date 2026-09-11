import React, { useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Button,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Thermostat, Speed, PlayArrow, Stop, Refresh, SensorWindow } from '@mui/icons-material';
import { mockBoard } from '../services/MockBoardService';
import { FurnaceStatus } from '@mercury-soft-2/shared';

const MockBoardPage = observer(() => {
  const [furnace, setFurnace] = useState(mockBoard.getFurnace());
  const [sensors, setSensors] = useState(mockBoard.getSensors());
  const [heaters, setHeaters] = useState(mockBoard.getHeaters());
  const [progress, setProgress] = useState(mockBoard.getProgress());
  const [error, setError] = useState<string | null>(null);

  // Обновление состояния каждую секунду
  const updateState = useCallback(() => {
    try {
      const state = mockBoard.update();
      setFurnace(state.furnace);
      setSensors(state.sensors);
      setHeaters(state.heaters);
      setProgress(state.progress);
    } catch (err) {
      setError('Ошибка обновления состояния');
    }
  }, []);

  useEffect(() => {
    updateState();
    const interval = setInterval(updateState, 1000);
    return () => clearInterval(interval);
  }, [updateState]);

  const handleStart = () => {
    const success = mockBoard.startProfile('profile-standard-001');
    if (!success) {
      setError('Не удалось запустить профиль');
    }
  };

  const handleStop = () => {
    mockBoard.stop();
  };

  const handleRefresh = () => {
    updateState();
  };

  const getStatusColor = (status: FurnaceStatus): 'default' | 'success' | 'warning' | 'error' => {
    switch (status) {
      case FurnaceStatus.IDLE:
        return 'default';
      case FurnaceStatus.WORK:
        return 'success';
      case FurnaceStatus.BUSY:
        return 'warning';
      case FurnaceStatus.ERROR:
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (status: FurnaceStatus) => {
    switch (status) {
      case FurnaceStatus.IDLE:
        return 'Простой';
      case FurnaceStatus.WORK:
        return 'Работа';
      case FurnaceStatus.BUSY:
        return 'Занята';
      case FurnaceStatus.ERROR:
        return 'Ошибка';
      default:
        return 'Неизвестно';
    }
  };

  return (
    <Container maxWidth={false} sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper
        sx={{
          p: 2,
          mb: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6" component="h1">
              {furnace.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {furnace.model} | IP: {furnace.ip} | v{furnace.softwareVersion}
            </Typography>
          </Box>
          <Chip
            label={getStatusLabel(furnace.status)}
            color={getStatusColor(furnace.status)}
            size="small"
          />
        </Box>
      </Paper>

      {/* Main Content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Temperature Display */}
        <Card sx={{ bgcolor: 'background.paper' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Thermostat sx={{ fontSize: 48, color: 'primary.main' }} />
              <Box>
                <Typography variant="h3" component="div" sx={{ fontWeight: 'bold' }}>
                  {furnace.temperature.toFixed(1)}°C
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Текущая температура
                </Typography>
              </Box>
            </Box>

            {/* Progress Bar */}
            {progress && (
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">
                    Стадия {progress.currentStage}/{progress.totalStages}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Осталось: {progress.timeLeft}с
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={(progress.currentStage / progress.totalStages) * 100}
                  sx={{ height: 8, borderRadius: 4 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Цель: {progress.currentStageTemp}°C
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Sensors & Heaters Grid */}
        <Grid container spacing={2}>
          {/* Sensors */}
          <Grid item xs={12} md={6}>
            <Card sx={{ bgcolor: 'background.paper' }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  <SensorWindow sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Датчики температуры
                </Typography>
                {sensors.map((sensor) => (
                  <Box key={sensor.id} sx={{ mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">{sensor.name}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {sensor.currentTemperature.toFixed(1)}°C
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>

          {/* Heaters */}
          <Grid item xs={12} md={6}>
            <Card sx={{ bgcolor: 'background.paper' }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  <Speed sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Нагреватели
                </Typography>
                {heaters.map((heater) => (
                  <Box key={heater.id} sx={{ mb: 1 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Typography variant="body2">{heater.name}</Typography>
                      <Chip
                        label={heater.isActive ? 'ВКЛ' : 'ВЫКЛ'}
                        size="small"
                        color={heater.isActive ? 'success' : 'default'}
                      />
                    </Box>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Controls */}
        <Paper sx={{ p: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Tooltip title="Запустить профиль">
            <Button
              variant="contained"
              color="success"
              startIcon={<PlayArrow />}
              onClick={handleStart}
              disabled={furnace.status === FurnaceStatus.WORK}
              size="large"
            >
              Запустить
            </Button>
          </Tooltip>
          <Tooltip title="Остановить">
            <Button
              variant="contained"
              color="error"
              startIcon={<Stop />}
              onClick={handleStop}
              disabled={furnace.status !== FurnaceStatus.WORK}
              size="large"
            >
              Стоп
            </Button>
          </Tooltip>
          <Tooltip title="Обновить">
            <IconButton onClick={handleRefresh} size="large">
              <Refresh />
            </IconButton>
          </Tooltip>
        </Paper>
      </Box>

      {/* Footer */}
      <Paper sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Mercury v1.0.0 | Mock Board | Raspberry Pi 4
        </Typography>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Container>
  );
});

export default MockBoardPage;
