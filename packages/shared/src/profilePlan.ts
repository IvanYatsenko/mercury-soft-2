import type { Profile, TemperatureValue } from './index.js';

export interface ProfilePlan {
  points: TemperatureValue[];
  durationSeconds: number;
  cycles: number;
  maximumTemperatureC: number;
}
export interface ResponseBand {
  fromC: number;
  toC: number;
  heatingCPerSecond: number;
  coolingCPerSecond: number;
}
export type TemperatureRate =
  | number
  | {
      fallback: number;
      bands: readonly ResponseBand[];
    };

export function rateAtTemperature(
  rate: TemperatureRate,
  temperature: number,
  cooling = false,
): number {
  if (typeof rate === 'number') return rate;
  const band = rate.bands.find(
    (item) => temperature >= item.fromC && temperature <= item.toC,
  );
  return band
    ? cooling
      ? band.coolingCPerSecond
      : band.heatingCPerSecond
    : rate.fallback;
}

export function validateProfile(value: unknown): asserts value is Profile {
  if (!value || typeof value !== 'object')
    throw new Error('Не указан профиль.');
  const p = value as Profile;
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.trim().length > 80)
    throw new Error('Название: от 1 до 80 символов.');
  if (
    (p.mode !== 'easy' && p.mode !== 'manual') ||
    typeof p.board !== 'boolean'
  )
    throw new Error('Некорректный режим или датчик.');
  const validPoint = (point: TemperatureValue) =>
    point &&
    Number.isInteger(point.second) &&
    point.second >= 0 &&
    point.second <= 99999 &&
    Number.isInteger(point.temperature) &&
    point.temperature >= 0 &&
    point.temperature <= 280;
  if (
    !Array.isArray(p.points) ||
    p.points.length < 1 ||
    p.points.length > 200 ||
    !p.points.every(validPoint)
  )
    throw new Error(
      'Участки: время 0–99999 с, температура 0–280 °C; только целые числа.',
    );
  if (
    p.points[0]?.second !== 0 ||
    p.points.slice(1).some((point) => point.second <= 0)
  )
    throw new Error(
      'Начальная точка имеет время 0; длительность остальных участков должна быть положительной.',
    );
  if (
    !Array.isArray(p.shelves) ||
    p.shelves.length !== 3 ||
    !p.shelves.every(validPoint)
  )
    throw new Error('Профиль должен содержать три полки.');
  if (
    p.mode === 'easy' &&
    (p.shelves[2].second !== 0 ||
      p.shelves[1].temperature < p.shelves[0].temperature ||
      p.shelves[2].temperature > p.shelves[1].temperature)
  )
    throw new Error(
      'Простой профиль: пик не ниже прогрева, охлаждение не выше пика, его время рассчитывается.',
    );
  if (
    p.repeat !== undefined &&
    (!Number.isInteger(p.repeat) || p.repeat < 1 || p.repeat > 20)
  )
    throw new Error('Число циклов: целое число от 1 до 20.');
}

/** A manual ramp is linear: even its slowest temperature band must be feasible. */
export function manualCoolingWarnings(
  profile: Profile,
  coolingRate: TemperatureRate,
) {
  if (profile.mode !== 'manual') return [];
  const rate =
    profile.board && typeof coolingRate !== 'number'
      ? coolingRate.fallback
      : coolingRate;
  const warnings: { index: number; requiredSeconds: number }[] = [];
  for (let index = 1; index < profile.points.length; index++) {
    const previous = profile.points[index - 1];
    const point = profile.points[index];
    if (!previous || !point) continue;
    const from = previous.temperature;
    const to = point.temperature;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= to) continue;
    const edges =
      typeof rate === 'number'
        ? []
        : rate.bands.flatMap((b) => [b.fromC, b.toC]);
    const temperatures = [
      ...new Set([from, to, ...edges.filter((t) => t > to && t < from)]),
    ].sort((a, b) => a - b);
    let minimumRate = Infinity;
    for (let i = 1; i < temperatures.length; i++) {
      minimumRate = Math.min(
        minimumRate,
        rateAtTemperature(
          rate,
          (temperatures[i - 1]! + temperatures[i]!) / 2,
          true,
        ),
      );
    }
    if (!Number.isFinite(minimumRate) || minimumRate <= 0) continue;
    const requiredSeconds = Math.ceil((from - to) / minimumRate);
    if (point.second < requiredSeconds)
      warnings.push({ index, requiredSeconds });
  }
  return warnings;
}

