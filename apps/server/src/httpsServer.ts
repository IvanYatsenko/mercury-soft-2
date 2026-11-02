/**
 * Необязательный HTTPS рядом с основным HTTP; сертификат задаётся окружением и не создаётся автоматически.
 */
import { createServer, type Server } from 'node:https';
import type { RequestListener } from 'node:http';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
/**
 * Загружает пару ключа и сертификата только при явно включённом HTTPS.
 */
export function optionalTlsOptions(env: NodeJS.ProcessEnv, httpPort: number) {
  if (!env.MERCURY_TLS_CERT_PATH && !env.MERCURY_TLS_KEY_PATH) return null;
  const port = Number(env.MERCURY_HTTPS_PORT ?? 8443);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === httpPort)
    throw Error('Некорректный HTTPS-порт.');
  if (
    !env.MERCURY_TLS_CERT_PATH ||
    !env.MERCURY_TLS_KEY_PATH ||
    !isAbsolute(env.MERCURY_TLS_CERT_PATH) ||
    !isAbsolute(env.MERCURY_TLS_KEY_PATH)
  )
    throw Error('Нужны абсолютные пути к сертификату и ключу HTTPS.');
  return {
    port,
    options: {
      cert: readFileSync(env.MERCURY_TLS_CERT_PATH),
      key: readFileSync(env.MERCURY_TLS_KEY_PATH),
      minVersion: 'TLSv1.2' as const,
    },
  };
}
/**
 * Поднимает дополнительный TLS-сервер с тем же Express-приложением; основной HTTP остаётся отдельным.
 */
export function startOptionalHttps(
  handler: RequestListener,
  host: string,
  httpPort: number,
  env = process.env,
): Server | undefined {
  try {
    const settings = optionalTlsOptions(env, httpPort);
    if (!settings) return;
    const server = createServer(settings.options, handler);
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    server.keepAliveTimeout = 5000;
    server.on('error', () =>
      console.error('HTTPS недоступен: проверьте сертификат, ключ и порт.'),
    );
    server.listen(settings.port, host, () =>
      console.log(`Mercury HTTPS: порт ${settings.port}`),
    );
    return server;
  } catch {
    console.error('HTTPS не запущен: проверьте настройки сертификата и ключа.');
    return;
  }
}
