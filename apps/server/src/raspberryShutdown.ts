/**
 * Последовательное завершение приложения перед командой питания плате; ОС Raspberry отдельно не выключается.
 */
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { flushConfigWrites } from './ovenSettings.js';
import { profileRunner } from './profileRunner.js';
import { checkpointDatabase } from './database.js';
import { powerOffController } from './controller/checkControllerConnection.js';
import { pinRecovery } from './pinRecovery.js';

const execute = promisify(execFile);
let shuttingDown = false;
/**
 * Возвращает признак начатого штатного завершения, используемый блокировкой новых команд.
 */
export function isShuttingDown() {
  return shuttingDown;
}

/**
 * Завершает процессы и запись разрешённых данных перед окончательной командой питания плате.
 */
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
    const recovery = pinRecovery.beginShutdown();
    if (recovery) {
      const held = await powerOffController(config.serialPort, 30);
      if (!held.success) {
        pinRecovery.complete();
        throw new Error(
          held.error ?? 'Не удалось подготовить восстановление PIN.',
        );
      }
    }
    await flushConfigWrites();
    if (profileRunner.active()) await profileRunner.stop();
    if (recovery) {
      await recovery;
      await flushConfigWrites();
    }
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
