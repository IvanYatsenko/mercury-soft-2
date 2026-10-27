import type { TemperatureRate } from '@mercury/shared';
import type { ProfilePlan } from '@mercury/shared';
import { Box, Stack } from '@mui/material';
import { usePcLayout } from './usePcLayout';
import {
  buildProfilePlan,
  type Profile,
  type RunSample,
} from '@mercury/shared';

function formatTime(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return (
    [
      Math.floor(total / 3600) ? `${Math.floor(total / 3600)} ч` : '',
      Math.floor((total % 3600) / 60)
        ? `${Math.floor((total % 3600) / 60)} мин`
        : '',
      total % 60 ? `${total % 60} с` : '',
    ]
      .filter(Boolean)
      .join(' ') || '0 с'
  );
}

export function RunProcessChart({
  profile,
  samples,
  cycle,
  heatingRate,
  coolingRate,
  savedPlan,
}: {
  profile: Profile;
  samples: RunSample[];
  cycle: number;
  heatingRate: TemperatureRate;
  coolingRate: TemperatureRate;
  savedPlan?: ProfilePlan | null | undefined;
}) {
  const pcLayout = usePcLayout();
  const plan = savedPlan ?? buildProfilePlan(profile, heatingRate, coolingRate);
  const current = samples.filter((sample) => sample.cycle === cycle);
  const previous = samples.filter((sample) => sample.cycle < cycle).at(-1);
  const offset = previous?.elapsedSeconds ?? 0;
  const actualField = profile.board
    ? 'boardTemperatureC'
    : 'chamberTemperatureC';
  const duration = Math.max(
    1,
    plan.durationSeconds,
    (current.at(-1)?.elapsedSeconds ?? offset) - offset,
  );
  const maximum =
    Math.ceil(
      Math.max(
        50,
        ...plan.points.map((point) => point.temperature),
        current.reduce((max, sample) => Math.max(max, sample[actualField]), 0),
      ) / 10,
    ) * 10;
  const left = pcLayout ? 64 : 42;
  const right = pcLayout ? 960 : 430;
  const bottom = pcLayout ? 400 : 132;
  const x = (second: number) => left + (second / duration) * (right - left);
  const y = (temperature: number) =>
    bottom - (temperature / maximum) * (pcLayout ? 350 : 108);
  const planned = plan.points
    .map((point) => `${x(point.second)},${y(point.temperature)}`)
    .join(' ');
  // Display-only filter: preserve sharp changes; never alter stored readings.
  let filtered = current[0]?.[actualField] ?? 0;
  const curve = current.map((sample, index) => {
    const value = sample[actualField];
    const previous = current[index - 1];
    const dt = previous
      ? Math.max(0, sample.elapsedSeconds - previous.elapsedSeconds)
      : 0;
    if (!previous || Math.abs(value - previous[actualField]) > 3 || dt > 5)
      filtered = value;
    else filtered += (value - filtered) * (1 - Math.exp(-dt / 3));
    return { x: x(sample.elapsedSeconds - offset), y: y(filtered) };
  });
  const actual = curve
    .map((point, index) => {
      const before = curve[index - 1];
      if (!before) return `M ${point.x} ${point.y}`;
      const middle = (before.x + point.x) / 2;
      return `C ${middle} ${before.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(' ');
  const last = curve.at(-1);
  return (
    <Stack sx={{ flex: 1, minHeight: 100, overflow: 'hidden' }}>
      <Box
        component="svg"
        viewBox={pcLayout ? '0 0 1000 440' : '0 0 450 160'}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="График профиля и фактической температуры текущего цикла"
        sx={{
          width: '100%',
          height: 0,
          minHeight: 100,
          flex: 1,
          color: 'text.secondary',
        }}
      >
        {[0, maximum / 2, maximum].map((temperature) => (
          <g key={temperature}>
            <line
              x1={left}
              x2={right}
              y1={y(temperature)}
              y2={y(temperature)}
              stroke="currentColor"
              opacity="0.2"
            />
            <text
              x={left - 5}
              y={y(temperature) + 5}
              textAnchor="end"
              fill="currentColor"
              fontSize={pcLayout ? 20 : 15}
            >
              {temperature}°
            </text>
          </g>
        ))}
        <polyline
          points={planned}
          fill="none"
          stroke="#66bb6a"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={actual}
          fill="none"
          stroke="#ffb74d"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {last && <circle cx={last.x} cy={last.y} r="4" fill="#ffb74d" />}
        <text
          x={left}
          y={pcLayout ? 435 : 155}
          fill="currentColor"
          fontSize={pcLayout ? 18 : 14}
        >
          0 с
        </text>
        <text
          x={right}
          y={pcLayout ? 435 : 155}
          textAnchor="end"
          fill="currentColor"
          fontSize={pcLayout ? 18 : 14}
        >
          {formatTime(duration)}
        </text>
      </Box>
    </Stack>
  );
}
