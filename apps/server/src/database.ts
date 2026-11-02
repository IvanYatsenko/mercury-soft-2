/**
 * SQLite-библиотека профилей и метаданных на Raspberry; история делегируется отдельному USB-worker без резервного накопления.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateProfile,
  portableProfile,
  uniqueProfileName,
  type Profile,
  type RunRecord,
  type RunSample,
  type ProfilePlan,
} from '@mercury/shared';
import { profileTemplates } from './profileTemplates.js';
import { IsolatedHistoryStorage } from './isolatedHistoryStorage.js';
import { startUsbRetention } from './usbRetention.js';

const path = resolve(
  process.env.MERCURY_DATABASE_PATH ??
    fileURLToPath(new URL('../../../data/mercury.sqlite', import.meta.url)),
);
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
PRAGMA user_version=1;`);

/**
 * Выполняет изменение библиотеки атомарно; при исключении откатывает все SQL-операции перед повторным выбросом ошибки.
 */
function transaction<T>(work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
/**
 * Возвращает сохранённые профили в порядке добавления; историю запусков эта база не содержит.
 */
export function listProfiles(): Profile[] {
  return db
    .prepare('SELECT body FROM profiles ORDER BY rowid')
    .all()
    .map((row) => JSON.parse(String(row.body)) as Profile);
}
/**
 * Загружает профиль по идентификатору; отсутствие записи считается ошибкой, а не выбором профиля по умолчанию.
 */
export function findProfile(id: string): Profile {
  const row = db.prepare('SELECT body FROM profiles WHERE id=?').get(id);
  if (!row) throw new Error('Профиль не найден.');
  return JSON.parse(String(row.body));
}
/**
 * Проверяет профиль и уникальность имени, затем сохраняет новую запись или заменяет существующую по id.
 */
export function saveProfile(value: unknown, id?: string): Profile {
  validateProfile(value);
  if (id) findProfile(id);
  const profile = { ...value, name: value.name.trim(), id: id ?? randomUUID() };
  try {
    db.prepare(
      'INSERT INTO profiles(id,name,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,body=excluded.body',
    ).run(profile.id, profile.name, JSON.stringify(profile));
  } catch (error) {
    if (String(error).includes('UNIQUE'))
      throw new Error('Профиль с таким названием уже существует.');
    throw error;
  }
  return profile;
}
/**
 * Удаляет только запись библиотеки профилей; ранее записанные запуски и их снимки профиля не изменяются.
 */
export function deleteProfile(id: string) {
  findProfile(id);
  db.prepare('DELETE FROM profiles WHERE id=?').run(id);
}
/**
 * Читает служебное значение библиотеки, например выбор профиля; отсутствие ключа возвращает undefined.
 */
export function getMetadata(key: string) {
  return db.prepare('SELECT value FROM metadata WHERE key=?').get(key)
    ?.value as string | undefined;
}
/**
 * Создаёт или заменяет служебный ключ без изменения тел профилей.
 */
export function setMetadata(key: string, value: string) {
  db.prepare(
    'INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).run(key, value);
}
/**
 * Однократно переносит браузерную библиотеку в SQLite; валидация и запись выполняются для всего набора совместно.
 */
export function importProfiles(values: unknown): Profile[] {
  if (getMetadata('browser-imported')) return listProfiles();
  if (!Array.isArray(values) || values.length > 200)
    throw new Error('Некорректный список профилей.');
  values.forEach((value) => validateProfile(value));
  transaction(() => {
    for (const value of values as Profile[]) {
      const existing = db
        .prepare('SELECT id FROM profiles WHERE name=?')
        .get(value.name.trim());
      saveProfile(value, existing ? String(existing.id) : undefined);
    }
    setMetadata('browser-imported', '1');
  });
  return listProfiles();
}
if (!getMetadata('seeded'))
  transaction(() => {
    profileTemplates.forEach((profile) => saveProfile(profile));
    setMetadata('seeded', '1');
  });
let historyDb = new IsolatedHistoryStorage();
// Tests inject a disposable SQL backend; the production backend has no cache.
/**
 * Подменяет USB-хранилище только в симуляции NODE_ENV=test; производственное приложение не получает путь к тестовой истории.
 */
export function setTestHistoryStorage(storage: IsolatedHistoryStorage) {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.MERCURY_CONTROLLER_MODE !== 'simulation'
  )
    throw new Error('Test storage is unavailable outside simulated tests');
  historyDb.close();
  historyDb = storage;
}
// A process restart never resumes heaters automatically.
historyDb
  .prepare(
    "UPDATE runs SET state='failed',finished_at=?,error='Приложение перезапущено во время выполнения' WHERE finished_at IS NULL",
  )
  .run(new Date().toISOString());
startUsbRetention({
  pauseDiskForMaintenance: () => historyDb.pauseWorkerForMaintenance(),
  resumeDiskAfterMaintenance: () => historyDb.resumeWorkerAfterMaintenance(),
});

/**
 * Создаёт идентификатор запуска и отправляет его снимок в USB-worker. Недоступный USB не блокирует управление и не создаёт историю в RAM.
 */
export function createRun(
  profile: Profile,
  simulated: boolean,
  plan?: ProfilePlan,
): string {
  const id = randomUUID();
  historyDb
    .prepare("INSERT INTO runs VALUES(?,?,?,?,NULL,'running',NULL,?)")
    .run(
      id,
      profile.name,
      JSON.stringify({ ...profile, ...(plan ? { executionPlan: plan } : {}) }),
      new Date().toISOString(),
      Number(simulated),
    );
  addRunEvent(id, 'Запуск профиля');
  return id;
}
/**
 * Отправляет одну точную температурную выборку в USB-worker без ожидания файлового ввода-вывода на потоке управления.
 */
export function addRunSample(id: string, sample: RunSample) {
  historyDb
    .prepare('INSERT OR REPLACE INTO samples VALUES(?,?,?)')
    .run(id, sample.elapsedSeconds, JSON.stringify(sample));
}
/**
 * Записывает текст события конкретного запуска; сбои USB не должны прерывать регулирование.
 */
export function addRunEvent(id: string, message: string) {
  historyDb
    .prepare('INSERT INTO events(run_id,at,message) VALUES(?,?,?)')
    .run(id, new Date().toISOString(), message);
}
/**
 * Помечает результат запуска и время завершения; это не команда управления нагревом.
 */
export function finishRun(id: string, state: string, error: string | null) {
  historyDb
    .prepare('UPDATE runs SET finished_at=?,state=?,error=? WHERE id=?')
    .run(new Date().toISOString(), state, error, id);
  addRunEvent(
    id,
    error ??
      { completed: 'Завершено', stopped: 'Остановлено', failed: 'Ошибка' }[
        state
      ] ??
      state,
  );
}
/**
 * Асинхронно читает доступные USB-записи и преобразует SQL-поля в публичный формат истории.
 */
export async function listRuns(): Promise<RunRecord[]> {
  return (
    (await historyDb.storedQuery(
      'SELECT * FROM runs ORDER BY started_at DESC LIMIT 100',
    )) ?? []
  ).map((row) => ({
    id: String(row.id),
    profileName: String(row.profile_name),
    startedAt: String(row.started_at),
    finishedAt: row.finished_at == null ? null : String(row.finished_at),
    state: row.state as RunRecord['state'],
    error: row.error == null ? null : String(row.error),
    simulated: Boolean(row.simulated),
  }));
}
/**
 * Читает запись запуска и связанные измерения; возвращает данные только доступного USB, без восстановления пропущенных выборок.
 */
export async function runDetails(id: string) {
  const row = (
    await historyDb.storedQuery('SELECT * FROM runs WHERE id=?', [id])
  )?.[0];
  if (!row) throw new Error('Запуск не найден.');
  return {
    profile: JSON.parse(String(row.profile)),
    plan: JSON.parse(String(row.profile)).executionPlan ?? null,
    samples: (
      (await historyDb.storedQuery(
        'SELECT body FROM samples WHERE run_id=? ORDER BY second',
        [id],
      )) ?? []
    ).map((item) => JSON.parse(String(item.body)) as RunSample),
    events:
      (await historyDb.storedQuery(
        'SELECT at,message FROM events WHERE run_id=? ORDER BY id',
        [id],
      )) ?? [],
  };
}
// Historical USB queries are asynchronous too: opening the history page must
// never put a disk read onto the temperature-control thread.
/**
 * Публичная асинхронная точка чтения списка истории, чтобы HTTP-обработчик не работал с SQLite напрямую.
 */
export async function listStoredRuns(): Promise<RunRecord[]> {
  return listRuns();
}
/**
 * Ожидает подтверждение удаления запусков, измерений и событий USB-worker; неуспех должен дойти до вызывающего кода.
 */
export async function clearStoredRuns() {
  await historyDb.clearRuns();
}
/**
 * Загружает историю выбранного запуска для графика; отсутствующая запись или USB приводят к явной ошибке.
 */
export async function storedRunDetails(id: string) {
  const rows = await historyDb.storedQuery('SELECT * FROM runs WHERE id=?', [
    id,
  ]);
  const row = rows?.[0];
  if (!row) throw new Error('Запуск не найден или USB недоступен.');
  const samples = await historyDb.storedQuery(
    'SELECT body FROM samples WHERE run_id=? ORDER BY second',
    [id],
  );
  const events = await historyDb.storedQuery(
    'SELECT at,message FROM events WHERE run_id=? ORDER BY id',
    [id],
  );
  if (!samples || !events) throw new Error('USB недоступен.');
  const profile = JSON.parse(String(row.profile));
  return {
    profile,
    plan: profile.executionPlan ?? null,
    samples: samples.map((item) => JSON.parse(String(item.body)) as RunSample),
    events,
  };
}
/**
 * Сбрасывает WAL библиотеки и подтверждает предшествующие записи USB перед завершением приложения.
 */
export async function checkpointDatabase() {
  db.exec('PRAGMA wal_checkpoint(FULL)');
  await historyDb.flush();
}

/** Explicit UI/file import: always new copies, never legacy migration or overwrite. */
export function importProfileCopies(values: Profile[]): Profile[] {
  values.forEach((value) => validateProfile(value));
  return transaction(() => {
    const names = listProfiles().map((p) => p.name);
    return values.map((value) => {
      const name = uniqueProfileName(value.name, names);
      names.push(name);
      return saveProfile({ ...portableProfile(value), name });
    });
  });
}
