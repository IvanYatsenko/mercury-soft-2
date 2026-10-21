import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  OvenConfiguration,
  OvenModel,
  OvenSelection,
  TemperatureRate,
} from '@mercury/shared';
import {
  defaultThermalSettings,
  validateThermalSettings,
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

export function listOvenModels(): {
  model: OvenModel;
  name: string;
  heatingRate: TemperatureRate;
  coolingRate: TemperatureRate;
}[] {
  return Array.from(ovenModels.values(), (model) => ({
    model: model.model,
    name: model.name,
    ...getProfileRates(model),
  }));
}

export function getProfileRates(model: OvenConfiguration): {
  heatingRate: TemperatureRate;
  coolingRate: TemperatureRate;
} {
  const response = getMeasuredResponse(model);
  const bands = response?.temperatureBands;
  const coolingBands = response?.coolingPlanning?.temperatureBands ?? bands;
  return {
    heatingRate:
      bands && readThermalSettings().mode === 'combined'
        ? { fallback: model.specifications.maximumHeatingRateCPerSecond, bands }
        : model.specifications.maximumHeatingRateCPerSecond,
    coolingRate: coolingBands
      ? {
          fallback: model.specifications.maximumCoolingRateCPerSecond,
          bands: coolingBands,
        }
      : model.specifications.maximumCoolingRateCPerSecond,
  };
}

export function getMeasuredResponse(model: OvenConfiguration) {
  const voltage = readOvenSelection()?.connectionVoltage;
  if (!voltage) return undefined;
  const response = model.measuredResponses?.[voltage] ?? model.measuredResponse;
  return response?.connectionVoltage === voltage ? response : undefined;
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
  const firstSetup = !existsSync(configPath);
  await updateConfig({
    ...selected,
    ...(firstSetup
      ? {
          keepHeatEnabled: false,
          thermalControlModel: selected.ovenModel,
          thermalControl: { ...defaultThermalSettings, mode: 'combined' },
        }
      : {}),
  });
  return selected;
}

let pendingConfigWrite: Promise<void> = Promise.resolve();
export async function flushConfigWrites() {
  await pendingConfigWrite;
}
export function readThermalSettings() {
  const parsed = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, 'utf8'))
    : {};
  const saved =
    parsed.thermalControlModel === readOvenSelection()?.ovenModel
      ? parsed.thermalControl
      : undefined;
  return validateThermalSettings({
    ...(saved ?? defaultThermalSettings),
    auxiliaryPowerW: 0,
    powersW: {
      ...defaultThermalSettings.powersW,
      ...getOvenModel(readOvenSelection()?.ovenModel ?? '300')?.heatingLoads,
    },
  });
}
export async function saveThermalSettings(value: unknown) {
  const settings = validateThermalSettings(value);
  await updateConfig({
    thermalControl: settings,
    thermalLoadPowersW: settings.powersW,
    thermalControlModel: readOvenSelection()?.ovenModel,
  });
  return settings;
}

export function readKeepHeatEnabled(): boolean {
  if (!existsSync(configPath)) return false;
  return JSON.parse(readFileSync(configPath, 'utf8')).keepHeatEnabled === true;
}
export async function saveKeepHeatEnabled(enabled: unknown): Promise<boolean> {
  if (typeof enabled !== 'boolean')
    throw new Error('Ожидается включено/выключено.');
  await updateConfig({ keepHeatEnabled: enabled });
  return enabled;
}
function updateConfig(patch: Record<string, unknown>): Promise<void> {
  const operation = pendingConfigWrite.then(async () => {
    const current = existsSync(configPath)
      ? JSON.parse(readFileSync(configPath, 'utf8'))
      : {};
    const temporaryPath = join(
      dirname(configPath),
      '.' + basename(configPath) + '.' + randomUUID() + '.tmp',
    );
    try {
      await writeFile(
        temporaryPath,
        JSON.stringify({ ...current, ...patch }, null, 2) + '\n',
        'utf8',
      );
      await rename(temporaryPath, configPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  });
  pendingConfigWrite = operation.catch(() => {});
  return operation;
}

export function readFanReferenceHz(): number {
  if (!existsSync(configPath)) return 50;
  const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  const value = parsed.fanReferenceHz ?? parsed.fanTarget;
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 1000
    ? value
    : 50;
}

export async function saveFanReferenceHz(value: unknown): Promise<number> {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 1 ||
    value > 1000
  ) {
    throw new Error('Эталонная частота должна быть от 1 до 1000 Гц.');
  }
  await updateConfig({ fanReferenceHz: value });
  return value;
}
