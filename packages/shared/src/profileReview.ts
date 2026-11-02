/**
 * Общая оценка совместимости и переносимая копия профиля для всех интерфейсов.
 */
import type { Profile } from './index.js';
import { connectionVoltageLabel } from './ovens/identity.js';
import {
  buildRunPlan,
  validateProfile,
  rateAtTemperature,
  type TemperatureRate,
} from './profilePlan.js';
export type ProfileSource = { model: string; connectionVoltage: string };
/**
 * Сопоставляет траекторию с возможностями модели и формирует предупреждения до запуска.
 */
export function reviewProfile(
  profile: Profile,
  heating: TemperatureRate,
  cooling: TemperatureRate,
  limit = 280,
  source?: ProfileSource,
  target?: ProfileSource,
) {
  const errors: string[] = [],
    warnings: string[] = [];
  let plan: ReturnType<typeof buildRunPlan> | null = null;
  try {
    plan = buildRunPlan(profile, heating, cooling);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Некорректный профиль');
  }
  if (plan) {
    if (plan.maximumTemperatureC > limit)
      errors.push(
        `Максимальная температура ${plan.maximumTemperatureC} °C превышает предел ${limit} °C.`,
      );
    for (let i = 1; i < plan.points.length; i++) {
      const from = plan.points[i - 1]!,
        to = plan.points[i]!,
        delta = to.temperature - from.temperature;
      if (!delta) continue;
      const rate =
        profile.board && typeof (delta > 0 ? heating : cooling) !== 'number'
          ? ((delta > 0 ? heating : cooling) as Exclude<
              TemperatureRate,
              number
            >)
          : null;
      const actual = rate ? rate.fallback : delta > 0 ? heating : cooling;
      const lo = Math.min(from.temperature, to.temperature),
        hi = Math.max(from.temperature, to.temperature);
      const edges =
        typeof actual === 'number'
          ? []
          : actual.bands
              .flatMap((v) => [v.fromC, v.toC])
              .filter((v) => v > lo && v < hi);
      const temps = [...new Set([lo, ...edges, hi])].sort((a, b) => a - b);
      let minimum = Infinity;
      for (let j = 1; j < temps.length; j++)
        minimum = Math.min(
          minimum,
          rateAtTemperature(actual, (temps[j - 1]! + temps[j]!) / 2, delta < 0),
        );
      if (Number.isFinite(minimum) && minimum > 0) {
        const required = Math.ceil(Math.abs(delta) / minimum);
        if (to.second - from.second < required)
          warnings.push(
            `Участок ${i}: ${delta > 0 ? 'нагрев' : 'охлаждение'} ${from.temperature}→${to.temperature} °C за ${Math.round(to.second - from.second)} с; по характеристикам печи требуется не менее ${required} с.`,
          );
      }
    }
    if (profile.board)
      warnings.push(
        'Используется датчик на плате. Скорости, измеренные по камере, не гарантируют точность этого датчика.',
      );
  }
  if (
    source &&
    target &&
    (source.model !== target.model ||
      source.connectionVoltage !== target.connectionVoltage)
  )
    warnings.push(
      `Исходная конфигурация: М${source.model}/${connectionVoltageLabel(source.connectionVoltage)} В. Проверено для М${target.model}/${connectionVoltageLabel(target.connectionVoltage)} В.`,
    );
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sensor: profile.board ? 'board' : 'chamber',
    maximumTemperatureC: plan?.maximumTemperatureC ?? null,
    cycles: plan?.cycles ?? profile.repeat ?? 1,
    cycleSeconds: plan?.durationSeconds ?? null,
    totalSeconds: plan ? plan.durationSeconds * plan.cycles : null,
  };
}
/**
 * Создаёт переносимую копию без локального идентификатора записи библиотеки.
 */
export function portableProfile(value: Profile): Profile {
  const result = {
    name: value.name,
    mode: value.mode,
    board: value.board,
    points: value.points.map((v) => ({
      second: v.second,
      temperature: v.temperature,
    })),
    shelves: value.shelves.map((v) => ({
      second: v.second,
      temperature: v.temperature,
    })) as Profile['shelves'],
    ...(value.repeat === undefined ? {} : { repeat: value.repeat }),
  };
  validateProfile(result);
  return result;
}
/**
 * Подбирает свободное имя копии без перезаписи существующего профиля.
 */
export function uniqueProfileName(name: string, existing: string[]) {
  const trimmed = name.trim().slice(0, 80);
  let next = trimmed,
    number = 2;
  while (existing.includes(next)) {
    const suffix = ` (${number++})`;
    next = trimmed.slice(0, 80 - suffix.length) + suffix;
  }
  return next;
}
