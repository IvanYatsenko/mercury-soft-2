import test from 'node:test';
import assert from 'node:assert/strict';
import { isPcLayout } from '../src/clientLayout.ts';

test('wide desktop browsers use PC layout; narrow screens keep compact layout', () => {
  for (const agent of [
    'Mozilla/5.0 Chrome/130.0',
    'Mozilla/5.0 Firefox/131.0',
    'Mozilla/5.0 Version/18 Safari/605.1',
  ]) {
    assert.equal(isPcLayout(agent, true), true);
    assert.equal(isPcLayout(agent, false), false);
  }
});

test('Electron never opts into PC layout, even in a large development window', () => {
  for (const wide of [true, false])
    assert.equal(
      isPcLayout('Mozilla/5.0 Chrome/130 Electron/37.0.0 Safari/537.36', wide),
      false,
    );
});
