import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  OvenConfiguration,
  OvenModel,
  OvenSelection,
} from '@mercury/shared';

const ovensDirectory = fileURLToPath(
  new URL('../../../packages/shared/ovens/', import.meta.url),
);
const defaultConfigPath = fileURLToPath(
  new URL('../../../config.json', import.meta.url),
);
const configPath = resolve(
  process.env.MERCURY_CONFIG_PATH ?? defaultConfigPath,
);

function isOutputMap(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const indexes = Object.values(value);
  return (
    indexes.length === 8 &&
    new Set(indexes).size === 8 &&
    indexes.every(
      (index) =>
        Number.isInteger(index) && Number(index) >= 0 && Number(index) <= 7,
    )
  );
}

function readOvenModels(): Map<OvenModel, OvenConfiguration> {
  const models = new Map<OvenModel, OvenConfiguration>();
  for (const name of readdirSync(ovensDirectory).filter((file) =>
    /^\d+\.json$/.test(file),
  )) {
    const parsed: unknown = JSON.parse(
      readFileSync(join(ovensDirectory, name), 'utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('model' in parsed) ||
      parsed.model !== name.slice(0, -5) ||
      !('name' in parsed) ||
      typeof parsed.name !== 'string' ||
      !('outputs' in parsed) ||
      typeof parsed.outputs !== 'object' ||
      parsed.outputs === null ||
      !('singlePhase' in parsed.outputs) ||
      !isOutputMap(parsed.outputs.singlePhase) ||
      !('threePhase' in parsed.outputs) ||
      !isOutputMap(parsed.outputs.threePhase)
    ) {
      throw new Error(`Некорректная конфигурация печи: ${name}`);
    }
    models.set(parsed.model as OvenModel, parsed as OvenConfiguration);
  }
  return models;
}

const ovenModels = readOvenModels();

export function listOvenModels(): { model: OvenModel; name: string }[] {
  return Array.from(ovenModels.values(), ({ model, name }) => ({
    model,
    name,
  }));
}

export function getOvenModel(model: OvenModel): OvenConfiguration | undefined {
  return ovenModels.get(model);
}

export function isOvenSelection(value: unknown): value is OvenSelection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ovenModel' in value &&
    typeof value.ovenModel === 'string' &&
    ovenModels.has(value.ovenModel as OvenModel) &&
    'connectionVoltage' in value &&
    (value.connectionVoltage === '230' || value.connectionVoltage === '380')
  );
}

function normalizeOvenSelection(value: unknown): OvenSelection | null {
  if (isOvenSelection(value))
    return {
      ovenModel: value.ovenModel,
      connectionVoltage: value.connectionVoltage,
    };
  if (
    typeof value !== 'object' ||
    value === null ||
    !('ovenModel' in value) ||
    typeof value.ovenModel !== 'string' ||
    !ovenModels.has(value.ovenModel as OvenModel) ||
    !('boardVersion' in value)
  )
    return null;
  const connectionVoltage =
    value.boardVersion === '220' || value.boardVersion === '230'
      ? '230'
      : value.boardVersion === '380'
        ? '380'
        : null;
  return connectionVoltage
    ? { ovenModel: value.ovenModel as OvenModel, connectionVoltage }
    : null;
}

export function readOvenSelection(): OvenSelection | null {
  if (!existsSync(configPath)) return null;
  const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  const selection = normalizeOvenSelection(parsed);
  if (!selection) {
    throw new Error(
      'В config.json выбрана неизвестная модель или схема подключения печи.',
    );
  }
  return selection;
}

export async function saveOvenSelection(
  value: unknown,
): Promise<OvenSelection> {
  if (!isOvenSelection(value)) {
    throw new Error('Выбери модель печи и подключение 230 или 380 В.');
  }
  const selected = {
    ovenModel: value.ovenModel,
    connectionVoltage: value.connectionVoltage,
  };
  const temporaryPath = join(
    dirname(configPath),
    `.${basename(configPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(selected, null, 2)}\n`,
      'utf8',
    );
    await rename(temporaryPath, configPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return selected;
}
