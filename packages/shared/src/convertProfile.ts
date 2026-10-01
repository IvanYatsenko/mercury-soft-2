import type {
  EasyProfile,
  ManualProfile,
  Profile,
  TemperatureValue,
} from './index.js';

/**
 * Converts the editable representation of a profile.
 * This is a draft conversion for the UI: manual points are reduced to their
 * temperature plateaus; easy shelves are expanded into approximate points.
 */
export function convertProfileMode(
  profile: Profile,
  mode: 'easy' | 'manual',
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
    const peak = plateaus[1] ?? { ...manual.shelves[1] };
    const lastTemperature = manual.points.at(-1)?.temperature ?? manual.shelves[2].temperature;
    const shelves: EasyProfile['shelves'] = [
      { ...preheat },
      { ...peak },
      { second: 0, temperature: Math.min(lastTemperature, Math.max(preheat.temperature, peak.temperature)) },
    ];

    return {
      mode: 'easy',
      name: manual.name,
      board: manual.board,
      ...(manual.repeat === undefined ? {} : { repeat: manual.repeat }),
      shelves,
      points: buildApproximatePoints(shelves),
    };
  }

  const easy = profile as EasyProfile;
  const shelves: ManualProfile['shelves'] = [
    { ...easy.shelves[0] },
    { ...easy.shelves[1] },
    { second: 0, temperature: easy.shelves[2].temperature },
  ];
  const points = buildApproximatePoints(easy.shelves);

  return {
    mode: 'manual',
    name: easy.name,
    board: easy.board,
    ...(easy.repeat === undefined ? {} : { repeat: easy.repeat }),
    shelves,
    points,
  };
}

function buildApproximatePoints(
  shelves: EasyProfile['shelves'],
): TemperatureValue[] {
  const [preheat, peak, cooling] = shelves;
  const maxTemperature = Math.max(preheat.temperature, peak.temperature);

  // Heating ramps use a provisional rate of 0.8 °C/s, matching the old app.
  // The controller's real ramp model must replace this before hardware use.
  const preheatRamp = Math.max(
    0,
    Math.round(Math.abs(preheat.temperature - 30) / 0.8),
  );
  const peakRamp = Math.max(
    0,
    Math.round(Math.abs(maxTemperature - preheat.temperature) / 0.8),
  );
  const coolingRamp = Math.max(
    0,
    Math.round(Math.abs(maxTemperature - cooling.temperature) / 0.4),
  );

  return [
    { second: 0, temperature: 30 },
    { second: preheatRamp, temperature: preheat.temperature },
    { second: preheat.second, temperature: preheat.temperature },
    { second: peakRamp, temperature: maxTemperature },
    { second: peak.second, temperature: maxTemperature },
    { second: coolingRamp, temperature: cooling.temperature },
  ];
}
