import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PanelLayout from '../components/PanelLayout';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Wifi,
  PlayArrow,
  Stop,
  Settings,
  FolderOpen,
  Add,
  FileDownload,
  Build,
  Power,
  Air,
  Lightbulb,
  AcUnit,
  ShowChart,
  Timer,
  Edit,
  DarkMode,
  LightMode,
  CheckCircle,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useThemeContext } from '../context/ThemeContext';
import { apiService } from '../services/api';
import { ThermalProfile } from '@mercury-soft-2/shared';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { themeMode, toggleTheme } = useThemeContext();
  const [isRunning, setIsRunning] = useState(false);
  const [temperature, setTemperature] = useState(25);
  const [timer, setTimer] = useState(401);
  const [progress] = useState(45);
  const [currentStage] = useState(3);
  const [stageTimeLeft] = useState(45);

  // API states
  const [profiles, setProfiles] = useState<ThermalProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'loading' | 'online' | 'offline'>('loading');
  const [apiError, setApiError] = useState<string | null>(null);

  // Загрузка профилей из API
  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      setApiStatus('loading');
      setApiError(null);
      const data = await apiService.getThermalProfiles();
      setProfiles(data);
      if (data.length > 0) {
        setSelectedProfileId(data[0].id);
      }
      setApiStatus('online');
    } catch (error) {
      console.error('Failed to load profiles:', error);
      setApiStatus('offline');
      setApiError('Не удалось подключиться к API');
    }
  };

  // Симуляция работы печи
  useEffect(() => {
    if (!isRunning) return;

    const timerInterval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 0) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const tempInterval = setInterval(() => {
      setTemperature((prev) => {
        if (prev >= 230) return 230;
        return prev + 2;
      });
    }, 500);

    return () => {
      clearInterval(timerInterval);
      clearInterval(tempInterval);
    };
  }, [isRunning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const heaters = [
    { icon: <Power fontSize="small" />, active: isRunning, label: 'ТЭН' },
    { icon: <Air fontSize="small" />, active: isRunning, label: 'Вент.' },
    { icon: <Lightbulb fontSize="small" />, active: false, label: 'ИК' },
    { icon: <AcUnit fontSize="small" />, active: isRunning, label: 'Охлажд.' },
  ];

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  return (
    <PanelLayout
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Button onClick={toggleTheme} sx={{ minWidth: 'auto', p: 0.5 }}>
              {themeMode === 'dark' ? <LightMode /> : <DarkMode />}
            </Button>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              Меркурий-301
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Wifi fontSize="small" />
            <Chip
              size="small"
              color={isRunning ? 'success' : 'warning'}
              label=""
              sx={{ width: 8, height: 8, minWidth: 0 }}
            />
          </Box>
        </Box>
      }
      leftPanel={
        <>
          {/* Temperature Box */}
          <Box
            sx={{
              bgcolor: 'background.paper',
              borderRadius: 2,
              p: 2,
              textAlign: 'center',
              border: 1,
              borderColor: 'divider',
              boxShadow: 1,
            }}
          >
            <Typography
              variant="h3"
              sx={{ fontWeight: 'bold', color: 'warning.main', lineHeight: 1 }}
            >
              {temperature}°
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRunning ? 'Текущая температура' : 'Температура камеры'}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1 }}>
              {heaters.map((h, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: h.active ? 'success.main' : 'grey.700',
                    }}
                  />
                  {h.icon}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Buttons */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              variant="contained"
              fullWidth
              size="large"
              startIcon={isRunning ? <Stop /> : <PlayArrow />}
              sx={{ py: 1.5, fontSize: '1rem' }}
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? 'СТОП' : 'ПУСК'}
            </Button>
            <Button
              variant="outlined"
              fullWidth
              size="large"
              startIcon={<Settings />}
              onClick={() => navigate('/settings')}
            >
              НАСТРОЙКИ
            </Button>
            {!isRunning && (
              <Button
                variant="outlined"
                fullWidth
                size="large"
                startIcon={<FolderOpen />}
                onClick={() => {
                  loadProfiles();
                }}
              >
                ПРОФИЛИ
              </Button>
            )}
          </Box>

          {/* Status or Timer */}
          {!isRunning ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" mt="auto">
              Готов к работе
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" textAlign="center" mt="auto">
              <Typography
                variant="h5"
                sx={{ color: 'warning.main', fontWeight: 'bold', display: 'block', mb: 0.5 }}
              >
                <Timer fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                {formatTime(timer)}
              </Typography>
              до конца программы
            </Typography>
          )}
        </>
      }
      rightPanel={
        <>
          {!isRunning ? (
            <>
              {/* API Status */}
              <Box>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={1}
                >
                  Выберите термопрофиль
                </Typography>

                {apiStatus === 'loading' && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                )}

                {apiStatus === 'offline' && apiError && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    <ErrorIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    {apiError}
                  </Alert>
                )}

                {apiStatus === 'online' && profiles.length === 0 && (
                  <Alert severity="info" sx={{ mb: 1 }}>
                    <CheckCircle sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Нет сохранённых профилей
                  </Alert>
                )}

                {apiStatus === 'online' && profiles.length > 0 && (
                  <List dense>
                    {profiles.map((profile) => (
                      <ListItem key={profile.id} disablePadding disableGutters sx={{ mb: 0.5 }}>
                        <ListItemButton
                          selected={profile.id === selectedProfileId}
                          onClick={() => setSelectedProfileId(profile.id)}
                          sx={{
                            bgcolor: 'background.paper',
                            borderLeft: 3,
                            borderColor:
                              profile.id === selectedProfileId ? 'success.main' : 'primary.main',
                            borderRadius: 1,
                            boxShadow: 1,
                          }}
                        >
                          <ListItemText
                            primary={profile.name}
                            secondary={`${profile.mode === 'manual' ? 'Детальный' : 'Упрощенный'} • ${profile.stages.length} стадий • ${profile.stages.reduce((acc, s) => acc + s.second, 0)} с`}
                          />
                          <ListItemButton
                            sx={{ minWidth: 0, padding: 0.5 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/profile/edit/${profile.id}`);
                            }}
                          >
                            <Edit fontSize="medium" color="inherit" />
                          </ListItemButton>
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>

              {/* Selected Profile Info */}
              {selectedProfile && (
                <Box>
                  <Typography
                    variant="h6"
                    color="text.secondary"
                    textTransform="uppercase"
                    display="block"
                    mb={1}
                  >
                    Информация
                  </Typography>
                  <Box
                    sx={{
                      bgcolor: 'background.paper',
                      borderRadius: 2,
                      p: 2,
                      textAlign: 'center',
                      border: 1,
                      borderColor: 'divider',
                      borderStyle: 'dashed',
                    }}
                  >
                    <Typography variant="body1" color="text.secondary">
                      <CheckCircle fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                      Выбран: {selectedProfile.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" display="block" mt={1}>
                      Стадий: {selectedProfile.stages.length} • Макс. temp:{' '}
                      {Math.max(...selectedProfile.stages.map((s) => s.temperature))}°C
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* Quick Actions */}
              <Box>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={1}
                >
                  Быстрые действия
                </Typography>
                <List dense>
                  <ListItem disablePadding disableGutters sx={{ mb: 0.5 }}>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<Add />}
                      size="large"
                      sx={{ justifyContent: 'flex-start' }}
                      onClick={() => navigate('/profile/create')}
                    >
                      СОЗДАТЬ ПРОФИЛЬ
                    </Button>
                  </ListItem>
                  <ListItem disablePadding disableGutters sx={{ mb: 0.5 }}>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<FileDownload />}
                      size="large"
                      sx={{ justifyContent: 'flex-start' }}
                    >
                      ИМПОРТ ПРОФИЛЯ
                    </Button>
                  </ListItem>
                  <ListItem disablePadding disableGutters sx={{ mb: 0.5 }}>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<Build />}
                      size="large"
                      sx={{ justifyContent: 'flex-start' }}
                    >
                      КАЛИБРОВКА
                    </Button>
                  </ListItem>
                </List>
              </Box>
            </>
          ) : (
            <>
              {/* Stage Info (Running) */}
              <Box>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={1}
                >
                  Выполнение программы
                </Typography>
                <Box
                  sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    p: 2,
                    boxShadow: 1,
                    borderColor: 'divider',
                    borderLeft: '4px solid warning.main',
                    border: '1px solid',
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 'bold', color: 'warning.main', mb: 0.5 }}
                  >
                    <PlayArrow fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                    Стадия {currentStage}: Плавление
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Цель: 230°C • Осталось: {stageTimeLeft} с
                  </Typography>
                </Box>
              </Box>

              {/* Progress */}
              <Box>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={1}
                >
                  Прогресс
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">
                    {selectedProfile?.name || 'Свинцовая паста'}
                  </Typography>
                  <Typography variant="body2">{progress}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: 'action.disabledBackground',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: 'success.main',
                    },
                  }}
                />
              </Box>

              {/* Chart */}
              <Box>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={1}
                >
                  <ShowChart fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  График термопрофиля
                </Typography>
                <Box
                  sx={{
                    height: 150,
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'flex-end',
                    p: 1,
                    gap: 0.5,
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: 1,
                  }}
                >
                  {[15, 30, 50, 70, 85, 95, 75, 60, 45, 30].map((height, i) => (
                    <Box
                      key={i}
                      sx={{
                        flex: 1,
                        height: `${height}%`,
                        bgcolor: 'primary.main',
                        borderRadius: '2px 2px 0 0',
                        opacity: 0.7,
                      }}
                    />
                  ))}
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    mt: 0.5,
                    color: 'text.secondary',
                  }}
                >
                  {['0', '200', '400', '600', '800', '1000'].map((label, i) => (
                    <Typography key={i} variant="body2">
                      {label}
                    </Typography>
                  ))}
                </Box>
              </Box>

              {/* Current Indicators */}
              <Box>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={1}
                >
                  Текущие показатели
                </Typography>
                <Box
                  sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    p: 2,
                    border: 1,
                    borderColor: 'divider',
                    boxShadow: 1,
                  }}
                >
                  {[
                    ['Датчик:', 'Основной'],
                    ['Мощность ТЭН:', '85%'],
                    ['Обороты вент.:', '2400 об/мин'],
                  ].map(([label, value], i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography variant="body2">{value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </>
          )}
        </>
      }
      footer={
        <>
          <Typography variant="body2">IP: 10.10.1.82</Typography>
          <Typography variant="body2">
            {isRunning ? `Работа • Стадия ${currentStage}/6` : 'Режим: Ожидание'}
          </Typography>
        </>
      }
    />
  );
};

export default HomePage;
