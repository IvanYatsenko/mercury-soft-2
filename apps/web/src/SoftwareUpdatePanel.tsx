/**
 * Интерфейс проверки и установки обновления; опрос статуса не запускает установку.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Stack,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';

type Status = {
  phase: string;
  currentVersion: string;
  version?: string;
  error?: string;
};
/**
 * Отрисовывает SoftwareUpdatePanel: Интерфейс проверки и установки обновления; опрос статуса не запускает установку.
 */
export function SoftwareUpdatePanel({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloadVersion, setDownloadVersion] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    /**
     * Повторно запрашивает состояние, пока экран открыт; очистка эффекта останавливает опрос.
     */
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
  /** Выполняет отдельную команду обновления и принимает актуальную серверную фазу. */
  const request = async (action: string) => {
    const response = await fetch(`/api/software-update/${action}`, {
      method: 'POST',
      ...(action === 'download'
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmed: true, version: downloadVersion }),
          }
        : {}),
    });
    const next = (await response.json()) as Status & { error?: string };
    if (!response.ok)
      throw new Error(next.error ?? 'Не удалось обновить программу');
    setStatus(next);
    window.dispatchEvent(
      new CustomEvent('mercury:software-update', { detail: next }),
    );
    return next;
  };
  /** Выбирает действие по фазе: проверка/загрузка либо отдельное подтверждение установки готового пакета. */
  const update = async () => {
    setBusy(true);
    setError('');
    const installing = status?.phase === 'ready';
    try {
      if (installing) {
        setStatus({ ...status, phase: 'installing' });
        await request('install');
      } else if (status?.phase === 'available')
        setDownloadVersion(status.version ?? null);
      else {
        const checked = await request('check');
        if (checked.phase === 'available')
          setDownloadVersion(checked.version ?? null);
      }
    } catch (e) {
      if (!(installing && e instanceof TypeError)) setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  /** Скачивает только явно подтверждённую версию; отказ оставляет доступную версию незагруженной. */
  const confirmDownload = async () => {
    setBusy(true);
    setError('');
    try {
      await request('download');
      setDownloadVersion(null);
    } catch (e) {
      setError(String(e));
      setDownloadVersion(null);
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
      <Dialog
        open={downloadVersion !== null}
        onClose={() => !busy && setDownloadVersion(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Загрузить обновление?</DialogTitle>
        <DialogContent>
          <Typography>
            Доступна версия {downloadVersion}. На время загрузки управление
            будет заблокировано на всех экранах.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDownloadVersion(null)}>
            Отмена
          </Button>
          <Button
            disabled={busy || disabled}
            variant="contained"
            onClick={() => void confirmDownload()}
          >
            Загрузить
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
