/**
 * React-обёртка выбора компоновки браузера и локального Electron-экрана.
 */
import { useMediaQuery } from '@mui/material';
import { isPcLayout } from './clientLayout';

/** Отслеживает вариант компоновки и освобождает слушатель при размонтировании. */
export function usePcLayout() {
  const wide = useMediaQuery('(min-width: 900px)');
  return isPcLayout(navigator.userAgent, wide);
}
