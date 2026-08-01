import type { Position } from '../../types';
import { POSITION_BADGE_CLASSES, POSITION_SHORT_LABELS } from './skills';

export function PositionBadges({ positions }: { positions: Position[] }) {
  if (positions.length === 0) return null;
  return (
    <span className="flex gap-1 flex-wrap">
      {positions.map((p) => (
        <span
          key={p}
          className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium leading-none ${POSITION_BADGE_CLASSES[p]}`}
        >
          {POSITION_SHORT_LABELS[p]}
        </span>
      ))}
    </span>
  );
}
