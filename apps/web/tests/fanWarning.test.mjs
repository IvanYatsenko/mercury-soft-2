import test from 'node:test';
import assert from 'node:assert/strict';
import { fanWarning } from '../src/fanWarning.ts';

test('fan warning thresholds use the fraction remaining, without rounding across boundaries', () => {
  assert.equal(fanWarning(25, 50, true, true), null);
  assert.equal(fanWarning(24.99, 50, true, true).blink, false);
  assert.equal(fanWarning(10, 50, true, true).blink, false);
  assert.equal(fanWarning(9.99, 50, true, true).blink, true);
  assert.equal(fanWarning(0, 50, true, true).blink, true);
  assert.equal(fanWarning(19, 100, true, true).blink, true);
  assert.match(fanWarning(24, 50, true, true).message, /неточно/);
});

test('disabled warnings and an intentionally stopped fan do not alert', () => {
  assert.equal(fanWarning(0, 50, false, true), null);
  assert.equal(fanWarning(0, 50, true, false), null);
  assert.equal(fanWarning(0, 0, true, true), null);
});

test('missing frequency is shown as unknown rather than a measured speed below 20 percent', () => {
  for (const value of [null, undefined, NaN, -1]) {
    const warning = fanWarning(value, 50, true, true);
    assert.equal(warning.blink, false);
    assert.match(warning.message, /Нет данных/);
  }
});
