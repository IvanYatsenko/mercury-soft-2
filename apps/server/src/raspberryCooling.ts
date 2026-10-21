import { readFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

/** Keep GPIO requested: exiting gpioset does not preserve its output value. */
export async function startRaspberryCooling() {
  if (process.platform !== 'linux') return;
  const model = await readFile('/proc/device-tree/model', 'utf8').catch(
    () => '',
  );
  if (!model.includes('Raspberry Pi')) return;

  let output: ChildProcess | undefined;
  let enabled: boolean | undefined;
  let previousError = '';
  const reportError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== previousError) console.warn('Raspberry cooling:', message);
    previousError = message;
  };

  const setFan = async (nextEnabled: boolean) => {
    if (output && enabled === nextEnabled) return;
    if (output) {
      const stopped = once(output, 'exit');
      output.kill();
      await stopped;
    }
    enabled = undefined;
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
      }
      reportError(error);
    });
    child.once('exit', (code, signal) => {
      if (output === child) {
        output = undefined;
        enabled = undefined;
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
      previousError = '';
      console.log(`Raspberry cooling: fan ${enabled ? 'ON' : 'OFF'} (GPIO4)`);
    });
  };

  const monitor = async () => {
    try {
      const temperature =
        Number(
          await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8'),
        ) / 1000;
      if (!Number.isFinite(temperature) || temperature <= 0)
        throw new Error('Invalid CPU temperature');
      const nextEnabled =
        temperature > 60 ? true : temperature < 50 ? false : (enabled ?? true);
      await setFan(nextEnabled);
    } catch (error) {
      reportError(error);
      // Continue cooling if CPU temperature cannot be read.
      await setFan(true).catch(reportError);
    } finally {
      setTimeout(() => void monitor(), 5000).unref();
    }
  };
  process.once('exit', () => output?.kill());
  console.log('Raspberry cooling: automatic control enabled (60/50 °C)');
  void monitor();
}
