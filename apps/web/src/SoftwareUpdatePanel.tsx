import { useEffect, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';

type Status = {
  phase: string;
  currentVersion: string;
  version?: string;
  error?: string;
};
export function SoftwareUpdatePanel({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch('/api/software-update');
        if (!response.ok) return;
        const next = (await response.json()) as Status;
        if (alive)
          setStatus((previous) => {
            if (previous?.phase === 'installing' && next.phase === 'idle')
              window.location.reload();
            return next;
          });
      } catch {
        /* The service goes offline while installing. */
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  const request = async (action: string) => {
    const response = await fetch(`/api/software-update/${action}`, {
      method: 'POST',
    });
    const next = (await response.json()) as Status & { error?: string };
    if (!response.ok)
      throw new Error(next.error ?? 'Не удалось обновить программу');
    setStatus(next);
    return next;
  };
  const update = async () => {
    setBusy(true);
    setError('');
    const installing = status?.phase === 'ready';
    try {
      if (installing) {
        setStatus({ ...status, phase: 'installing' });
        await request('install');
      } else if (status?.phase === 'available') await request('download');
      else {
        const checked = await request('check');
        if (checked.phase === 'available') await request('download');
      }
    } catch (e) {
      if (!(installing && e instanceof TypeError)) setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const running = ['checking', 'downloading', 'installing'].includes(
    status?.phase ?? '',
  );
  return (
    <Stack spacing={1} sx={{ py: 1 }}>
      <Typography fontWeight={600}>Обновление ПО</Typography>
      {status?.phase === 'current' && (
        <Typography>Установлена актуальная версия</Typography>
      )}
      {status?.phase === 'downloading' && (
        <Typography>Загрузка обновления…</Typography>
      )}
      {status?.phase === 'ready' && (
        <Typography>Версия {status.version} готова к установке</Typography>
      )}
      {status?.phase === 'installing' && (
        <Typography>Установка… Дождитесь перезапуска программы.</Typography>
      )}
      {(error || status?.error) && (
        <Alert severity="error">{error || status?.error}</Alert>
      )}
      <Button
        variant="outlined"
        disabled={disabled || busy || running}
        onClick={() => void update()}
        sx={{ minHeight: 44 }}
      >
        {status?.phase === 'ready' ? 'Установить обновление' : 'Обновить'}
      </Button>
    </Stack>
  );
}
