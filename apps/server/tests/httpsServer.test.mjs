import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { optionalTlsOptions } from '../dist/httpsServer.js';
test('HTTPS is opt-in and invalid or partial configuration is rejected', () => {
  assert.equal(optionalTlsOptions({}, 8075), null);
  for (const env of [
    { MERCURY_TLS_CERT_PATH: '/missing' },
    {
      MERCURY_TLS_CERT_PATH: '/missing',
      MERCURY_TLS_KEY_PATH: '/missing',
      MERCURY_HTTPS_PORT: '8075',
    },
    { MERCURY_TLS_CERT_PATH: 'relative', MERCURY_TLS_KEY_PATH: 'relative' },
  ])
    assert.throws(() => optionalTlsOptions(env, 8075));
});
test('HTTPS listener serves the application with TLS and an explicitly trusted test certificate', async () => {
  const cert = fileURLToPath(
    new URL('./fixtures/tls/localhost-test-cert.pem', import.meta.url),
  );
  const key = fileURLToPath(
    new URL('./fixtures/tls/localhost-test-key.pem', import.meta.url),
  );
  const settings = optionalTlsOptions(
    {
      MERCURY_TLS_CERT_PATH: cert,
      MERCURY_TLS_KEY_PATH: key,
      MERCURY_HTTPS_PORT: '8443',
    },
    8075,
  );
  const server = https.createServer(settings.options, (_req, res) =>
    res.end('Mercury TLS fixture'),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const value = await new Promise((resolve, reject) => {
      https
        .get(
          {
            hostname: '127.0.0.1',
            port: server.address().port,
            ca: readFileSync(cert),
          },
          (response) => {
            let text = '';
            response.on('data', (d) => (text += d));
            response.on('end', () => resolve(text));
          },
        )
        .on('error', reject);
    });
    assert.equal(value, 'Mercury TLS fixture');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
