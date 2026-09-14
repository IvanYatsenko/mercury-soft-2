import React, { useState, useEffect } from 'react';
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
import { apiService } from '../services/api.service';
import { ThermalProfile } from '@mercury-soft-2/shared';

const HomePage: React.FC = () => {
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
      const data = await apiService.getProfiles();
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Button onClick={toggleTheme} sx={{ minWidth: 'auto', p: 0.5 }}>
              {themeMode === 'dark' ? <LightMode /> : <DarkMode />}
            </Button>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 'bold', color: 'primary.main', fontSize: '13px' }}
            >
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
              borderRadius: 1,
              p: 1,
              textAlign: 'center',
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Typography
              variant="h4"
              sx={{ fontWeight: 'bold', color: 'warning.main', lineHeight: 1, fontSize: '2rem' }}
            >
              {temperature}°
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {isRunning ? 'Текущая температура' : 'Температура камеры'}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                gap: 0.75,
                mt: 0.75,
                fontSize: '10px',
              }}
            >
              {heaters.map((h, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Button
              variant="contained"
              fullWidth
              startIcon={isRunning ? <Stop /> : <PlayArrow />}
              sx={{ py: 1.5, fontSize: '12px' }}
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? 'СТОП' : 'ПУСК'}
            </Button>
            <Button variant="outlined" fullWidth startIcon={<Settings />} sx={{ fontSize: '11px' }}>
              НАСТРОЙКИ
            </Button>
            {!isRunning && (
              <Button
                variant="outlined"
                fullWidth
                startIcon={<FolderOpen />}
                sx={{ fontSize: '11px' }}
              >
                ПРОФИЛИ
              </Button>
            )}
          </Box>

          {/* Status or Timer */}
          {!isRunning ? (
            <Typography
              variant="caption"
              color="text.secondary"
              textAlign="center"
              mt="auto"
              display="block"
            >
              Готов к работе
            </Typography>
          ) : (
            <Typography
              variant="caption"
              color="text.secondary"
              textAlign="center"
              mt="auto"
              display="block"
            >
              <Typography
                variant="h6"
                sx={{
                  color: 'warning.main',
                  fontWeight: 'bold',
                  display: 'block',
                  mb: 0.5,
                  fontSize: '14px',
                }}
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
                  variant="caption"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={0.5}
                >
                  Выберите термопрофиль
                </Typography>

                {apiStatus === 'loading' && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={20} />
                  </Box>
                )}

                {apiStatus === 'offline' && apiError && (
                  <Alert severity="error" sx={{ mb: 0.5, fontSize: '9px' }}>
                    <ErrorIcon sx={{ mr: 0.5, verticalAlign: 'middle', fontSize: 'inherit' }} />
                    {apiError}
                  </Alert>
                )}

                {apiStatus === 'online' && profiles.length === 0 && (
                  <Alert severity="info" sx={{ mb: 0.5, fontSize: '9px' }}>
                    <CheckCircle sx={{ mr: 0.5, verticalAlign: 'middle', fontSize: 'inherit' }} />
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
                            borderRadius: 0.5,
                          }}
                        >
                          <ListItemText
                            primary={profile.name}
                            secondary={`${profile.mode === 'manual' ? 'Детальный' : 'Упрощенный'} • ${profile.stages.length} стадий`}
                            primaryTypographyProps={{ variant: 'body2', fontSize: '11px' }}
                            secondaryTypographyProps={{
                              variant: 'caption',
                              color: 'text.secondary',
                            }}
                          />
                          <ListItemButton sx={{ minWidth: 0, padding: 0.25 }}>
                            <Edit fontSize="small" color="inherit" />
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
                    variant="caption"
                    color="text.secondary"
                    textTransform="uppercase"
                    display="block"
                    mb={0.5}
                  >
                    Информация
                  </Typography>
                  <Box
                    sx={{
                      bgcolor: 'background.paper',
                      borderRadius: 0.5,
                      p: 1,
                      textAlign: 'center',
                      border: 1,
                      borderColor: 'divider',
                      borderStyle: 'dashed',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      <CheckCircle fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                      Выбран: {selectedProfile.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                      Стадий: {selectedProfile.stages.length} • Макс. temp:{' '}
                      {Math.max(...selectedProfile.stages.map((s) => s.temperature))}°C
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* Quick Actions */}
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={0.5}
                >
                  Быстрые действия
                </Typography>
                <List dense>
                  {[
                    { icon: <Add />, text: 'СОЗДАТЬ ПРОФИЛЬ' },
                    { icon: <FileDownload />, text: 'ИМПОРТ ПРОФИЛЯ' },
                    { icon: <Build />, text: 'КАЛИБРОВКА' },
                  ].map((item, i) => (
                    <ListItem key={i} disablePadding disableGutters sx={{ mb: 0.5 }}>
                      <Button
                        variant="outlined"
                        fullWidth
                        startIcon={item.icon}
                        sx={{ justifyContent: 'flex-start', fontSize: '10px', py: 0.75 }}
                      >
                        {item.text}
                      </Button>
                    </ListItem>
                  ))}
                </List>
              </Box>
            </>
          ) : (
            <>
              {/* Stage Info (Running) */}
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={0.5}
                >
                  Выполнение программы
                </Typography>
                <Box
                  sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 0.5,
                    p: 0.75,
                    fontSize: '10px',
                    boxShadow: 1,
                    borderColor: 'divider',
                    borderLeft: '3px solid warning.main',
                    border: '1px solid',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 'bold', color: 'warning.main', mb: 0.25, fontSize: '11px' }}
                  >
                    <PlayArrow fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                    Стадия {currentStage}: Плавление
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Цель: 230°C • Осталось: {stageTimeLeft} с
                  </Typography>
                </Box>
              </Box>

              {/* Progress */}
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={0.5}
                >
                  Прогресс
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: 'text.secondary',
                    mb: 0.5,
                  }}
                >
                  <Typography variant="caption">
                    {selectedProfile?.name || 'Свинцовая паста'}
                  </Typography>
                  <Typography variant="caption">{progress}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{
                    height: 6,
                    borderRadius: 1.5,
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
                  variant="caption"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={0.5}
                >
                  <ShowChart fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  График термопрофиля
                </Typography>
                <Box
                  sx={{
                    height: 100,
                    bgcolor: 'background.paper',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'flex-end',
                    p: 0.75,
                    gap: 0.25,
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
                        borderRadius: '1px 1px 0 0',
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
                    fontSize: '9px',
                    color: 'text.secondary',
                  }}
                >
                  {['0', '200', '400', '600', '800', '1000'].map((label, i) => (
                    <Typography key={i} variant="caption">
                      {label}
                    </Typography>
                  ))}
                </Box>
              </Box>

              {/* Current Indicators */}
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  textTransform="uppercase"
                  display="block"
                  mb={0.5}
                >
                  Текущие показатели
                </Typography>
                <Box
                  sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 0.5,
                    p: 0.75,
                    fontSize: '10px',
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
                    <Box
                      key={i}
                      sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography variant="caption">{value}</Typography>
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
          <Typography variant="caption">IP: 10.10.1.82</Typography>
          <Typography variant="caption">
            {isRunning ? `Работа • Стадия ${currentStage}/6` : 'Режим: Ожидание'}
          </Typography>
        </>
      }
    />
  );
};

export default HomePage;
