/**
 * Охлаждение процессора Raspberry через GPIO с гистерезисом; не связано с вентиляторами камеры.
 */
import { readFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { coolingDemand } from './coolingDemand.js';

const cooling = {
  supported: false,
  temperatureC: null as number | null,
  enabled: null as boolean | null,
  error: '',
};
let testUntil = 0;
let testing = false;
let refresh: (() => Promise<void>) | undefined;
/**
 * Возвращает состояние охлаждения процессора Raspberry, отдельно от контрольной платы.
 */
export function raspberryCoolingStatus() {
  return { ...cooling, testing };
}
/**
 * Запускает ограниченную по времени проверку GPIO-вентилятора только на Raspberry.
 */
export async function testRaspberryCooling() {
  if (!cooling.supported || !refresh)
    throw new Error('Вентилятор Raspberry доступен только на Raspberry Pi.');
  if (testing) throw new Error('Проверка уже выполняется.');
  testing = true;
  testUntil = Date.now() + 3000;
  try {
    await refresh();
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (cooling.enabled !== true || cooling.error)
      throw new Error(
        cooling.error || 'Не удалось включить вентилятор Raspberry.',
      );
    return { success: true };
  } finally {
    testUntil = 0;
    testing = false;
    await refresh();
  }
}

/** Keep GPIO requested: exiting gpioset does not preserve its output value. */
export async function startRaspberryCooling() {
  if (process.platform !== 'linux') return;
  const model = await readFile('/proc/device-tree/model', 'utf8').catch(
    () => '',
  );
  if (!model.includes('Raspberry Pi')) return;
  cooling.supported = true;

  let output: ChildProcess | undefined;
  let enabled: boolean | undefined;
  let previousError = '';
  /**
   * Отмечает сбой фоновой операции, не создавая бесконечный поток одинаковых сообщений.
   */
  const reportError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== previousError) console.warn('Raspberry cooling:', message);
    previousError = message;
    cooling.error = message;
  };

  /**
   * Применяет состояние GPIO-вентилятора и учитывает результат системной команды.
   */
  const setFan = async (nextEnabled: boolean) => {
    if (output && enabled === nextEnabled) return;
    if (output) {
      const stopped = once(output, 'exit');
      output.kill();
      await stopped;
    }
    enabled = undefined;
    cooling.enabled = null;
    const child = spawn(
      'gpioset',
      ['--banner', '--strict', `GPIO4=${nextEnabled ? 1 : 0}`],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    output = child;
    child.once('error', (error) => {
      if (output === child) {
        output = undefined;
        enabled = undefined;
        cooling.enabled = null;
      }
      reportError(error);
    });
    child.once('exit', (code, signal) => {
      if (output === child) {
        output = undefined;
        enabled = undefined;
        cooling.enabled = null;
        if (code !== 0 && !signal)
          reportError(`gpioset exited with code ${code}`);
      }
    });
    child.stderr?.on('data', (data: Buffer) =>
      reportError(data.toString().trim()),
    );
    child.stdout?.once('data', () => {
      if (output !== child) return;
      enabled = nextEnabled;
      cooling.enabled = nextEnabled;
      cooling.error = '';
      previousError = '';
      console.log(`Raspberry cooling: fan ${enabled ? 'ON' : 'OFF'} (GPIO4)`);
    });
  };

  let automatic: boolean | undefined;
  /** Читает температуру процессора и применяет гистерезис охлаждения Raspberry. */
  const monitor = async () => {
    try {
      const temperature =
        Number(
          await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8'),
        ) / 1000;
      if (!Number.isFinite(temperature) || temperature <= 0)
        throw new Error('Invalid CPU temperature');
      cooling.temperatureC = temperature;
      automatic = coolingDemand(temperature, automatic, 60, 50);
      const nextEnabled = automatic || Date.now() < testUntil;
      await setFan(nextEnabled);
    } catch (error) {
      reportError(error);
      cooling.temperatureC = null;
      // Continue cooling if CPU temperature cannot be read.
      await setFan(true).catch(reportError);
    }
  };
  let pending = Promise.resolve();
  refresh = () => {
    pending = pending.catch(() => {}).then(monitor);
    return pending;
  };
  /** Планирует очередную проверку без наложения незавершённых системных команд. */
  const tick = async () => {
    await refresh!();
    setTimeout(() => void tick(), 5000).unref();
  };
  process.once('exit', () => output?.kill());
  console.log('Raspberry cooling: automatic control enabled (60/50 °C)');
  void tick();
}
