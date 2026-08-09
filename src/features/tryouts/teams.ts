import type { Position, Team, TryoutLevel } from '../../types';

export const TEAMS: Team[] = ['varsity', 'jv', 'freshman', 'level3'];

export const TEAM_LABELS: Record<Team, string> = {
  varsity: 'Varsity',
  jv: 'JV',
  freshman: 'Freshman',
  level3: 'Level 3',
};

// Which tryout pool feeds which team — Upper pool scores Varsity/JV
// candidates, Lower pool scores Freshman/Level 3 candidates.
export const TEAM_LEVEL: Record<Team, TryoutLevel> = {
  varsity: 'upper',
  jv: 'upper',
  freshman: 'lower',
  level3: 'lower',
};

// Overall competitiveness ranking, most to least selective. Once a player is
// confirmed on a team, they're locked out of being added as a candidate on
// any lower-ranked team (but remain available for equal/higher teams — e.g.
// a confirmed JV player can still be looked at for Varsity).
export const TEAM_RANK: Record<Team, number> = {
  varsity: 0,
  jv: 1,
  freshman: 2,
  level3: 3,
};

// Starting point for a team's depth chart — editable per team afterward.
export const DEFAULT_POSITION_TARGETS: Record<Position, { minCount: number; targetCount: number }> = {
  S: { minCount: 2, targetCount: 3 },
  OH: { minCount: 3, targetCount: 3 },
  MB: { minCount: 2, targetCount: 3 },
  OPP: { minCount: 1, targetCount: 2 },
  DS_L: { minCount: 1, targetCount: 2 },
};
