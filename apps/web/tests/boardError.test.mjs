import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criticalBoardState,
  criticalBoardError,
  userError,
} from '../src/boardError.ts';
test('board faults become a critical error, including combined and wrapped states', () => {
  for (const state of [2, 3, 4, 5, 8, 9, 64, 65, 128, 129, 193]) {
    assert.equal(criticalBoardState(state), true);
    for (const message of [
      `Ошибка платы: ${state}`,
      `Error: Error: Ошибка или отключение платы (${state}).`,
    ]) {
      assert.equal(criticalBoardError(message), true);
      assert.equal(userError(message), 'Критическая ошибка');
    }
  }
});
test('normal states, shutdown, connection and temperature errors keep their own meaning', () => {
  for (const state of [
    undefined,
    0,
    1,
    16,
    17,
    32,
    33,
    256,
    257,
    1024,
    NaN,
    -1,
  ])
    assert.equal(criticalBoardState(state), false);
  for (const message of [
    'Ошибка платы: 33',
    '504 timeout',
    'Ошибка или отключение платы (нет состояния).',
    'Ошибка датчика или перегрев.',
    'Дверь открыта — нагрев выключен',
  ]) {
    assert.equal(criticalBoardError(message), false);
    assert.equal(userError(message), message);
  }
});
