import test from 'node:test';
import assert from 'node:assert/strict';
import { installClientAccess } from '../src/clientAccess.ts';
test('each page has its own identity; fetch preserves headers and never sends identity to another oven', async () => {
  const previousWindow = globalThis.window,
    previousLocation = globalThis.location;
  const calls = [];
  const fetcher = async (input, options) => {
    calls.push({ input, options });
    return new Response('{}');
  };
  try {
    globalThis.location = {
      href: 'http://oven:3001/',
      origin: 'http://oven:3001',
    };
    globalThis.window = { fetch: fetcher };
    installClientAccess();
    const a = window.fetch;
    await a('/api/settings-access', { headers: { 'X-Test': 'yes' } });
    const idA = calls.at(-1).options.headers.get('X-Mercury-Client');
    assert.match(idA, /^[a-f0-9]{64}$/);
    assert.equal(calls.at(-1).options.headers.get('X-Test'), 'yes');
    await a('/api/config');
    assert.equal(calls.at(-1).options.headers.get('X-Mercury-Client'), idA);
    globalThis.window = { fetch: fetcher };
    installClientAccess();
    await window.fetch('/api/settings-access');
    assert.notEqual(calls.at(-1).options.headers.get('X-Mercury-Client'), idA);
    await a('http://other-oven:3001/api/settings-access');
    assert.equal(calls.at(-1).options, undefined);
  } finally {
    globalThis.window = previousWindow;
    globalThis.location = previousLocation;
  }
});

test('desktop retains its session across reloads without storing PIN, and separate browsers stay isolated', async () => {
  const oldWindow = globalThis.window, oldLocation = globalThis.location;
  const calls = [];
  const storage = new Map();
  const createWindow = (values) => ({
    matchMedia: () => ({ matches: true }),
    localStorage: { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) },
    fetch: async (_input, options) => { calls.push(options.headers.get('X-Mercury-Client')); return new Response('{}'); },
  });
  try {
    globalThis.location = { href: 'http://oven:8075/', origin: 'http://oven:8075' };
    globalThis.window = createWindow(storage);
    installClientAccess(); await window.fetch('/api/settings-access');
    const first = calls.at(-1);
    globalThis.window = createWindow(storage);
    installClientAccess(); await window.fetch('/api/settings-access');
    assert.equal(calls.at(-1), first);
    assert.deepEqual([...storage.keys()], ['mercury.desktop.client']);
    globalThis.window = createWindow(new Map());
    installClientAccess(); await window.fetch('/api/settings-access');
    assert.notEqual(calls.at(-1), first);
  } finally { globalThis.window = oldWindow; globalThis.location = oldLocation; }
});

test('Electron never persists its access identity even on a wide screen', () => {
  const oldWindow=globalThis.window;
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  let writes=0;
  try {
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Electron/42.0.0'}});
    globalThis.window={ fetch:async()=>new Response('{}'), matchMedia:()=>({matches:true}),
      localStorage:{getItem:()=>{writes++;return null;},setItem:()=>{writes++;}} };
    installClientAccess();
    assert.equal(writes,0);
  } finally {
    globalThis.window=oldWindow;
    if(descriptor) Object.defineProperty(globalThis,'navigator',descriptor);
    else delete globalThis.navigator;
  }
});
