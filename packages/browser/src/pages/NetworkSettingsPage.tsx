import React from 'react';
import PanelLayout from '../components/PanelLayout';
import { Typography } from '@mui/material';

const NetworkSettingsPage: React.FC = () => {
  return (
    <PanelLayout
      header={<Typography variant="h6">Сетевые настройки</Typography>}
      leftPanel={<Typography>Меню сети</Typography>}
      rightPanel={<Typography>Параметры сети</Typography>}
      footer={<Typography>Сеть</Typography>}
    />
  );
};

export default NetworkSettingsPage;
