export const predictionHorizonSeconds = 5;

export interface HeatPulse {
  source: 'off' | 'oneHeater' | 'heaters' | 'lamps' | 'combined';
  seconds: number;
  duty: number;
}

// The combined response is measured. Individual source gains are provisional
// power ratios; they are not a measured model of heater/lamp thermal inertia.
export function planHeatPulse(
  measured: number,
  futureTarget: number,
  rate: number,
  fullRate: number,
  heaterPower: number,
  lampPower: number,
): HeatPulse {
  const totalPower = heaterPower + lampPower;
  let best: HeatPulse = { source: 'off', seconds: 0, duty: 0 };
  let bestScore = Infinity;
  const sources = [
    ['off', 0],
    ['oneHeater', heaterPower / 2],
    ['heaters', heaterPower],
    ['lamps', lampPower],
    ['combined', totalPower],
  ] as const;
  for (const [source, power] of sources) {
    if (source !== 'off' && power <= 0) continue;
    for (let seconds = source === 'off' ? 0 : 1; seconds <= 5; seconds++) {
      if (source === 'off' && seconds > 0) break;
      const gain = totalPower > 0 ? (fullRate * power) / totalPower : 0;
      // One five-second horizon: two seconds of observed inertia, then three
      // seconds at the requested average power. Counting five seconds of new
      // heat as well as two seconds of motion overestimated ramp progress.
      // Recompute every tick; no output is latched for the whole pulse.
      const responseSeconds = predictionHorizonSeconds - 2;
      const predicted =
        measured +
        rate * 2 +
        gain * (seconds / predictionHorizonSeconds) * responseSeconds;
      const error = futureTarget - predicted;
      const score =
        error * error * (error < 0 ? 3 : 1) +
        0.1 * (totalPower > 0 ? (power / totalPower) ** 2 : 0) +
        0.02 * (totalPower > 0 ? (power * seconds) / totalPower : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { source, seconds, duty: seconds / 5 };
      }
    }
  }
  return best;
}
