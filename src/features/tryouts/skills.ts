import type { Position, Skill, TryoutLevel } from '../../types';

export const SKILLS: Skill[] = [
  'serve',
  'serve_receive',
  'free_ball',
  'down_ball',
  'setting',
  'hitting',
  'blocking',
  'digging',
  'athleticism',
  'volleyball_iq',
  'coachability',
];

export const SKILL_LABELS: Record<Skill, string> = {
  serve: 'Serve',
  serve_receive: 'Serve Receive Passing',
  free_ball: 'Free Ball Passing',
  down_ball: 'Down Ball Passing',
  setting: 'Setting',
  hitting: 'Hitting',
  blocking: 'Blocking',
  digging: 'Digging',
  athleticism: 'Athleticism',
  volleyball_iq: 'Volleyball IQ',
  coachability: 'Coachability',
};

export const SKILL_SHORT_LABELS: Record<Skill, string> = {
  serve: 'Srv',
  serve_receive: 'SR',
  free_ball: 'FB',
  down_ball: 'DB',
  setting: 'Set',
  hitting: 'Hit',
  blocking: 'Blk',
  digging: 'Dig',
  athleticism: 'Ath',
  volleyball_iq: 'IQ',
  coachability: 'Coach',
};

export const POSITIONS: Position[] = ['OH', 'MB', 'S', 'OPP', 'DS_L'];

export const POSITION_LABELS: Record<Position, string> = {
  OH: 'Outside Hitter',
  MB: 'Middle Blocker',
  S: 'Setter',
  OPP: 'Opposite',
  DS_L: 'Defensive Specialist / Libero',
};

export const POSITION_SHORT_LABELS: Record<Position, string> = {
  OH: 'OH',
  MB: 'MB',
  S: 'S',
  OPP: 'OPP',
  DS_L: 'DS/L',
};

export const TRYOUT_LEVELS: TryoutLevel[] = ['upper', 'lower'];

export const TRYOUT_LEVEL_LABELS: Record<TryoutLevel, string> = {
  upper: 'Upper (Varsity/JV)',
  lower: 'Lower (Freshman/Level 3)',
};

// Groups a set of tryout sessions for roster-decision purposes.
// No explicit cycle picker in this phase — just one implicit cycle per season.
export function currentTryoutCycleId(date = new Date()): string {
  const year = date.getFullYear();
  const season = date.getMonth() >= 6 ? 'fall' : 'spring'; // Jul-Dec -> fall, Jan-Jun -> spring
  return `${year}-${season}`;
}
