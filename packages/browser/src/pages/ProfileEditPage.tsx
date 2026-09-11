import React from 'react';
import PanelLayout from '../components/PanelLayout';
import { Typography } from '@mui/material';

const ProfileEditPage: React.FC = () => {
  return (
    <PanelLayout
      header={<Typography variant="h6">Редактирование профиля</Typography>}
      leftPanel={<Typography>Настройки профиля</Typography>}
      rightPanel={<Typography>Редактирование стадий</Typography>}
      footer={<Typography>Профиль</Typography>}
    />
  );
};

export default ProfileEditPage;
