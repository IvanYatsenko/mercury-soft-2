import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test(
  'shutdown scripts stop the correct service, unmount USB and still cut board power after I/O timeout',
  { skip: process.platform !== 'linux' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'mercury-poweroff-test-'));
    try {
      for (const [relative, service] of [
        ['../../../scripts/raspberry-poweroff.sh', 'mercury-v3.service'],
        ['../../../deploy/legacy/raspberry-poweroff.sh', 'mercury-v2.service'],
      ])
        for (const timeoutExit of [0, 124]) {
          const trace = join(root, 'trace');
          await writeFile(trace, '');
          for (const [name, body] of Object.entries({
            id: 'printf 0',
            runuser: 'printf "%s\\n" "runuser $*" >> "$TRACE"',
            timeout: `printf "%s\\n" "timeout $*" >> "$TRACE"; exit ${timeoutExit}`,
            mountpoint: 'exit 0',
          }))
            await writeFile(join(root, name), '#!/bin/sh\n' + body + '\n', {
              mode: 0o755,
            });
          const result = spawnSync(
            '/bin/sh',
            [fileURLToPath(new URL(relative, import.meta.url))],
            {
              encoding: 'utf8',
              env: {
                ...process.env,
                PATH: root + ':' + process.env.PATH,
                TRACE: trace,
              },
            },
          );
          assert.equal(result.status, 0, result.stderr);
          const commands = (await readFile(trace, 'utf8')).trim().split('\n');
          assert.ok(commands[0].includes('systemctl --user stop ' + service));
          assert.equal(commands[1], 'timeout 8 sync');
          assert.equal(commands[2], 'timeout 5 umount /media/flash');
          assert.ok(commands[3].includes('/apps/server/dist/shutdownBoard.js'));
          assert.equal(commands.length, 4);
        }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
