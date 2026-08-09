import type { Skill } from '../../types';

// 5-axis skill profile, per coach's mental model: ball control, attacking,
// serving, blocking, and the "intangibles" that don't show up in a single drill.
export const RADAR_AXES = ['ballHandling', 'attacking', 'serving', 'blocking', 'intangibles'] as const;
export type RadarAxis = (typeof RADAR_AXES)[number];

export const RADAR_AXIS_LABELS: Record<RadarAxis, string> = {
  ballHandling: 'Ball Handling',
  attacking: 'Attacking',
  serving: 'Serving',
  blocking: 'Blocking',
  intangibles: 'Intangibles',
};

// Every tracked Skill feeds exactly one axis.
const RADAR_AXIS_SKILLS: Record<RadarAxis, Skill[]> = {
  ballHandling: ['serve_receive', 'free_ball', 'down_ball', 'digging', 'setting'],
  attacking: ['hitting'],
  serving: ['serve'],
  blocking: ['blocking'],
  intangibles: ['athleticism', 'volleyball_iq', 'coachability'],
};

export function skillAveragesToRadarProfile(
  bySkill: Partial<Record<Skill, number>>,
): Record<RadarAxis, number | null> {
  const result = {} as Record<RadarAxis, number | null>;
  for (const axis of RADAR_AXES) {
    const values = RADAR_AXIS_SKILLS[axis]
      .map((skill) => bySkill[skill])
      .filter((v): v is number => v != null);
    result[axis] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  return result;
}
