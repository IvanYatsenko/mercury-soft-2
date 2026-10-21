import type {
  EasyProfile,
  ManualProfile,
  Profile,
  TemperatureValue,
} from './index.js';
import { profileDurationPoints } from './profilePlan.js';
import type { TemperatureRate } from './profilePlan.js';

/**
 * Converts the editable representation of a profile.
 * This is a draft conversion for the UI: manual points are reduced to their
 * temperature plateaus; easy shelves are expanded into approximate points.
 */
export function convertProfileMode(
  profile: Profile,
  mode: 'easy' | 'manual',
  heatingRate: TemperatureRate = 0.7,
  coolingRate: TemperatureRate = 0.4,
): Profile {
  if (profile.mode === mode) return profile;

  if (mode === 'easy') {
    const manual = profile as ManualProfile;
    const plateaus: TemperatureValue[] = [];

    for (let index = 0; index < manual.points.length - 1; index += 1) {
      const point = manual.points[index];
      const nextPoint = manual.points[index + 1];
      if (!point || !nextPoint) continue;
      if (point.temperature === nextPoint.temperature) {
        plateaus.push({ ...nextPoint });
      }
    }

    // The simple format always has preheat, peak, and cooling shelves.
    // Keep two existing plateaus where possible; otherwise use manual shelf data.
    const preheat = plateaus[0] ?? { ...manual.shelves[0] };
    const maximum = Math.max(
      preheat.temperature,
      ...manual.points.map((point) => point.temperature),
    );
    const peak = {
      temperature: maximum,
      second:
        plateaus
          .filter((point) => point.temperature === maximum)
          .reduce((total, point) => total + point.second, 0) ||
        manual.shelves[1].second,
    };
    const lastTemperature =
      manual.points.at(-1)?.temperature ?? manual.shelves[2].temperature;
    const shelves: EasyProfile['shelves'] = [
      { ...preheat },
      { ...peak },
      {
        second: 0,
        temperature: Math.min(
          lastTemperature,
          Math.max(preheat.temperature, peak.temperature),
        ),
      },
    ];

    return {
      mode: 'easy',
      ...(manual.id ? { id: manual.id } : {}),
      name: manual.name,
      board: manual.board,
      ...(manual.repeat === undefined ? {} : { repeat: manual.repeat }),
      shelves,
      points: buildApproximatePoints(
        shelves,
        heatingRate,
        coolingRate,
        manual.board,
      ),
    };
  }

  const easy = profile as EasyProfile;
  const shelves: ManualProfile['shelves'] = [
    { ...easy.shelves[0] },
    { ...easy.shelves[1] },
    { second: 0, temperature: easy.shelves[2].temperature },
  ];
  const points = buildApproximatePoints(
    easy.shelves,
    heatingRate,
    coolingRate,
    easy.board,
  );

  return {
    mode: 'manual',
    ...(easy.id ? { id: easy.id } : {}),
    name: easy.name,
    board: easy.board,
    ...(easy.repeat === undefined ? {} : { repeat: easy.repeat }),
    shelves,
    points,
  };
}

function buildApproximatePoints(
  shelves: EasyProfile['shelves'],
  heatingRate: TemperatureRate,
  coolingRate: TemperatureRate,
  board: boolean,
): TemperatureValue[] {
  return profileDurationPoints(
    {
      name: '',
      mode: 'easy',
      board,
      shelves,
      points: [],
    },
    heatingRate,
    coolingRate,
  );
}
