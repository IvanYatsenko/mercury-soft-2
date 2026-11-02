import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newerVersion,
  validateRelease,
  checkSoftwareUpdate,
  updateStatus,
  downloadSoftwareUpdate,
  updateBlocksRequest,
} from '../dist/softwareUpdate.js';

test('release versions compare numerically rather than by individual component maxima', () => {
  assert.equal(newerVersion('3.0.0', '2.3.5'), true);
  assert.equal(newerVersion('3.0.10', '3.0.9'), true);
  assert.equal(newerVersion('3.0.0', '3.0.0'), false);
  assert.equal(newerVersion('2.99.99', '3.0.0'), false);
});
test('manifest rejects traversal paths, malformed versions and missing strong checksum', () => {
  const valid = {
    version: '3.0.1',
    archive: '3.0.1_linux-arm64-unpacked.tar.gz',
    sha256: 'a'.repeat(64),
  };
  assert.doesNotThrow(() => validateRelease(valid));
  for (const value of [
    null,
    {},
    { ...valid, archive: '../payload.tar.gz' },
    { ...valid, sha256: 'abc' },
    { ...valid, version: '3.0.1; reboot' },
  ]) {
    assert.throws(() => validateRelease(value));
  }
});
test('failed update checks remain visible and do not leave update in progress', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error('Offline');
    };
    assert.equal((await checkSoftwareUpdate()).phase, 'error');
    assert.match(updateStatus().error, /Offline/);
  } finally {
    globalThis.fetch = original;
  }
});

test('manifest streaming stops at byte limit and subsequent checks recover', async () => {
  const original = globalThis.fetch;
  let cancelled = false;
  try {
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(8193));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    const rejected = await checkSoftwareUpdate();
    assert.equal(rejected.phase, 'error');
    assert.match(rejected.error, /Слишком большой/);
    assert.equal(cancelled, true);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          version: '999.0.0',
          archive: '999.0.0_linux-arm64-unpacked.tar.gz',
          sha256: 'a'.repeat(64),
        }),
      );
    assert.equal((await checkSoftwareUpdate()).phase, 'available');
  } finally {
    globalThis.fetch = original;
  }
});

test('download requires explicit confirmation of the exact offered version before any download', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async () => {
      requests++;
      return new Response(
        JSON.stringify({
          version: '999.0.0',
          archive: '999.0.0_linux-arm64-unpacked.tar.gz',
          sha256: 'a'.repeat(64),
        }),
      );
    };
    await checkSoftwareUpdate();
    for (const confirmation of [
      undefined,
      {},
      { confirmed: false, version: '999.0.0' },
      { confirmed: true, version: '998.0.0' },
    ])
      await assert.rejects(downloadSoftwareUpdate(confirmation), /Подтвердите/);
    assert.equal(requests, 1);
    assert.equal(updateStatus().phase, 'available');
  } finally {
    globalThis.fetch = original;
  }
});

test('download and installation block every client mutation while reads and update commands remain available', () => {
  for (const phase of ['downloading', 'installing']) {
    for (const path of [
      '/api/run/start',
      '/api/settings-access/unlock',
      '/api/settings/fan-reference',
      '/api/config',
      '/api/profiles',
    ])
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
        assert.equal(updateBlocksRequest(method, path, phase), true);
    for (const method of ['GET', 'HEAD', 'OPTIONS'])
      assert.equal(
        updateBlocksRequest(method, '/api/software-update', phase),
        false,
      );
    assert.equal(
      updateBlocksRequest('POST', '/api/software-update/install', phase),
      false,
    );
  }
  for (const phase of ['idle', 'checking', 'available', 'ready', 'error'])
    assert.equal(updateBlocksRequest('POST', '/api/run/start', phase), false);
});
