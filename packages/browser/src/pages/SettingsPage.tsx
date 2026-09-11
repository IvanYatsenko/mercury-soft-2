import React from 'react';
import PanelLayout from '../components/PanelLayout';
import { Typography } from '@mui/material';

const SettingsPage: React.FC = () => {
  return (
    <PanelLayout
      header={<Typography variant="h6">Настройки</Typography>}
      leftPanel={<Typography>Меню настроек</Typography>}
      rightPanel={<Typography>Содержимое настроек</Typography>}
      footer={<Typography>Настройки</Typography>}
    />
  );
};

export default SettingsPage;
