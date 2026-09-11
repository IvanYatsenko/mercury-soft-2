import React, { useState } from 'react';
import PanelLayout from '../components/PanelLayout';
import {
  Box,
  Typography,
  Button,
  TextField,
  Switch,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  ListItemIcon,
  Alert,
  Divider,
} from '@mui/material';
import {
  ArrowBack,
  Save,
  RestartAlt,
  Language,
  Computer,
  Notifications,
  Thermostat,
  SystemUpdate,
  Download,
  DeleteSweep,
  Update,
  Power,
  Info,
} from '@mui/icons-material';

const SystemSettingsPage: React.FC = () => {
  const [toggles, setToggles] = useState({
    soundSignals: true,
    errorReaction: true,
    autoSaveLogs: true,
    useSecondarySensor: false,
  });

  const toggleSwitch = (key: keyof typeof toggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const menuItems = [
    { icon: <Language fontSize="small" />, text: 'Сеть', active: false },
    { icon: <Computer fontSize="small" />, text: 'Система', active: true },
    { icon: <Notifications fontSize="small" />, text: 'Оповещения', active: false },
    { icon: <Thermostat fontSize="small" />, text: 'Калибровка', active: false },
    { icon: <SystemUpdate fontSize="small" />, text: 'Обновление ПО', active: false },
  ];

  return (
    <PanelLayout
      header={
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Button startIcon={<ArrowBack />} sx={{ minWidth: 'auto' }}></Button>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
              Системные настройки
            </Typography>
          </Box>
          <Typography variant="body2">v3.02</Typography>
        </>
      }
      leftPanel={
        <>
          <List dense>
            {menuItems.map((item, i) => (
              <ListItem key={i} disablePadding disableGutters sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={item.active}
                  sx={{
                    justifyContent: 'flex-start',
                    px: 1,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: 1, justifyContent: 'center' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{ variant: 'body2', fontSize: '11px' }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button variant="contained" fullWidth startIcon={<Save />} sx={{ color: 'white' }}>
              СОХРАНИТЬ
            </Button>
            <Button variant="contained" fullWidth startIcon={<RestartAlt />} color="error">
              СБРОС
            </Button>
          </Box>
        </>
      }
      rightPanel={
        <>
          {/* System Info */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <Info fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Информация о системе
            </Typography>
            <Box
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 1,
                p: 1,
                border: 1,
                borderColor: 'divider',
              }}
            >
              {[
                ['Модель печи', 'Меркурий-301'],
                ['Серийный номер', 'АМСГ.421415.110'],
                ['Версия ПО', '3.02 от 15.01.2026'],
                ['Дата сборки', '2026 г.'],
              ].map(([label, value], i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Network Type */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <Power fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Тип сети
            </Typography>
            <Box
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 1,
                p: 1,
                border: 1,
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                <Button fullWidth variant="contained">
                  Однофазная 220В
                </Button>
                <Button fullWidth variant="outlined">
                  Трехфазная 380В
                </Button>
              </Box>
              <Alert severity="warning" sx={{ mt: 0.75, fontSize: '9px' }}>
                Для трехфазной сети необходимо снять перемычку J10 на плате управления
              </Alert>
            </Box>
          </Box>

          {/* Parameters */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              Параметры
            </Typography>
            <Box
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 1,
                p: 1,
                border: 1,
                borderColor: 'divider',
              }}
            >
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.25}>
                  Эталонная частота (Гц)
                </Typography>
                <TextField fullWidth size="small" type="number" defaultValue={50} />
              </Box>

              <Divider sx={{ my: 0.75 }} />

              {[
                { label: 'Звуковые сигналы', key: 'soundSignals' as const },
                { label: 'Реакция на ошибку оборотов', key: 'errorReaction' as const },
                { label: 'Автосохранение логов', key: 'autoSaveLogs' as const },
              ].map((item, i) => (
                <Box key={i} sx={{ py: 0.75 }}>
                  <Box
                    sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Typography variant="body2" sx={{ fontSize: '11px' }}>
                      {item.label}
                    </Typography>
                    <Switch
                      size="small"
                      checked={toggles[item.key]}
                      onChange={() => toggleSwitch(item.key)}
                    />
                  </Box>
                  {i < 2 && <Divider sx={{ my: 0.75 }} />}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Sensors */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              Датчики
            </Typography>
            <Box
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 1,
                p: 1,
                border: 1,
                borderColor: 'divider',
              }}
            >
              {[
                ['Основной датчик', 'У дальней стенки'],
                ['Доп. датчик (на плате)', 'Сверху камеры'],
              ].map(([label, value], i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
              <Divider sx={{ my: 0.75 }} />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 0.75,
                }}
              >
                <Typography variant="body2" sx={{ fontSize: '11px' }}>
                  Использовать доп. датчик
                </Typography>
                <Switch
                  size="small"
                  checked={toggles.useSecondarySensor}
                  onChange={() => toggleSwitch('useSecondarySensor')}
                />
              </Box>
            </Box>
          </Box>

          {/* Service Actions */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              Служебные действия
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Button variant="outlined" fullWidth startIcon={<Download />}>
                Экспорт логов
              </Button>
              <Button variant="outlined" fullWidth startIcon={<DeleteSweep />}>
                Очистить кэш
              </Button>
              <Button variant="outlined" fullWidth startIcon={<Update />} color="warning">
                Проверить обновления
              </Button>
            </Box>
          </Box>
        </>
      }
      footer={
        <>
          <Typography variant="caption">Меркурий-301</Typography>
          <Typography variant="caption">Системные настройки</Typography>
        </>
      }
    />
  );
};

export default SystemSettingsPage;
