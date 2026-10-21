import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateProfile,
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
export function listProfiles(): Profile[] {
  return db
    .prepare('SELECT body FROM profiles ORDER BY rowid')
    .all()
    .map((row) => JSON.parse(String(row.body)) as Profile);
}
export function findProfile(id: string): Profile {
  const row = db.prepare('SELECT body FROM profiles WHERE id=?').get(id);
  if (!row) throw new Error('Профиль не найден.');
  return JSON.parse(String(row.body));
}
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
export function deleteProfile(id: string) {
  findProfile(id);
  db.prepare('DELETE FROM profiles WHERE id=?').run(id);
}
export function getMetadata(key: string) {
  return db.prepare('SELECT value FROM metadata WHERE key=?').get(key)
    ?.value as string | undefined;
}
export function setMetadata(key: string, value: string) {
  db.prepare(
    'INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).run(key, value);
}
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
export function addRunSample(id: string, sample: RunSample) {
  historyDb
    .prepare('INSERT OR REPLACE INTO samples VALUES(?,?,?)')
    .run(id, sample.elapsedSeconds, JSON.stringify(sample));
}
export function addRunEvent(id: string, message: string) {
  historyDb
    .prepare('INSERT INTO events(run_id,at,message) VALUES(?,?,?)')
    .run(id, new Date().toISOString(), message);
}
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
export async function listStoredRuns(): Promise<RunRecord[]> {
  return listRuns();
}
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
export async function checkpointDatabase() {
  db.exec('PRAGMA wal_checkpoint(FULL)');
  await historyDb.flush();
}
