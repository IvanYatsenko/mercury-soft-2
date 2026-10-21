import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  SvgIcon,
  Typography,
} from '@mui/material';
import { KeyboardTextField } from './OnScreenKeyboard';

export type WifiStatus = {
  available: boolean;
  enabled: boolean;
  connected: boolean;
  ssid: string | null;
  device: string | null;
  error?: string;
};

type WifiNetwork = {
  ssid: string;
  signal: number;
  security: string;
  connected: boolean;
};

type WifiPageProps = {
  status: WifiStatus | null;
  onStatusChange: (status: WifiStatus) => void;
  onBack: () => void;
};

async function readResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error ?? `Ошибка ${response.status}`);
  return result;
}

export function WifiPage({ status, onStatusChange, onBack }: WifiPageProps) {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selected, setSelected] = useState<WifiNetwork | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = async () => {
    setScanning(true);
    setError(null);
    try {
      setNetworks(
        await readResponse<WifiNetwork[]>(await fetch('/api/wifi/networks')),
      );
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : 'Не удалось найти сети.',
      );
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (status?.available && status.enabled) void scan();
  }, [status?.available, status?.enabled]);

  const changeConnection = async (action: 'connect' | 'disconnect') => {
    if (action === 'connect' && !selected) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/wifi/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(action === 'connect'
          ? {
              body: JSON.stringify({
                ssid: selected?.ssid,
                password: password || undefined,
              }),
            }
          : {}),
      });
      const nextStatus = await readResponse<WifiStatus>(response);
      onStatusChange(nextStatus);
      setSelected(null);
      setPassword('');
      if (nextStatus.enabled) await scan();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : 'Ошибка Wi-Fi.',
      );
    } finally {
      setBusy(false);
    }
  };

  const changeRadio = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const nextStatus = await readResponse<WifiStatus>(
        await fetch('/api/wifi/radio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        }),
      );
      onStatusChange(nextStatus);
      setSelected(null);
      setPassword('');
      if (!enabled) setNetworks([]);
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : 'Не удалось изменить состояние Wi-Fi.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={0.75}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button
          onClick={onBack}
          sx={{ minHeight: 44, minWidth: 84 }}
          startIcon={
            <SvgIcon>
              <path d="m20 11-12 0 5-5-1.4-1.4L4.2 12l7.4 7.4L13 18l-5-5h12v-2Z" />
            </SvgIcon>
          }
        >
          Назад
        </Button>
        <Typography variant="h6">Wi-Fi</Typography>
      </Stack>

      {!status ? (
        <Typography>Проверка Wi-Fi…</Typography>
      ) : !status.available ? (
        <Alert severity="info">
          {status.error ?? 'Wi-Fi недоступен на этом устройстве.'}
        </Alert>
      ) : (
        <>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={0.5}
          >
            <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
              {status.connected
                ? `Подключено: ${status.ssid ?? 'Wi-Fi'}`
                : status.enabled
                  ? 'Нет подключения'
                  : 'Wi-Fi выключен'}
            </Typography>
            {status.connected && (
              <Button
                size="small"
                color="error"
                disabled={busy}
                onClick={() => void changeConnection('disconnect')}
              >
                Отключить
              </Button>
            )}
          </Stack>
          {error && (
            <Alert severity="error" sx={{ py: 0 }}>
              {error}
            </Alert>
          )}
          <Button
            variant="outlined"
            color={status.enabled ? 'inherit' : 'primary'}
            disabled={busy}
            onClick={() => void changeRadio(!status.enabled)}
            sx={{ minHeight: 40 }}
          >
            {status.enabled ? 'Выключить Wi-Fi' : 'Включить Wi-Fi'}
          </Button>
          <Button
            variant="outlined"
            disabled={busy || scanning || !status.enabled}
            onClick={() => void scan()}
            sx={{ minHeight: 40 }}
          >
            {scanning ? 'Поиск…' : 'Обновить список сетей'}
          </Button>
          {selected && (
            <Card variant="outlined">
              <CardContent sx={{ p: '8px !important' }}>
                <Stack spacing={0.75}>
                  <Typography variant="subtitle2" noWrap>
                    {selected.ssid}
                  </Typography>
                  {selected.security !== '--' && selected.security !== '' && (
                    <KeyboardTextField
                      label="Пароль (если требуется)"
                      type="password"
                      value={password}
                      onChange={setPassword}
                    />
                  )}
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      variant="contained"
                      disabled={busy}
                      onClick={() => void changeConnection('connect')}
                      sx={{ minHeight: 40 }}
                    >
                      Подключиться
                    </Button>
                    <Button
                      onClick={() => {
                        setSelected(null);
                        setPassword('');
                      }}
                    >
                      Отмена
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          )}
          {networks.map((network) => (
            <Button
              key={network.ssid}
              variant={network.connected ? 'contained' : 'outlined'}
              disabled={busy || network.connected}
              onClick={() => {
                setSelected(network);
                setPassword('');
              }}
              sx={{
                minHeight: 42,
                textTransform: 'none',
                justifyContent: 'space-between',
                px: 1,
              }}
            >
              <Typography variant="body2" noWrap sx={{ maxWidth: '75%' }}>
                {network.ssid}
              </Typography>
              <Stack
                component="span"
                direction="row"
                spacing={0.5}
                alignItems="center"
              >
                {network.security && network.security !== '--' && (
                  <SvgIcon sx={{ fontSize: 16 }} titleAccess="Защищённая сеть">
                    <path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2ZM10 6a2 2 0 0 1 4 0v2h-4V6Zm2 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                  </SvgIcon>
                )}
                <SvgIcon
                  sx={{ fontSize: 18 }}
                  titleAccess={`Сигнал ${network.signal}%`}
                >
                  <path
                    d="M1 9l2 2c5-5 13-5 18 0l2-2C17 3 7 3 1 9Z"
                    opacity={network.signal >= 65 ? 1 : 0.25}
                  />
                  <path
                    d="m5 13 2 2c2.76-2.76 7.24-2.76 10 0l2-2c-3.86-3.86-10.14-3.86-14 0Z"
                    opacity={network.signal >= 35 ? 1 : 0.25}
                  />
                  <path d="m9 17 3 3 3-3c-1.65-1.65-4.35-1.65-6 0Z" />
                </SvgIcon>
                <Box component="span" sx={{ fontSize: 12 }}>
                  {network.signal}%
                </Box>
              </Stack>
            </Button>
          ))}
          {!scanning && networks.length === 0 && status.enabled && (
            <Typography variant="body2" color="text.secondary">
              Сети не найдены.
            </Typography>
          )}
        </>
      )}
    </Stack>
  );
}
