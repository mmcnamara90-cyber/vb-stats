// Assigns each roster player a stable, distinct color used throughout the
// Lineup Sheet (GameLineupSheetTab.tsx) so a coach glancing at it can track
// one player across rotations by color alone — the same trick the coach's
// own hand-drawn sheet used (a consistent pen color per player, name/number
// always still printed too so color is a bonus cue, never load-bearing).
// Index-based off the roster sorted by name, so a player's color stays the
// same across every rotation/set in a game regardless of where she's
// starting or benched.

export const PLAYER_COLOR_CLASSES = [
  'text-blue-700 bg-blue-50 border-blue-300',
  'text-rose-700 bg-rose-50 border-rose-300',
  'text-emerald-700 bg-emerald-50 border-emerald-300',
  'text-amber-700 bg-amber-50 border-amber-300',
  'text-violet-700 bg-violet-50 border-violet-300',
  'text-cyan-700 bg-cyan-50 border-cyan-300',
  'text-orange-700 bg-orange-50 border-orange-300',
  'text-pink-700 bg-pink-50 border-pink-300',
  'text-lime-700 bg-lime-50 border-lime-300',
  'text-indigo-700 bg-indigo-50 border-indigo-300',
] as const;

const FALLBACK_COLOR_CLASS = 'text-gray-700 bg-gray-50 border-gray-300';

export function playerColorClass(playerId: string, orderedPlayerIds: string[]): string {
  const idx = orderedPlayerIds.indexOf(playerId);
  if (idx < 0) return FALLBACK_COLOR_CLASS;
  return PLAYER_COLOR_CLASSES[idx % PLAYER_COLOR_CLASSES.length];
}
