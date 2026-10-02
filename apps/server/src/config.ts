import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const envFile = new URL('../../../.env', import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);

function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  const port = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} должен быть целым числом от 1 до 65535.`);
  }
  return port;
}

const controllerMode = process.env.MERCURY_CONTROLLER_MODE ?? 'simulation';
if (controllerMode !== 'simulation' && controllerMode !== 'hardware') {
  throw new Error('MERCURY_CONTROLLER_MODE: укажи simulation или hardware.');
}

export const config = {
  controllerMode,
  serialPort:
    !process.env.MERCURY_SERIAL_PORT ||
    process.env.MERCURY_SERIAL_PORT === 'auto'
      ? process.platform === 'win32'
        ? 'COM4'
        : '/dev/ttyUSB0'
      : process.env.MERCURY_SERIAL_PORT,
  apiPort: readPort('MERCURY_API_PORT', 3001),
} as const;
