import React, { useState } from 'react';
import PanelLayout from '../components/PanelLayout';
import {
  Box,
  Typography,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  ListItemIcon,
  Chip,
} from '@mui/material';
import {
  ArrowBack,
  Wifi,
  Computer,
  Language,
  Devices,
  Save,
  Refresh,
  QrCode,
  Link,
} from '@mui/icons-material';

const NetworkSettingsPage: React.FC = () => {
  const [selectedNetwork, setSelectedNetwork] = useState(0);

  const networks = [
    { name: 'MERCURY_01', signal: 'отличный', security: 'WPA2', connected: true },
    { name: 'OFFICE_WIFI', signal: 'хороший', security: 'WPA2', connected: false },
    { name: 'GUEST_NETWORK', signal: 'слабый', security: 'Открытая', connected: false },
    { name: 'FABRIC_LAN', signal: 'средний', security: 'WPA2', connected: false },
  ];

  const menuItems = [
    { icon: <Computer fontSize="small" />, text: 'Система', active: false },
    { icon: <Language fontSize="small" />, text: 'Сеть', active: true },
    { icon: <Wifi fontSize="small" />, text: 'Wi-Fi', active: false },
    { icon: <Link fontSize="small" />, text: 'Удаленный доступ', active: false },
  ];

  return (
    <PanelLayout
      header={
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Button startIcon={<ArrowBack />} sx={{ minWidth: 'auto' }}></Button>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
              Сетевые настройки
            </Typography>
          </Box>
          <Chip size="small" color="success" label="Подключено" />
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

          <Box sx={{ mt: 'auto' }}>
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              textAlign="center"
              mb={0.5}
            >
              Текущий IP
            </Typography>
            <Typography
              variant="h6"
              sx={{
                color: 'success.main',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: '13px',
              }}
            >
              10.10.1.82
            </Typography>
          </Box>
        </>
      }
      rightPanel={
        <>
          {/* WiFi Networks */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <Wifi fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Доступные Wi-Fi сети
            </Typography>
            <List dense>
              {networks.map((network, i) => (
                <ListItem key={i} disablePadding disableGutters sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => !network.connected && setSelectedNetwork(i)}
                    sx={{
                      bgcolor: 'background.paper',
                      borderLeft: 3,
                      borderColor: network.connected
                        ? 'success.main'
                        : i === selectedNetwork
                          ? 'primary.main'
                          : 'divider',
                      borderRadius: 0.5,
                    }}
                  >
                    <ListItemText
                      primary={network.name}
                      secondary={`Сигнал: ${network.signal} • ${network.security}`}
                      primaryTypographyProps={{ variant: 'body2', fontSize: '11px' }}
                      secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                    />
                    {network.connected ? (
                      <Chip
                        size="small"
                        color="success"
                        label="Подключено"
                        sx={{ minWidth: 0, height: 20, fontSize: '9px' }}
                      />
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ minWidth: 0, padding: '2px 8px', fontSize: '9px' }}
                      >
                        Подключить
                      </Button>
                    )}
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
            <Button variant="outlined" fullWidth startIcon={<Refresh />} sx={{ mt: 0.75 }}>
              Обновить список
            </Button>
          </Box>

          {/* Connection Parameters */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              Параметры подключения
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
                { label: 'IP-адрес', value: '10.10.1.82' },
                { label: 'Маска подсети', value: '255.255.255.0' },
                { label: 'Шлюз', value: '10.10.1.1' },
                { label: 'Порт Web-управления', value: '8075' },
              ].map((field, i) => (
                <Box key={i} sx={{ mb: i < 3 ? 1 : 0 }}>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.25}>
                    {field.label}
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    defaultValue={field.value}
                    type={i === 3 ? 'number' : 'text'}
                  />
                </Box>
              ))}
              <Button
                variant="contained"
                fullWidth
                sx={{ mt: 1, color: 'white' }}
                startIcon={<Save />}
              >
                Применить
              </Button>
            </Box>
          </Box>

          {/* Remote Access */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <Devices fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Удаленный доступ
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
                ['URL для браузера:', 'http://10.10.1.82:8075'],
                ['Статус сервера:', 'Активен'],
                ['Подключено клиентов:', '1'],
              ].map(([label, value], i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 500,
                      color: i === 1 ? 'success.main' : 'inherit',
                    }}
                  >
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box
              sx={{
                mt: 0.75,
                width: '100%',
                height: 100,
                bgcolor: 'action.disabledBackground',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.secondary',
                fontSize: '10px',
                textAlign: 'center',
              }}
            >
              <QrCode fontSize="small" sx={{ mr: 1 }} />
              QR-код для подключения
            </Box>
          </Box>
        </>
      }
      footer={
        <>
          <Typography variant="caption">IP: 10.10.1.82</Typography>
          <Typography variant="caption">Сеть • Wi-Fi</Typography>
        </>
      }
    />
  );
};

export default NetworkSettingsPage;
