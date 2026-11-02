/**
 * Палитра, типографика и общие стили адаптивного интерфейса ПК и телефона.
 */
import { createTheme } from '@mui/material';

/** Создаёт MUI-тему выбранного режима; чтение и сохранение выбора выполняет корневой компонент. */
export function workspaceTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      mode: mode,
      primary: { main: mode === 'dark' ? '#66dfc1' : '#087f6c' },
      background: {
        default: mode === 'dark' ? '#0a1220' : '#edf2f7',
        paper: mode === 'dark' ? '#111d2e' : '#ffffff',
      },
      text: {
        primary: mode === 'dark' ? '#e7eef8' : '#1a2940',
        secondary: mode === 'dark' ? '#90a2bb' : '#62738b',
      },
      divider: mode === 'dark' ? '#26354a' : '#dce4ee',
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: 'Inter, Segoe UI, sans-serif',
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: { styleOverrides: { root: { boxShadow: 'none' } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    },
  });
}
