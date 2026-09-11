import React from 'react';
import PanelLayout from '../components/PanelLayout';
import { Typography } from '@mui/material';

const SystemSettingsPage: React.FC = () => {
  return (
    <PanelLayout
      header={<Typography variant="h6">Системные настройки</Typography>}
      leftPanel={<Typography>Меню системы</Typography>}
      rightPanel={<Typography>Системные параметры</Typography>}
      footer={<Typography>Система</Typography>}
    />
  );
};

export default SystemSettingsPage;
