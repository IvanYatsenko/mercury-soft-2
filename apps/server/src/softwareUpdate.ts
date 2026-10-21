import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const currentVersion = JSON.parse(
  await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
).version as string;
const updateBase =
  process.env.MERCURY_UPDATE_URL ?? 'https://www.nsc-com.com/soft/mercury';
let state: {
  phase: string;
  currentVersion: string;
  version?: string;
  error?: string;
} = { phase: 'idle', currentVersion };
let release: { version: string; archive: string; sha256: string } | undefined;
let downloaded: string | undefined;
export function updateStatus() {
  if (state.phase === 'idle' || state.phase === 'installing') {
    try {
      const result = JSON.parse(
        readFileSync(
          join(homedir(), '.cache/mercury-update/install-result.json'),
          'utf8',
        ),
      );
      if (result.phase === 'error')
        state = { phase: 'error', currentVersion, error: String(result.error) };
    } catch {
      /* No completed installation result. */
    }
  }
  return state;
}
export function updateBusy() {
  return ['downloading', 'ready', 'installing'].includes(state.phase);
}
export function newerVersion(next: string, current: string) {
  const a = next.split('.').map(Number),
    b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}
export function validateRelease(
  value: unknown,
): asserts value is { version: string; archive: string; sha256: string } {
  const r = value as Record<string, unknown>;
  if (
    !r ||
    typeof r.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(r.version) ||
    r.archive !== `${r.version}_linux-arm64-unpacked.tar.gz` ||
    typeof r.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(r.sha256)
  )
    throw new Error('Неверный манифест обновления.');
}
export async function checkSoftwareUpdate() {
  if (updateBusy() || state.phase === 'checking')
    throw new Error('Обновление уже выполняется.');
  state = { phase: 'checking', currentVersion };
  try {
    const url = new URL(updateBase + '/manifest.json');
    if (url.protocol !== 'https:')
      throw new Error('Сервер обновлений должен использовать HTTPS.');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Сервер обновлений: ${response.status}`);
    const text = await response.text();
    if (text.length > 16384) throw new Error('Слишком большой манифест.');
    const value: unknown = JSON.parse(text);
    validateRelease(value);
    release = value;
    state = {
      phase: newerVersion(value.version, currentVersion)
        ? 'available'
        : 'current',
      currentVersion,
      version: value.version,
    };
  } catch (error) {
    state = { phase: 'error', currentVersion, error: String(error) };
  }
  return state;
}
export async function downloadSoftwareUpdate() {
  if (state.phase !== 'available' || !release)
    throw new Error('Сначала проверь обновления.');
  if (process.platform !== 'linux' || process.arch !== 'arm64')
    throw new Error('Установка предназначена для Raspberry ARM64.');
  state = { phase: 'downloading', currentVersion, version: release.version };
  const selected = release;
  void (async () => {
    try {
      const directory = join(homedir(), '.cache/mercury-update');
      await mkdir(directory, { recursive: true });
      const response = await fetch(
        new URL(selected.archive, updateBase + '/'),
        { signal: AbortSignal.timeout(15 * 60_000) },
      );
      if (!response.ok || !response.body)
        throw new Error('Не удалось скачать обновление.');
      const file = await open(join(directory, selected.archive), 'w', 0o600);
      const hash = createHash('sha256');
      let bytes = 0;
      try {
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > 1024 ** 3) throw new Error('Превышен размер пакета.');
          hash.update(chunk);
          await file.writeFile(chunk);
        }
        await file.sync();
      } finally {
        await file.close();
      }
      if (hash.digest('hex') !== selected.sha256)
        throw new Error('Контрольная сумма не совпала.');
      downloaded = join(directory, selected.archive);
      await writeFile(downloaded + '.sha256', selected.sha256, { mode: 0o600 });
      state = { phase: 'ready', currentVersion, version: selected.version };
    } catch (error) {
      state = { phase: 'error', currentVersion, error: String(error) };
    }
  })();
  return state;
}
export async function installSoftwareUpdate() {
  if (state.phase !== 'ready' || !downloaded)
    throw new Error('Пакет ещё не готов.');
  const installer = fileURLToPath(
    new URL('../../../release/install-update.py', import.meta.url),
  );
  try {
    await writeFile(
      join(homedir(), '.cache/mercury-update/install-result.json'),
      JSON.stringify({ phase: 'installing' }),
      { mode: 0o600 },
    );
    state = { ...state, phase: 'installing' };
    await execute(
      'sudo',
      [
        '-n',
        'systemd-run',
        '--collect',
        '--unit=mercury-software-update',
        '--property=StandardOutput=null',
        '--property=StandardError=null',
        '/usr/bin/python3',
        installer,
        downloaded,
      ],
      { timeout: 10000 },
    );
  } catch (error) {
    state = { ...state, phase: 'error', error: String(error) };
  }
  return state;
}
