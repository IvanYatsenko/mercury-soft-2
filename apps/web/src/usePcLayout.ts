import { useMediaQuery } from '@mui/material';
import { isPcLayout } from './clientLayout';

export function usePcLayout() {
  const wide = useMediaQuery('(min-width: 900px)');
  return isPcLayout(navigator.userAgent, wide);
}
