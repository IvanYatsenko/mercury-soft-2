import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ovenModelNumber,
  ovenModelName,
  supportsConnection,
} from '@mercury/shared';

const dir = await mkdtemp(join(tmpdir(), 'mercury-model-'));
process.env.MERCURY_CONFIG_PATH = join(dir, 'config.json');
await writeFile(
  process.env.MERCURY_CONFIG_PATH,
  JSON.stringify({
    ovenModel: '300',
    connectionVoltage: '230',
    keepHeatEnabled: false,
    untouched: 'preserve',
  }),
);
const settings = await import('../dist/ovenSettings.js');
const identity = await import('../dist/controller/boardIdentity.js');
const { calibrationKey } = await import('../dist/temperatureCalibration.js');

test('two families and detected board produce exactly six supported model/voltage combinations', () => {
  const combinations = [];
  for (const family of ['300', '400']) {
    for (const board of ['220V', '230V']) {
      for (const voltage of ['230', '380']) {
        if (supportsConnection(board, voltage))
          combinations.push(`${ovenModelNumber(family, board)}/${voltage}`);
      }
    }
  }
  assert.deepEqual(combinations, [
    '300/230',
    '301/230',
    '301/380',
    '400/230',
    '401/230',
    '401/380',
  ]);
  assert.equal(ovenModelNumber('300', '380V'), '301');
  assert.equal(ovenModelNumber('400', '380V'), '401');
  assert.match(ovenModelName('300', 'unknown'), /серия 300/);
});

test('naming preserves measured new-board data, rejects legacy 380 and isolates legacy calibration', async () => {
  const before = JSON.parse(
    await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'),
  );
  identity.rememberBoardType('230V');
  assert.equal(
    settings.listOvenModels().find((m) => m.model === '300').name,
    'Меркурий-301',
  );
  const modern = settings.getMeasuredResponse(settings.getOvenModel('300'));
  assert.ok(modern);
  assert.equal(calibrationKey(), '300-230');
  identity.rememberBoardType('220V');
  assert.equal(
    settings.listOvenModels().find((m) => m.model === '300').name,
    'Меркурий-300',
  );
  await assert.rejects(
    settings.saveOvenSelection({ ovenModel: '300', connectionVoltage: '380' }),
    /только 220/,
  );
  assert.equal(
    settings.getMeasuredResponse(settings.getOvenModel('300')),
    undefined,
  );
  assert.equal(calibrationKey(), '300-230-legacy');
  assert.deepEqual(
    JSON.parse(await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8')),
    before,
  );
  identity.rememberBoardType('380V');
  assert.equal(
    settings.getMeasuredResponse(settings.getOvenModel('300')).runId,
    modern.runId,
  );
  assert.equal(calibrationKey(), '300-230');
  identity.rememberBoardType('unknown');
  assert.equal(identity.detectedBoardType(), '380V');
});

test.after(async () => {
  await rm(dir, { recursive: true, force: true });
});
