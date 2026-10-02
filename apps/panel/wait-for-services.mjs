import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import waitOn from 'wait-on';

const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);

const apiPort = process.env.MERCURY_API_PORT ?? 3001;
const webPort = process.env.MERCURY_WEB_PORT ?? 5173;
const resources = [`http-get://127.0.0.1:${apiPort}/api/health`];
if (process.argv.includes('--dev')) {
  resources.unshift(`http-get://127.0.0.1:${webPort}`);
}

await waitOn({ resources, timeout: 60_000 });
