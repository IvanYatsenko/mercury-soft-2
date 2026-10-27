import type { TemperatureRate } from '@mercury/shared';
import { Box, Typography, useMediaQuery } from '@mui/material';
import { usePcLayout } from './usePcLayout';
import {
  buildRunPlan,
  profileDurationPoints,
  type Profile,
} from '@mercury/shared';

function formatProfileTime(seconds: number) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return [
    hours ? String(hours).padStart(2, '0') + ' часов' : '',
    minutes ? String(minutes).padStart(2, '0') + ' минут' : '',
    remaining ? String(remaining).padStart(2, '0') + ' секунд' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Each point stores a stage duration, so the time axis accumulates seconds. */
export function ProfileChart({
  profile,
  heatingRate = 0.7,
  coolingRate = 0.4,
  showTitle = true,
}: {
  profile: Profile;
  heatingRate?: TemperatureRate;
  coolingRate?: TemperatureRate;
  showTitle?: boolean;
}) {
  const desktop = useMediaQuery('(min-width: 900px)');
  const pcLayout = usePcLayout();
  let points = profileDurationPoints(profile, heatingRate, coolingRate);
  try {
    const planned = buildRunPlan(profile, heatingRate, coolingRate).points;
    points = planned.map((p, i) => ({
      ...p,
      second: p.second - (planned[i - 1]?.second ?? 0),
    }));
  } catch {
    /* Empty and low-temperature drafts remain editable. */
  }
  let elapsed = 0;
  const curve = points.map((point) => {
    elapsed += point.second;
    return { time: elapsed, temperature: point.temperature };
  });
  const duration = Math.max(1, elapsed);
  const maximum = Math.max(0, ...points.map((point) => point.temperature));
  const ceiling = Math.max(1, maximum);
  const left = pcLayout ? 54 : 29;
  const right = pcLayout ? 880 : 199;
  const x = (time: number) => left + (time / duration) * (right - left);
  const y = (temperature: number) =>
    pcLayout
      ? 330 - (temperature / ceiling) * 290
      : 96 - (temperature / ceiling) * 65;
  const line = curve
    .map((point) => `${x(point.time)},${y(point.temperature)}`)
    .join(' ');

  return (
    <Box
      sx={{
        minHeight: 0,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        p: 0,
      }}
    >
      {showTitle && (
        <Typography
          noWrap
          title={profile.name}
          sx={{ fontSize: { xs: 14, md: 22 }, fontWeight: 700 }}
        >
          {profile.name}
        </Typography>
      )}
      <Box
        component="svg"
        viewBox={pcLayout ? '0 0 900 360' : '0 0 202 100'}
        preserveAspectRatio={desktop ? 'xMidYMid meet' : 'none'}
        role="img"
        aria-label={`График профиля ${profile.name}: температура по времени`}
        sx={{ width: '100%', flex: 1, minHeight: 0, color: 'text.secondary' }}
      >
        <title>{profile.name}: температура по времени</title>
        {[...new Set([0, Math.round(maximum / 2), maximum])].map(
          (temperature) => (
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
                x={left - (pcLayout ? 10 : 3)}
                y={y(temperature) + 3}
                textAnchor="end"
                fill="currentColor"
                fontSize={pcLayout ? 18 : 12}
              >
                {Math.round(temperature)}
              </text>
            </g>
          ),
        )}
        <text
          x="3"
          y={pcLayout ? 20 : 12}
          fill="currentColor"
          fontSize={pcLayout ? 18 : 12}
        >
          °C
        </text>
        {curve.length > 1 && elapsed > 0 ? (
          <polyline
            points={line}
            fill="none"
            stroke={pcLayout ? '#66bb6a' : '#ffb74d'}
            strokeWidth="2.5"
            strokeLinejoin="round"
            vectorEffect={pcLayout ? 'non-scaling-stroke' : undefined}
          />
        ) : (
          <text
            x={pcLayout ? 450 : 111}
            y={pcLayout ? 180 : 60}
            textAnchor="middle"
            fill="currentColor"
            fontSize="13"
          >
            Нет участков
          </text>
        )}
      </Box>
      {elapsed > 0 && (
        <Typography
          sx={{ fontSize: 12, lineHeight: 1.25, textAlign: 'right', mt: 0.25 }}
        >
          {formatProfileTime(elapsed)}
        </Typography>
      )}
    </Box>
  );
}
