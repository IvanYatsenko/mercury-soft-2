import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CssBaseline,
  GlobalStyles,
  ThemeProvider,
  createTheme,
} from '@mui/material';
import { App } from './App';

const root = document.getElementById('root');

if (!root) throw new Error('Root element is missing');

function Root() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const theme = useMemo(() => createTheme({ palette: { mode } }), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          '*': { scrollbarWidth: 'none', msOverflowStyle: 'none' },
          '*::-webkit-scrollbar': { display: 'none' },
        }}
      />
      <App
        mode={mode}
        onToggleMode={() =>
          setMode((current) => (current === 'dark' ? 'light' : 'dark'))
        }
      />
    </ThemeProvider>
  );
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
