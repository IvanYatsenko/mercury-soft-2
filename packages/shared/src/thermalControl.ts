export const heatOutputs = [
  'topHeater',
  'bottomHeater',
  'infrared',
  'infrared2',
  'infrared3',
] as const;
export type HeatOutput = (typeof heatOutputs)[number];
export interface ThermalSettings {
  mode: 'heaters' | 'lamps' | 'combined';
  kp: number;
  ki: number;
  kd: number;
  lookaheadSeconds: number;
  coolingDeadbandC: number;
  auxiliaryPowerW: number;
  powersW: Record<HeatOutput, number>;
}
export const defaultThermalSettings: ThermalSettings = {
  mode: 'heaters',
  kp: 0.075,
  ki: 0.0003,
  kd: 1.4,
  lookaheadSeconds: 10,
  coolingDeadbandC: 0.5,
  auxiliaryPowerW: 0,
  powersW: {
    topHeater: 0,
    bottomHeater: 0,
    infrared: 0,
    infrared2: 0,
    infrared3: 0,
  },
};

export function validateThermalSettings(value: unknown): ThermalSettings {
  if (!value || typeof value !== 'object')
    throw new Error('Неверные настройки регулирования.');
  const s = value as ThermalSettings;
  if (!['heaters', 'lamps', 'combined'].includes(s.mode))
    throw new Error('Выбери режим нагрева.');
  const ranges = {
    kp: [0, 5],
    ki: [0, 1],
    kd: [0, 20],
    lookaheadSeconds: [0, 60],
    coolingDeadbandC: [0, 5],
    auxiliaryPowerW: [0, 5000],
  } as const;
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const [min, max] = ranges[key];
    if (!Number.isFinite(s[key]) || s[key] < min || s[key] > max)
      throw new Error(`Недопустимое значение ${key}.`);
  }
  for (const name of heatOutputs)
    if (
      !Number.isFinite(s.powersW?.[name]) ||
      s.powersW[name] < 0 ||
      s.powersW[name] > 10000
    )
      throw new Error(`Неверная мощность ${name}.`);
  return { ...s, powersW: { ...s.powersW } };
}
