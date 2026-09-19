import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import ComingSoonPage from './pages/ComingSoonPage';

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <style>{`body { margin: 0; }`}</style>
      <ComingSoonPage />
    </ThemeProvider>
  );
};

export default App;
