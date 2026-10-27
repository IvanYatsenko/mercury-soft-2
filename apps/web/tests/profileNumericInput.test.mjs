import test from 'node:test';
import assert from 'node:assert/strict';
import { profileNumericInput } from '../src/profileNumericInput.ts';
import { validateProfile } from '../../../packages/shared/dist/index.js';

test('profile input rejects out-of-range, fractional and unfinished numbers', () => {
  for (const raw of [
    '305',
    '30000',
    '-200',
    '0.5',
    '50,5',
    '1e2',
    '',
    ' ',
    'NaN',
    'Infinity',
    '50.',
  ])
    assert.ok(Number.isNaN(profileNumericInput(raw, 0, 280, true)), raw);
  for (const raw of ['0', '50', '280'])
    assert.equal(profileNumericInput(raw, 0, 280, true), Number(raw));
  for (const raw of ['-1', '0', '1.5', '100000'])
    assert.ok(Number.isNaN(profileNumericInput(raw, 1, 99999, true)));
  assert.equal(profileNumericInput('99999', 1, 99999, true), 99999);
  assert.equal(profileNumericInput('0', 0, 0, true), 0);
  assert.ok(Number.isNaN(profileNumericInput('1', 0, 0, true)));
  for (const raw of ['0', '-1', '20.5', '21', '100'])
    assert.ok(Number.isNaN(profileNumericInput(raw, 1, 20, true)));
  assert.equal(profileNumericInput('20', 1, 20, true), 20);
});

const profile = {
  name: 'Input validation',
  mode: 'manual',
  board: false,
  points: [
    { second: 0, temperature: 50 },
    { second: 30, temperature: 100 },
  ],
  shelves: [
    { second: 30, temperature: 50 },
    { second: 30, temperature: 100 },
    { second: 0, temperature: 50 },
  ],
};
test('shared validation used by saving and imports enforces integers and at most 20 cycles', () => {
  validateProfile(profile);
  validateProfile({ ...profile, repeat: 20 });
  for (const repeat of [0, -1, 1.5, 21, 100, NaN, Infinity])
    assert.throws(() => validateProfile({ ...profile, repeat }));
  for (const temperature of [-200, 305, 30000, 50.5, NaN, Infinity]) {
    assert.throws(() =>
      validateProfile({ ...profile, points: [{ second: 0, temperature }] }),
    );
    assert.throws(() =>
      validateProfile({
        ...profile,
        shelves: profile.shelves.map((p, i) =>
          i === 0 ? { ...p, temperature } : p,
        ),
      }),
    );
  }
  for (const second of [-1, 0, 0.5, 100000])
    assert.throws(() =>
      validateProfile({
        ...profile,
        points: [profile.points[0], { second, temperature: 100 }],
      }),
    );
});
