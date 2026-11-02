/** Общий экран ожидания для всех клиентов, включая открытые вне настроек вкладки. */
import { useEffect, useState } from 'react';
import {
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { requestSignal } from './requestSignal';

type UpdateState = { phase: string; version?: string };

/** Следит за серверной фазой; потеря сети не снимает уже установленную блокировку. */
export function SoftwareUpdateLock() {
  const [status, setStatus] = useState<UpdateState | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let revision = 0;
    let installing = false;
    /** Применяет подтверждённое состояние и обновляет интерфейс после перезапуска установщика. */
    const apply = (next: UpdateState) => {
      if (installing && next.phase === 'idle') window.location.reload();
      installing = next.phase === 'installing';
      setStatus(next);
    };
    /** Блокирует инициатора сразу после ответа команды, не ожидая очередного опроса. */
    const changed = (event: Event) => {
      revision++;
      apply((event as CustomEvent<UpdateState>).detail);
    };
    /** Опрос синхронизирует вкладки; ответ, начатый до локальной команды, не откатывает её фазу. */
    const poll = async () => {
      const started = revision;
      try {
        const response = await fetch('/api/software-update', {
          cache: 'no-store',
          signal: requestSignal(5000, controller.signal),
        });
        if (response.ok) {
          const next = (await response.json()) as UpdateState;
          if (!controller.signal.aborted && started === revision) apply(next);
        }
      } catch {
        /* Сохраняем блокировку до следующего подтверждённого ответа сервера. */
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void poll(), 1000);
      }
    };
    window.addEventListener('mercury:software-update', changed);
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('mercury:software-update', changed);
    };
  }, []);
  const locked =
    status?.phase === 'downloading' || status?.phase === 'installing';
  return (
    <Dialog
      open={locked}
      disableEscapeKeyDown
      fullWidth
      maxWidth="xs"
      sx={{ zIndex: 2147483647 }}
      aria-labelledby="software-update-lock-title"
    >
      <DialogTitle id="software-update-lock-title">
        {status?.phase === 'installing'
          ? 'Установка обновления'
          : 'Загрузка обновления'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography align="center">
            Версия {status?.version}. Дождитесь завершения. Управление временно
            заблокировано.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
