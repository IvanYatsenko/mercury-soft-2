import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
const root = fileURLToPath(new URL('../', import.meta.url));
loadEnvFile(new URL('../.env', import.meta.url));
try {
  const old = JSON.parse(
    readFileSync(join(homedir(), '.config/mercury-soft-2/config.json'), 'utf8'),
  );
  if (/^\/dev\/[a-zA-Z0-9_/-]+$/.test(old.comPort ?? ''))
    process.env.MERCURY_SERIAL_PORT = old.comPort;
  if (typeof old.urlUpdate === 'string' && old.urlUpdate.startsWith('https://'))
    process.env.MERCURY_UPDATE_URL = old.urlUpdate;
} catch {
  /* A fresh installation uses the package's serial default. */
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGINT');
  const deadline = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 8000);
  Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) resolve();
          else child.once('exit', resolve);
        }),
    ),
  ).then(() => {
    clearTimeout(deadline);
    process.exit(code);
  });
}
function start(file, args, cwd) {
  const child = spawn(file, args, { cwd, env: process.env, stdio: 'ignore' });
  children.push(child);
  child.once('error', () => stop(1));
  child.once('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
  return child;
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
start(process.execPath, ['apps/server/dist/index.js'], root);
let ready = false;
for (let i = 0; i < 120 && !stopping; i++) {
  try {
    const response = await fetch('http://127.0.0.1:3001/api/health', {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    /* The API is still starting. */
  }
  await sleep(500);
}
if (!ready) stop(1);
else if (!stopping) {
  const electron = fileURLToPath(
    new URL(
      '../apps/panel/node_modules/electron/dist/electron',
      import.meta.url,
    ),
  );
  start(
    electron,
    ['.'],
    fileURLToPath(new URL('../apps/panel/', import.meta.url)),
  );
}
