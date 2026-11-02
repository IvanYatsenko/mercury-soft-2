/**
 * Корень React-приложения: выбор темы, локальной или браузерной компоновки.
 */
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CssBaseline,
  GlobalStyles,
  ThemeProvider,
  createTheme,
} from '@mui/material';
import { App } from './App';
import { workspaceTheme } from './workspaceTheme';
import { installClientAccess } from './clientAccess';
import { SoftwareUpdateLock } from './SoftwareUpdateLock';

installClientAccess();

const root = document.getElementById('root');

if (!root) throw new Error('Root element is missing');

/**
 * Отрисовывает Root: представление данных и действий родительского экрана.
 */
function Root() {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('mercury.theme') === 'light'
        ? 'light'
        : 'dark';
    } catch {
      /* Use the default theme when storage is unavailable. */
    }
    return 'dark';
  });
  const theme = useMemo(
    () =>
      /Electron\//i.test(navigator.userAgent)
        ? createTheme({ palette: { mode } })
        : workspaceTheme(mode),
    [mode],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          '*': {
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          },
          'input, textarea, [contenteditable="true"]': {
            userSelect: 'text',
            WebkitUserSelect: 'text',
          },
          'img, svg': { WebkitUserDrag: 'none' },
          '*::-webkit-scrollbar': { display: 'none' },
        }}
      />
      <App
        mode={mode}
        onToggleMode={() =>
          setMode((current) => {
            const next = current === 'dark' ? 'light' : 'dark';
            try {
              localStorage.setItem('mercury.theme', next);
            } catch {
              /* Optional storage. */
            }
            return next;
          })
        }
      />
      <SoftwareUpdateLock />
    </ThemeProvider>
  );
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
