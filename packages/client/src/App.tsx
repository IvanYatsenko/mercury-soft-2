import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import ProfileEditPage from './pages/ProfileEditPage';
import ProfileCreatePage from './pages/ProfileCreatePage';
import SystemSettingsPage from './pages/SystemSettingsPage';
import NetworkSettingsPage from './pages/NetworkSettingsPage';

const pages = [
  { name: 'Главная', component: <HomePage /> },
  { name: 'Настройки', component: <SettingsPage /> },
  { name: 'Редактирование профиля', component: <ProfileEditPage /> },
  { name: 'Создание профиля', component: <ProfileCreatePage /> },
  { name: 'Системные настройки', component: <SystemSettingsPage /> },
  { name: 'Сетевые настройки', component: <NetworkSettingsPage /> },
];

const App: React.FC = () => {
  return <ThemeProvider>{pages[0].component}</ThemeProvider>;
};

export default App;
