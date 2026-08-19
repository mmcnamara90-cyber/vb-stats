import { RADAR_AXES, type RadarAxis } from './radar';

// Short forms for the in-chart labels only — the full names (from
// RADAR_AXIS_LABELS) are already shown in the table underneath each chart,
// so these just need to fit inside the viewBox without clipping.
const SHORT_AXIS_LABELS: Record<RadarAxis, string> = {
  ballHandling: 'Ball Hdl',
  attacking: 'Attack',
  serving: 'Serve',
  blocking: 'Block',
  intangibles: 'Intang.',
};

const SIZE = 240;
const CENTER = SIZE / 2;
const MAX_RADIUS = 68;
const MAX_VALUE = 3;
const RINGS = [1, 2, 3];
const LABEL_RADIUS_FACTOR = 1.2;

function pointFor(index: number, fraction: number) {
  const angle = -Math.PI / 2 + index * ((2 * Math.PI) / RADAR_AXES.length);
  return {
    x: CENTER + Math.cos(angle) * MAX_RADIUS * fraction,
    y: CENTER + Math.sin(angle) * MAX_RADIUS * fraction,
  };
}

function polygonPoints(fractions: number[]): string {
  return fractions.map((f, i) => { const p = pointFor(i, f); return `${p.x},${p.y}`; }).join(' ');
}

export function RadarChart({
  profile,
  label,
}: {
  profile: Record<RadarAxis, number | null>;
  label?: string;
}) {
  const fractions = RADAR_AXES.map((axis) => Math.max(0, Math.min(1, (profile[axis] ?? 0) / MAX_VALUE)));

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[220px] mx-auto" role="img">
      {label && <title>{label}</title>}

      {/* Recessive gridlines: rings at 1/2/3 and one spoke per axis */}
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={polygonPoints(RADAR_AXES.map(() => ring / MAX_VALUE))}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={1}
        />
      ))}
      {RADAR_AXES.map((_, i) => {
        const p = pointFor(i, 1);
        return <line key={i} x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} stroke="#e5e7eb" strokeWidth={1} />;
      })}

      {/* Data polygon */}
      <polygon points={polygonPoints(fractions)} fill="#2563eb" fillOpacity={0.2} stroke="#2563eb" strokeWidth={2} />
      {fractions.map((f, i) => {
        const p = pointFor(i, f);
        return <circle key={i} cx={p.x} cy={p.y} r={3} fill="#2563eb" />;
      })}

      {/* Axis labels + values. Both sit at the same point with a fixed dy
          offset between them (rather than two different radii) so they stay
          cleanly stacked regardless of whether the axis points sideways,
          up, or down. */}
      {RADAR_AXES.map((axis, i) => {
        const labelPoint = pointFor(i, LABEL_RADIUS_FACTOR);
        const anchor = labelPoint.x > CENTER + 4 ? 'start' : labelPoint.x < CENTER - 4 ? 'end' : 'middle';
        const value = profile[axis];
        return (
          <g key={axis} textAnchor={anchor}>
            <text x={labelPoint.x} y={labelPoint.y} className="fill-gray-500" fontSize={10}>
              {SHORT_AXIS_LABELS[axis]}
            </text>
            <text x={labelPoint.x} y={labelPoint.y} dy={12} className="fill-brand-indigo-dark font-semibold" fontSize={10}>
              {value != null ? value.toFixed(1) : '–'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
