import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type WifiStatus = {
  available: boolean;
  enabled: boolean;
  connected: boolean;
  ssid: string | null;
  device: string | null;
  error?: string;
};

export type WifiNetwork = {
  ssid: string;
  signal: number;
  security: string;
  connected: boolean;
};

function fields(line: string): string[] {
  const result: string[] = [];
  let field = '';
  let escaped = false;
  for (const char of line) {
    if (escaped) {
      field += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === ':') {
      result.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  result.push(field);
  return result;
}

async function nmcli(
  args: string[],
  timeout = 10_000,
  secret?: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('nmcli', args, {
      timeout,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    });
    return stdout.trim();
  } catch (error) {
    const stderr =
      typeof error === 'object' &&
      error !== null &&
      'stderr' in error &&
      typeof error.stderr === 'string'
        ? error.stderr.trim()
        : '';
    const message =
      stderr ||
      (error instanceof Error && 'code' in error && error.code === 'ENOENT'
        ? 'NetworkManager (nmcli) не установлен.'
        : 'Не удалось выполнить команду Wi-Fi.');
    throw new Error(secret ? message.replaceAll(secret, '[скрыто]') : message);
  }
}

export async function getWifiStatus(): Promise<WifiStatus> {
  if (process.platform !== 'linux') {
    return {
      available: false,
      enabled: false,
      connected: false,
      ssid: null,
      device: null,
      error: 'Управление Wi-Fi доступно на Raspberry Pi с NetworkManager.',
    };
  }

  const [radio, devices] = await Promise.all([
    nmcli(['radio', 'wifi']),
    nmcli([
      '-t',
      '-e',
      'yes',
      '-f',
      'DEVICE,TYPE,STATE,CONNECTION',
      'device',
      'status',
    ]),
  ]);
  const wifi = devices
    .split(/\r?\n/)
    .map(fields)
    .find((row) => row[1] === 'wifi');
  if (!wifi) {
    return {
      available: false,
      enabled: radio === 'enabled',
      connected: false,
      ssid: null,
      device: null,
      error: 'Wi-Fi-адаптер не найден.',
    };
  }
  const connected = wifi[2]?.startsWith('connected') ?? false;
  return {
    available: true,
    enabled: radio === 'enabled',
    connected,
    ssid: connected ? wifi[3] || null : null,
    device: wifi[0] ?? null,
  };
}

export async function listWifiNetworks(): Promise<WifiNetwork[]> {
  const status = await getWifiStatus();
  if (!status.available || !status.device)
    throw new Error(status.error ?? 'Wi-Fi-адаптер не найден.');
  if (!status.enabled) return [];
  const output = await nmcli(
    [
      '-t',
      '-e',
      'yes',
      '-f',
      'IN-USE,SSID,SIGNAL,SECURITY',
      'device',
      'wifi',
      'list',
      '--rescan',
      'yes',
      'ifname',
      status.device,
    ],
    20_000,
  );
  const networks = new Map<string, WifiNetwork>();
  for (const line of output.split(/\r?\n/)) {
    const [inUse, ssid, signal, security] = fields(line);
    if (!ssid) continue;
    const entry = {
      ssid,
      signal: Number(signal) || 0,
      security: security ?? '',
      connected: inUse === '*',
    };
    const previous = networks.get(ssid);
    if (!previous || entry.connected || entry.signal > previous.signal)
      networks.set(ssid, entry);
  }
  return [...networks.values()].sort(
    (a, b) => Number(b.connected) - Number(a.connected) || b.signal - a.signal,
  );
}

export async function connectWifi(
  ssid: string,
  password?: string,
): Promise<WifiStatus> {
  const status = await getWifiStatus();
  if (!status.available || !status.device)
    throw new Error(status.error ?? 'Wi-Fi-адаптер не найден.');
  if (!status.enabled) await nmcli(['radio', 'wifi', 'on']);
  const args = ['--wait', '25', 'device', 'wifi', 'connect', ssid];
  if (password) args.push('password', password);
  args.push('ifname', status.device);
  await nmcli(args, 30_000, password);
  return getWifiStatus();
}

export async function disconnectWifi(): Promise<WifiStatus> {
  const status = await getWifiStatus();
  if (!status.available || !status.device)
    throw new Error(status.error ?? 'Wi-Fi-адаптер не найден.');
  if (status.connected)
    await nmcli(
      ['--wait', '10', 'device', 'disconnect', status.device],
      15_000,
    );
  return getWifiStatus();
}

export async function setWifiEnabled(enabled: boolean): Promise<WifiStatus> {
  const status = await getWifiStatus();
  if (!status.available)
    throw new Error(status.error ?? 'Wi-Fi-адаптер не найден.');
  await nmcli(['radio', 'wifi', enabled ? 'on' : 'off']);
  return getWifiStatus();
}
