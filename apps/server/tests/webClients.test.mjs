import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWebClientsRouter } from '../dist/webClients.js';

test('browser gets PC bundle, Electron keeps frozen bundle; missing PC build falls back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mercury-clients-'));
  const panel = join(dir, 'panel'),
    pc = join(dir, 'pc');
  await mkdir(panel);
  await mkdir(pc);
  await writeFile(join(panel, 'index.html'), 'frozen-panel-3.1.6');
  await writeFile(join(pc, 'index.html'), 'desktop-browser');
  await writeFile(join(pc, 'test.js'), 'pc-asset');
  const app = express();
  app.use(createWebClientsRouter(panel, pc));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal(await (await fetch(base)).text(), 'desktop-browser');
    assert.equal(
      await (
        await fetch(base, {
          headers: { 'User-Agent': 'Chrome/130 Electron/37.0.0' },
        })
      ).text(),
      'frozen-panel-3.1.6',
    );
    assert.equal(await (await fetch(base + '/pc/test.js')).text(), 'pc-asset');
    await rm(join(pc, 'index.html'));
    assert.equal(await (await fetch(base)).text(), 'frozen-panel-3.1.6');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
