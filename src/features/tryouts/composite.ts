import { db } from '../../db';
import type { Skill } from '../../types';

export interface CompositeResult {
  playerId: string;
  tapCount: number;
  overallAvg: number | null;
  bySkill: Partial<Record<Skill, number>>;
}

// Averages taps within a drill, then averages drill-scores within a skill,
// then averages skill-scores into one overall number. This keeps a skill
// with many drills (or a drill with many taps) from dominating the total.
export async function computeTryoutComposites(): Promise<Map<string, CompositeResult>> {
  const tryoutSessions = await db.sessions.where('type').equals('tryout').toArray();
  const sessionIds = new Set(tryoutSessions.map((s) => s.id));

  const allScores = await db.skillScores.toArray();
  const relevant = allScores.filter((s) => sessionIds.has(s.sessionId));

  const byPlayerDrill = new Map<string, Map<string, { sum: number; n: number; skill: Skill }>>();
  for (const s of relevant) {
    let drills = byPlayerDrill.get(s.playerId);
    if (!drills) {
      drills = new Map();
      byPlayerDrill.set(s.playerId, drills);
    }
    const entry = drills.get(s.drillId) ?? { sum: 0, n: 0, skill: s.skill };
    entry.sum += s.score;
    entry.n += 1;
    drills.set(s.drillId, entry);
  }

  const result = new Map<string, CompositeResult>();
  for (const [playerId, drills] of byPlayerDrill) {
    const skillDrillAvgs = new Map<Skill, number[]>();
    let tapCount = 0;
    for (const { sum, n, skill } of drills.values()) {
      tapCount += n;
      const list = skillDrillAvgs.get(skill) ?? [];
      list.push(sum / n);
      skillDrillAvgs.set(skill, list);
    }

    const bySkill: Partial<Record<Skill, number>> = {};
    const skillAvgs: number[] = [];
    for (const [skill, avgs] of skillDrillAvgs) {
      const skillAvg = avgs.reduce((a, b) => a + b, 0) / avgs.length;
      bySkill[skill] = skillAvg;
      skillAvgs.push(skillAvg);
    }

    result.set(playerId, {
      playerId,
      tapCount,
      overallAvg: skillAvgs.length ? skillAvgs.reduce((a, b) => a + b, 0) / skillAvgs.length : null,
      bySkill,
    });
  }
  return result;
}
