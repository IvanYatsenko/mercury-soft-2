import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const appVersion = (
  JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
).version;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, 'MERCURY_');
  const apiPort = Number(env.MERCURY_API_PORT ?? 3001);
  const webPort = Number(env.MERCURY_WEB_PORT ?? 5173);
  for (const [name, port] of [
    ['MERCURY_API_PORT', apiPort],
    ['MERCURY_WEB_PORT', webPort],
  ] as const) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`${name} должен быть целым числом от 1 до 65535.`);
    }
  }

  return {
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    server: {
      host: '127.0.0.1',
      port: webPort,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
  };
});
