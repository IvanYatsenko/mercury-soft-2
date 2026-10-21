import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { flushConfigWrites } from './ovenSettings.js';
import { profileRunner } from './profileRunner.js';
import { checkpointDatabase } from './database.js';
import { powerOffController } from './controller/checkControllerConnection.js';

const execute = promisify(execFile);
let shuttingDown = false;
export function isShuttingDown() {
  return shuttingDown;
}

export async function handleRaspberryShutdown(state: number | undefined) {
  if (
    shuttingDown ||
    state === undefined ||
    (state & 32) === 0 ||
    config.controllerMode !== 'hardware' ||
    process.platform !== 'linux'
  )
    return;
  const model = await readFile('/proc/device-tree/model', 'utf8').catch(
    () => '',
  );
  if (!model.includes('Raspberry Pi') || shuttingDown) return;
  shuttingDown = true;
  try {
    console.log('Raspberry shutdown: controller requested shutdown');
    await flushConfigWrites();
    if (profileRunner.active()) await profileRunner.stop();
    await checkpointDatabase();
    const result = await powerOffController(config.serialPort, 30);
    if (!result.success)
      throw new Error(result.error ?? 'Board shutdown acknowledgement failed');
    await execute('sync', [], { timeout: 3000 }).catch((error) => {
      console.warn(
        'USB sync did not finish; shutdown helper will retry with a timeout:',
        error,
      );
    });
    await execute(
      'sudo',
      [
        '-n',
        'systemd-run',
        '--unit=mercury-shutdown',
        '--collect',
        '/bin/sh',
        fileURLToPath(
          new URL('../../../scripts/raspberry-poweroff.sh', import.meta.url),
        ),
      ],
      { timeout: 3000 },
    );
  } catch (error) {
    shuttingDown = false;
    console.error('Raspberry shutdown failed; will retry:', error);
  }
}
