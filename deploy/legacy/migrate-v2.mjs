import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { loadEnvFile } from 'node:process';
loadEnvFile(new URL('../.env', import.meta.url));
const oldRoot = join(homedir(), '.config/mercury-soft-2');
const configPath = process.env.MERCURY_CONFIG_PATH;
await mkdir(dirname(configPath), { recursive: true });
// Do not ship or infer a device configuration. First launch opens model/mains setup.
const db = await import('../apps/server/dist/database.js');
const { validateProfile } = await import('../packages/shared/dist/index.js');
if (!db.getMetadata('legacy-v2-imported')) {
  const current = JSON.parse(
    await readFile(join(oldRoot, 'currentProfile'), 'utf8').catch(() => '{}'),
  );
  const selected = basename(current.currentProfile ?? '');
  for (const file of await readdir(join(oldRoot, 'profiles'))) {
    const old = JSON.parse(
      await readFile(join(oldRoot, 'profiles', file), 'utf8'),
    );
    validateProfile(old);
    const existing = db.listProfiles().find((p) => p.name === old.name.trim());
    const saved = db.saveProfile(old, existing?.id);
    if (file === selected) db.setMetadata('selected-profile', saved.id);
  }
  db.setMetadata('legacy-v2-imported', '1');
  db.checkpointDatabase();
}
process.exit(0);
