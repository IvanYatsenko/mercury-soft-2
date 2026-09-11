import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import ProfileEditPage from './pages/ProfileEditPage';
import ProfileCreatePage from './pages/ProfileCreatePage';
import SystemSettingsPage from './pages/SystemSettingsPage';
import NetworkSettingsPage from './pages/NetworkSettingsPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/profile/edit" element={<ProfileEditPage />} />
      <Route path="/profile/create" element={<ProfileCreatePage />} />
      <Route path="/system-settings" element={<SystemSettingsPage />} />
      <Route path="/network-settings" element={<NetworkSettingsPage />} />
    </Routes>
  );
};

export default App;
