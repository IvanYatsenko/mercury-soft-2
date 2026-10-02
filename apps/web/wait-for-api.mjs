import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);

const port = process.env.MERCURY_API_PORT ?? 3001;
const url = `http://127.0.0.1:${port}/api/health`;
const deadline = Date.now() + 60_000;

while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    if (response.ok) process.exit(0);
  } catch {
    // The API process may still be compiling or restarting.
  }
  await delay(300);
}

throw new Error(`API не запустился за 60 секунд: ${url}`);
