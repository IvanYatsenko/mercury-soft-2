/**
 * Проверка, загрузка и установка универсального обновления с контрольной суммой; пользовательские данные вне пакета.
 */
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
/**
 * Возвращает этап обновления для опроса интерфейсом; установка запускается отдельной командой.
 */
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
/**
 * Проверяет, выполняется ли уже операция обновления, чтобы исключить параллельную установку.
 */
export function updateBusy() {
  return ['downloading', 'installing'].includes(state.phase);
}
/** Блокирует изменения со всех клиентов, оставляя чтение статуса и команды установщика доступными. */
export function updateBlocksRequest(
  method: string,
  path: string,
  phase = state.phase,
) {
  return (
    ['downloading', 'installing'].includes(phase) &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    !/^\/api\/software-update(?:\/|$)/i.test(path)
  );
}
/**
 * Сравнивает числовые части версии, а не лексикографический порядок строк.
 */
export function newerVersion(next: string, current: string) {
  const a = next.split('.').map(Number),
    b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}
/**
 * Проверяет версию, имя архива и формат SHA-256; размер загрузки ограничивается отдельно.
 */
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
/**
 * Запрашивает описание выпуска с сервера обновлений; не устанавливает пакет.
 */
export async function checkSoftwareUpdate() {
  if (updateBusy() || state.phase === 'checking' || state.phase === 'ready')
    throw new Error('Обновление уже выполняется.');
  state = { phase: 'checking', currentVersion };
  try {
    const url = new URL(updateBase + '/manifest.json');
    if (url.protocol !== 'https:')
      throw new Error('Сервер обновлений должен использовать HTTPS.');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Сервер обновлений: ${response.status}`);
    const text = await readManifest(response);
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
/** Ограничивает манифест 16 КиБ до накопления тела в памяти, включая chunked-ответы. */
async function readManifest(response: Response) {
  if (!response.body) throw new Error('Пустой манифест обновления.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16384) {
        await reader.cancel();
        throw new Error('Слишком большой манифест.');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}
/**
 * Потоково загружает архив с проверкой размера и SHA-256 перед допуском к установке.
 */
export async function downloadSoftwareUpdate(confirmation?: {
  confirmed?: unknown;
  version?: unknown;
}) {
  if (state.phase !== 'available' || !release)
    throw new Error('Сначала проверь обновления.');
  if (
    confirmation?.confirmed !== true ||
    confirmation.version !== release.version
  )
    throw new Error('Подтвердите загрузку выбранной версии обновления.');
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
/**
 * Передаёт проверенный пакет установщику только при допустимом состоянии печи.
 */
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
