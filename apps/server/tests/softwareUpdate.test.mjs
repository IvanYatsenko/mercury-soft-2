import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newerVersion,
  validateRelease,
  checkSoftwareUpdate,
  updateStatus,
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
