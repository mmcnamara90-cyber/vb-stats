import { db } from '../../db';
import type { Position, Skill, TryoutLevel } from '../../types';

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

// Player's per-skill average, scoped to a single tryout level (upper/lower).
// Same drill-then-skill averaging as computeTryoutComposites, just filtered
// down to sessions tagged with the given level first.
async function computeLevelScopedSkillAverages(): Promise<
  Map<TryoutLevel, Map<string, Partial<Record<Skill, number>>>>
> {
  const tryoutSessions = await db.sessions.where('type').equals('tryout').toArray();
  const levelBySessionId = new Map<string, TryoutLevel>();
  for (const s of tryoutSessions) if (s.level) levelBySessionId.set(s.id, s.level);

  const allScores = await db.skillScores.toArray();

  // level -> playerId -> drillId -> { sum, n, skill }
  const byLevel = new Map<TryoutLevel, Map<string, Map<string, { sum: number; n: number; skill: Skill }>>>();
  for (const s of allScores) {
    const level = levelBySessionId.get(s.sessionId);
    if (!level) continue;
    let byPlayer = byLevel.get(level);
    if (!byPlayer) {
      byPlayer = new Map();
      byLevel.set(level, byPlayer);
    }
    let drills = byPlayer.get(s.playerId);
    if (!drills) {
      drills = new Map();
      byPlayer.set(s.playerId, drills);
    }
    const entry = drills.get(s.drillId) ?? { sum: 0, n: 0, skill: s.skill };
    entry.sum += s.score;
    entry.n += 1;
    drills.set(s.drillId, entry);
  }

  const result = new Map<TryoutLevel, Map<string, Partial<Record<Skill, number>>>>();
  for (const [level, byPlayer] of byLevel) {
    const playerSkillAvgs = new Map<string, Partial<Record<Skill, number>>>();
    for (const [playerId, drills] of byPlayer) {
      const skillDrillAvgs = new Map<Skill, number[]>();
      for (const { sum, n, skill } of drills.values()) {
        const list = skillDrillAvgs.get(skill) ?? [];
        list.push(sum / n);
        skillDrillAvgs.set(skill, list);
      }
      const bySkill: Partial<Record<Skill, number>> = {};
      for (const [skill, avgs] of skillDrillAvgs) {
        bySkill[skill] = avgs.reduce((a, b) => a + b, 0) / avgs.length;
      }
      playerSkillAvgs.set(playerId, bySkill);
    }
    result.set(level, playerSkillAvgs);
  }
  return result;
}

export function benchmarkKey(level: TryoutLevel, position: Position, skill: Skill): string {
  return `${level}|${position}|${skill}`;
}

export interface BenchmarkSuggestion {
  suggestedValue: number;
  sampleSize: number; // number of players the suggestion is based on
}

// Computed top-10%-of-player-averages suggestion per level/position/skill.
// This is advisory only — it never overwrites a coach's manual Benchmark row.
export async function computeBenchmarkSuggestions(): Promise<Map<string, BenchmarkSuggestion>> {
  const [levelScoped, players] = await Promise.all([
    computeLevelScopedSkillAverages(),
    db.players.toArray(),
  ]);
  const positionsByPlayer = new Map(players.map((p) => [p.id, p.positions]));

  const result = new Map<string, BenchmarkSuggestion>();
  for (const [level, playerSkillAvgs] of levelScoped) {
    // position|skill -> list of player averages
    const pool = new Map<string, number[]>();
    for (const [playerId, bySkill] of playerSkillAvgs) {
      const positions = positionsByPlayer.get(playerId) ?? [];
      for (const position of positions) {
        for (const [skill, avg] of Object.entries(bySkill) as [Skill, number][]) {
          const key = `${position}|${skill}`;
          const list = pool.get(key) ?? [];
          list.push(avg);
          pool.set(key, list);
        }
      }
    }
    for (const [posSkillKey, avgs] of pool) {
      const [position, skill] = posSkillKey.split('|') as [Position, Skill];
      const sorted = [...avgs].sort((a, b) => b - a);
      const topN = Math.max(1, Math.ceil(sorted.length * 0.1));
      const top = sorted.slice(0, topN);
      result.set(benchmarkKey(level, position, skill), {
        suggestedValue: top.reduce((a, b) => a + b, 0) / top.length,
        sampleSize: sorted.length,
      });
    }
  }
  return result;
}

export interface HighScore {
  value: number;
  playerId: string;
  playerName: string;
}

// Best player-skill-average recorded this tryout cycle, per level/position/skill.
// Since this is the program's first year, "this year" is simply all recorded data.
export async function computeHighScores(): Promise<Map<string, HighScore>> {
  const [levelScoped, players] = await Promise.all([
    computeLevelScopedSkillAverages(),
    db.players.toArray(),
  ]);
  const playersById = new Map(players.map((p) => [p.id, p]));

  const result = new Map<string, HighScore>();
  for (const [level, playerSkillAvgs] of levelScoped) {
    for (const [playerId, bySkill] of playerSkillAvgs) {
      const player = playersById.get(playerId);
      if (!player) continue;
      for (const position of player.positions) {
        for (const [skill, avg] of Object.entries(bySkill) as [Skill, number][]) {
          const key = benchmarkKey(level, position, skill);
          const existing = result.get(key);
          if (!existing || avg > existing.value) {
            result.set(key, {
              value: avg,
              playerId,
              playerName: `${player.firstName} ${player.lastName}`,
            });
          }
        }
      }
    }
  }
  return result;
}
