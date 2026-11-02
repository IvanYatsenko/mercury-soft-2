import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSignal } from '../src/requestSignal.ts';
test('requests work without AbortSignal.any and AbortSignal.timeout, as in older Safari', async () => {
  const any = Object.getOwnPropertyDescriptor(AbortSignal, 'any'),
    timeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  Object.defineProperty(AbortSignal, 'any', {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(AbortSignal, 'timeout', {
    value: undefined,
    configurable: true,
  });
  try {
    const signal = requestSignal(15);
    assert.equal(signal.aborted, false);
    await new Promise((r) =>
      signal.addEventListener('abort', r, { once: true }),
    );
    assert.equal(signal.aborted, true);
  } finally {
    if (any) Object.defineProperty(AbortSignal, 'any', any);
    if (timeout) Object.defineProperty(AbortSignal, 'timeout', timeout);
  }
});
test('navigation aborts immediately and timeout detaches its parent listener', async () => {
  const parent = new AbortController();
  let adds = 0,
    removes = 0;
  const add = parent.signal.addEventListener.bind(parent.signal),
    remove = parent.signal.removeEventListener.bind(parent.signal);
  parent.signal.addEventListener = (...args) => {
    adds++;
    return add(...args);
  };
  parent.signal.removeEventListener = (...args) => {
    removes++;
    return remove(...args);
  };
  const child = requestSignal(15, parent.signal);
  await new Promise((r) => child.addEventListener('abort', r, { once: true }));
  assert.equal(adds, 1);
  assert.equal(removes, 1);
  const nextParent = new AbortController();
  const next = requestSignal(5000, nextParent.signal);
  nextParent.abort();
  assert.equal(next.aborted, true);
  assert.equal(requestSignal(5000, nextParent.signal).aborted, true);
});