export function profileDurationPoints(
  profile: Profile,
  heatingRate: TemperatureRate = 0.7,
  coolingRate: TemperatureRate = 0.4,
): TemperatureValue[] {
  if (profile.mode === 'manual')
    return profile.points.map((point) => ({ ...point }));
  const [preheat, peak, cooling] = profile.shelves;
  const points: TemperatureValue[] = [{ second: 0, temperature: 30 }];
  const append = (temperature: number, seconds: number) => {
    if (seconds > 0) points.push({ second: seconds, temperature });
  };
  const ramp = (from: number, to: number) => {
    const cooling = to < from;
    let rate = cooling ? coolingRate : heatingRate;
    // These measurements describe the chamber sensor of an empty M300 only.
    if (profile.board && typeof rate !== 'number') rate = rate.fallback;
    const edges =
      typeof rate === 'number'
        ? []
        : rate.bands.flatMap((band) => [band.fromC, band.toC]);
    const targets = [
      ...new Set([
        ...edges.filter(
          (t) => t > Math.min(from, to) && t < Math.max(from, to),
        ),
        to,
      ]),
    ].sort((a, b) => (cooling ? b - a : a - b));
    let previous = from;
    for (const temperature of targets) {
      const speed = rateAtTemperature(
        rate,
        (previous + temperature) / 2,
        cooling,
      );
      if (!Number.isFinite(speed) || speed <= 0)
        throw new Error('Скорость должна быть положительным числом.');
      append(temperature, Math.ceil(Math.abs(temperature - previous) / speed));
      previous = temperature;
    }
  };
  ramp(30, preheat.temperature);
  append(preheat.temperature, preheat.second);
  ramp(preheat.temperature, peak.temperature);
  append(peak.temperature, peak.second);
  ramp(peak.temperature, cooling.temperature);
  return points;
}

export function buildProfilePlan(
  profile: Profile,
  heatingRate: TemperatureRate = 0.7,
  coolingRate: TemperatureRate = 0.4,
): ProfilePlan {
  validateProfile(profile);
  let elapsed = 0;
  const points = profileDurationPoints(profile, heatingRate, coolingRate).map(
    (point) => ({
      second: (elapsed += point.second),
      temperature: point.temperature,
    }),
  );
  if (elapsed <= 0)
    throw new Error('Добавь участки или полки с положительной длительностью.');
  return {
    points,
    durationSeconds: elapsed,
    cycles: profile.repeat ?? 1,
    maximumTemperatureC: Math.max(...points.map((point) => point.temperature)),
  };
}

export function targetAt(
  plan: ProfilePlan,
  seconds: number,
): { temperature: number; slope: number; stage: number } {
  const index = plan.points.findIndex((point) => point.second > seconds);
  if (index < 1)
    return {
      temperature: (index < 0 ? plan.points.at(-1) : plan.points[0])!
        .temperature,
      slope: 0,
      stage: Math.max(1, plan.points.length - 1),
    };
  const before = plan.points[index - 1]!;
  const after = plan.points[index]!;
  const slope =
    (after.temperature - before.temperature) / (after.second - before.second);
  return {
    temperature:
      before.temperature + slope * Math.max(0, seconds - before.second),
    slope,
    stage: index,
  };
}

/** Skip only the initial part before the first rising crossing of 50 °C. */
export function buildRunPlan(
  profile: Profile,
  heatingRate: TemperatureRate = 0.7,
  coolingRate: TemperatureRate = 0.4,
  startTemperatureC = 50,
): ProfilePlan {
  const plan = buildProfilePlan(profile, heatingRate, coolingRate);
  let firstPeak = plan.points[0]!.temperature;
  for (let i = 1; i < plan.points.length; i++) {
    if (plan.points[i]!.temperature <= plan.points[i - 1]!.temperature) break;
    firstPeak = plan.points[i]!.temperature;
  }
  const entry = Math.min(Math.max(50, startTemperatureC), firstPeak);
  if (entry < 50) throw new Error('Первая полка должна достигать 50 °C.');
  let offset: number | undefined =
    plan.points[0]?.temperature === entry ? 0 : undefined;
  for (let i = 1; offset === undefined && i < plan.points.length; i++) {
    const before = plan.points[i - 1]!;
    const after = plan.points[i]!;
    if (
      before.temperature <= entry &&
      after.temperature >= entry &&
      after.temperature > before.temperature
    )
      offset =
        before.second +
        ((entry - before.temperature) /
          (after.temperature - before.temperature)) *
          (after.second - before.second);
  }
  if (offset === undefined || offset >= plan.durationSeconds)
    throw new Error('В профиле нет участка нагрева от 50 °C.');
  const points = [
    { second: 0, temperature: entry },
    ...plan.points
      .filter((p) => p.second > offset!)
      .map((p) => ({ ...p, second: p.second - offset! })),
  ];
  return {
    ...plan,
    points,
    durationSeconds: plan.durationSeconds - offset,
    maximumTemperatureC: Math.max(...points.map((p) => p.temperature)),
  };
}

export type RunState =
  | 'idle'
  | 'preparing'
  | 'running'
  | 'cooling'
  | 'completed'
  | 'stopped'
  | 'failed';
export interface RunStatus {
  paused?: boolean;
  doorOpen?: boolean;
  holdingTemperatureC?: number | null;
  pendingReady?: boolean;
  canAcknowledge?: boolean;
  id: string | null;
  state: RunState;
  profileName: string | null;
  cycle: number;
  cycles: number;
  stage: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  targetTemperatureC: number | null;
  measuredTemperatureC: number | null;
  error: string | null;
}
export interface RunSample {
  elapsedSeconds: number;
  targetTemperatureC: number;
  chamberTemperatureC: number;
  boardTemperatureC: number;
  heating: boolean;
  heatOutputs?: {
    topHeater: boolean;
    bottomHeater: boolean;
    infrared: boolean;
    infrared2: boolean;
    infrared3?: boolean;
  };
  cooling: boolean;
  cycle: number;
}
export interface RunRecord {
  id: string;
  profileName: string;
  startedAt: string;
  finishedAt: string | null;
  state: RunState;
  error: string | null;
  simulated: boolean;
}
