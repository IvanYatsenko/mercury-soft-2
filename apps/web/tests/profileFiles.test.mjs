import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProfileFile, profileFile } from '../src/profileFiles.ts';
const p = {
  name: 'Тест',
  mode: 'manual',
  board: false,
  points: [
    { second: 0, temperature: 50 },
    { second: 100, temperature: 100 },
  ],
  shelves: [
    { second: 0, temperature: 50 },
    { second: 0, temperature: 100 },
    { second: 0, temperature: 50 },
  ],
};
test('JSON exchange round trip preserves profile data and source but strips database IDs', () => {
  const source = { model: '400', connectionVoltage: '230' };
  const parsed = parseProfileFile(
    profileFile([{ ...p, id: 'private-id' }], source),
  );
  assert.deepEqual(parsed.source, source);
  assert.deepEqual(parsed.profiles, [p]);
  assert.deepEqual(parseProfileFile(JSON.stringify([p])).profiles, [p]);
});
test('JSON import rejects unsupported, oversized, fractional and invalid profile files', () => {
  for (const text of [
    'bad JSON',
    JSON.stringify({ format: 'other', version: 1, profiles: [p] }),
    JSON.stringify({ format: 'mercury-profiles', version: 99, profiles: [p] }),
    JSON.stringify([{ ...p, repeat: 21 }]),
    JSON.stringify([{ ...p, points: [{ second: 0, temperature: 50.5 }] }]),
    ' '.repeat(81921),
  ])
    assert.throws(() => parseProfileFile(text));
});
