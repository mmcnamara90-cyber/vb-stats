import type { Skill } from '../../types';

export const SKILLS: Skill[] = [
  'serve',
  'serve_receive',
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
  serve_receive: 'Serve Receive',
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
  serve_receive: 'Rcv',
  setting: 'Set',
  hitting: 'Hit',
  blocking: 'Blk',
  digging: 'Dig',
  athleticism: 'Ath',
  volleyball_iq: 'IQ',
  coachability: 'Coach',
};

// Groups a set of tryout sessions for roster-decision purposes.
// No explicit cycle picker in this phase — just one implicit cycle per season.
export function currentTryoutCycleId(date = new Date()): string {
  const year = date.getFullYear();
  const season = date.getMonth() >= 6 ? 'fall' : 'spring'; // Jul-Dec -> fall, Jan-Jun -> spring
  return `${year}-${season}`;
}
