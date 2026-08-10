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

// Most to least selective — drives the "push down a level" action (Varsity ->
// JV -> Level 3 -> Freshman) and cascade eligibility elsewhere.
export const TEAM_ORDER: Team[] = ['varsity', 'jv', 'level3', 'freshman'];

export function nextLowerTeam(team: Team): Team | null {
  const i = TEAM_ORDER.indexOf(team);
  return i >= 0 && i < TEAM_ORDER.length - 1 ? TEAM_ORDER[i + 1] : null;
}

// Starting point for a team's depth chart — editable per team afterward.
export const DEFAULT_POSITION_TARGETS: Record<Position, { minCount: number; targetCount: number }> = {
  S: { minCount: 2, targetCount: 3 },
  OH: { minCount: 3, targetCount: 3 },
  MB: { minCount: 2, targetCount: 3 },
  OPP: { minCount: 1, targetCount: 2 },
  DS_L: { minCount: 1, targetCount: 2 },
};
