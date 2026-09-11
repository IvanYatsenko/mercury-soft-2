import React, { useState } from 'react';
import PanelLayout from '../components/PanelLayout';
import {
  Box,
  Typography,
  Button,
  Switch,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Divider,
} from '@mui/material';
import {
  ArrowBack,
  Wifi,
  Settings as SettingsIcon,
  Notifications,
  Language,
  Computer,
  Power,
  AcUnit,
  Lightbulb,
} from '@mui/icons-material';

const SettingsPage: React.FC = () => {
  const [toggles, setToggles] = useState({
    topHeater: true,
    bottomHeater: true,
    convectionFan: true,
    coolingFan1: true,
    coolingFan2: false,
    irLamp1: false,
    irLamp2: false,
    irLamp3: false,
    errorReaction: true,
    soundAlerts: true,
  });

  const toggleSwitch = (key: keyof typeof toggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const menuItems = [
    { icon: <SettingsIcon fontSize="small" />, text: 'Компоненты', active: true },
    { icon: <Thermometer fontSize="small" />, text: 'Калибровка', active: false },
    { icon: <Notifications fontSize="small" />, text: 'Оповещения', active: false },
    { icon: <Language fontSize="small" />, text: 'Сеть', active: false },
    { icon: <Computer fontSize="small" />, text: 'Система', active: false },
  ];

  return (
    <PanelLayout
      header={
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Button startIcon={<ArrowBack />} sx={{ minWidth: 'auto' }}></Button>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
              Настройки
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Wifi fontSize="small" />
          </Box>
        </>
      }
      leftPanel={
        <>
          <Typography
            variant="caption"
            color="text.secondary"
            textTransform="uppercase"
            display="block"
            mb={0.5}
          >
            Разделы
          </Typography>
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

          <Typography
            variant="caption"
            color="text.secondary"
            textAlign="center"
            mt="auto"
            display="block"
          >
            Версия ПО: 3.02
          </Typography>
        </>
      }
      rightPanel={
        <>
          {/* Heaters */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <Power fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Нагреватели
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
                { label: 'Верхний нагреватель', key: 'topHeater' as const },
                { label: 'Нижний нагреватель', key: 'bottomHeater' as const },
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
                  {i < 1 && <Divider sx={{ my: 0.75 }} />}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Fans */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <AcUnit fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Вентиляторы
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
                { label: 'Конвекционный вентилятор', key: 'convectionFan' as const },
                { label: 'Вентилятор охлаждения 1', key: 'coolingFan1' as const },
                { label: 'Вентилятор охлаждения 2', key: 'coolingFan2' as const },
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

          {/* IR Lamps */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <Lightbulb fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Инфракрасные лампы
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
                { label: 'ИК лампа №1', key: 'irLamp1' as const },
                { label: 'ИК лампа №2', key: 'irLamp2' as const },
                { label: 'ИК лампа №3', key: 'irLamp3' as const },
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

          {/* Additional */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              Дополнительно
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
                { label: 'Реагировать на ошибку оборотов', key: 'errorReaction' as const },
                { label: 'Звук об ошибках', key: 'soundAlerts' as const },
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
                  {i < 1 && <Divider sx={{ my: 0.75 }} />}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Info */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <Info fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Информация
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
                ['Температура Pi', '53°C'],
                ['Контроллер', '32°C'],
                ['Дверь', 'Закрыта'],
                ['Текущая частота', '45 Hz (90%)'],
              ].map(([label, value], i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
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
        </>
      }
      footer={
        <>
          <Typography variant="caption">IP: 10.10.1.82</Typography>
          <Typography variant="caption">Настройки • Компоненты</Typography>
        </>
      }
    />
  );
};

export default SettingsPage;
