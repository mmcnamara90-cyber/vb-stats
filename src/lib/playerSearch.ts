import type { Player, Position } from '../types';
import { gradeLabel, gradYearToGrade } from './grade';
import { POSITION_LABELS, POSITION_SHORT_LABELS } from '../features/tryouts/skills';

export function playerGradeLabel(player: Player): string {
  return gradeLabel(gradYearToGrade(player.gradYear));
}

// Used by every player list's search box: matches name (prefix, so typing
// "Na" finds "Natalie"), grade ("10th" or "10"), or position (short or full
// label, e.g. "OH" or "Outside Hitter").
export function matchesPlayerQuery(player: Player, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (player.firstName.toLowerCase().startsWith(q)) return true;
  if (player.lastName.toLowerCase().startsWith(q)) return true;
  if (playerGradeLabel(player).toLowerCase().includes(q)) return true;
  return player.positions.some(
    (pos: Position) =>
      POSITION_SHORT_LABELS[pos].toLowerCase().includes(q) || POSITION_LABELS[pos].toLowerCase().includes(q),
  );
}
