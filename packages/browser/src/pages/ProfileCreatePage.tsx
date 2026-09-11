import React from 'react';
import PanelLayout from '../components/PanelLayout';
import { Typography } from '@mui/material';

const ProfileCreatePage: React.FC = () => {
  return (
    <PanelLayout
      header={<Typography variant="h6">Создание профиля</Typography>}
      leftPanel={<Typography>Параметры профиля</Typography>}
      rightPanel={<Typography>Выбор шаблона</Typography>}
      footer={<Typography>Новый профиль</Typography>}
    />
  );
};

export default ProfileCreatePage;
