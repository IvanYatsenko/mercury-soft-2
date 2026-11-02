import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Run the real component's effects against a small browser/React host, without a live oven.
const source = ts.transpileModule(
  readFileSync(
    new URL('../src/SoftwareUpdateLock.tsx', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function host() {
  let state = null,
    mounted = false,
    cleanup;
  let reloads = 0;
  const requests = [],
    timers = new Map();
  let timerId = 0;
  const window = new EventTarget();
  window.location = { reload: () => reloads++ };
  const modules = {
    react: {
      useState: () => [
        state,
        (value) => {
          state = value;
        },
      ],
      useEffect: (effect) => {
        if (!mounted) cleanup = effect();
      },
    },
    '@mui/material': Object.fromEntries(
      [
        'CircularProgress',
        'Dialog',
        'DialogContent',
        'DialogTitle',
        'Stack',
        'Typography',
      ].map((k) => [k, k]),
    ),
    'react/jsx-runtime': {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    './requestSignal': { requestSignal: (_timeout, parent) => parent },
  };
  const exports = {};
  new Function(
    'require',
    'exports',
    'window',
    'fetch',
    'setTimeout',
    'clearTimeout',
    source,
  )(
    (name) => {
      assert.ok(modules[name], name);
      return modules[name];
    },
    exports,
    window,
    () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    (callback) => {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    (id) => timers.delete(id),
  );
  return {
    render() {
      const node = exports.SoftwareUpdateLock();
      mounted = true;
      return node;
    },
    event(phase) {
      const event = new Event('mercury:software-update');
      event.detail = { phase, version: '9.0.0' };
      window.dispatchEvent(event);
    },
    async response(phase) {
      assert.ok(requests.length);
      requests
        .shift()
        .resolve({ ok: true, json: async () => ({ phase, version: '9.0.0' }) });
      await new Promise((r) => setImmediate(r));
    },
    async offline() {
      requests.shift().reject(new Error('Offline'));
      await new Promise((r) => setImmediate(r));
    },
    nextPoll() {
      const [id, callback] = timers.entries().next().value;
      timers.delete(id);
      callback();
    },
    close() {
      cleanup?.();
    },
    get reloads() {
      return reloads;
    },
  };
}

test('all mounted clients lock on server download, remain locked offline and unlock on completion or error', async () => {
  const client = host();
  try {
    assert.equal(client.render().props.open, false);
    await client.response('downloading');
    assert.equal(client.render().props.open, true);
    assert.equal(client.render().props.disableEscapeKeyDown, true);
    client.nextPoll();
    await client.offline();
    assert.equal(client.render().props.open, true);
    client.nextPoll();
    await client.response('ready');
    assert.equal(client.render().props.open, false);
    client.nextPoll();
    await client.response('installing');
    assert.equal(client.render().props.open, true);
    client.nextPoll();
    await client.response('error');
    assert.equal(client.render().props.open, false);
  } finally {
    client.close();
  }
});

test('initiator locks immediately and an older in-flight response cannot unlock it; install restart reloads UI', async () => {
  const client = host();
  try {
    client.render();
    client.event('downloading');
    assert.equal(client.render().props.open, true);
    await client.response('available');
    assert.equal(client.render().props.open, true);
    client.nextPoll();
    await client.response('installing');
    client.nextPoll();
    await client.response('idle');
    assert.equal(client.reloads, 1);
    assert.equal(client.render().props.open, false);
  } finally {
    client.close();
  }
});
