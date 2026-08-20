import type { GameLineup, GameStatEvent, GameStatType, Player, Position } from '../../types';
import { backRowSetterId, computeEffectiveCourt } from './effectiveCourt';

// The subset of a stat-event's fields these building blocks actually need —
// deliberately not the full GameStatEvent (which also carries gameId/
// setNumber/rotation, meaningless outside a game's rotation). Both
// GameStatEvent and PracticeStatEvent satisfy this shape structurally, so
// PracticeTrackTab.tsx can reuse countEvents/serveReceiveAverage/
// buildPlayerStatLine/buildPlayerTrends as-is. Only the rotation-aware
// functions below (computeAssistCredits, buildRotation*) stay GameStatEvent-
// only, since practices have no rotation/lineup to key off of.
export interface MinimalStatEvent {
  playerId: string;
  statType: GameStatType;
  value?: number;
  createdAt: string;
}

// Which stat buttons a player's card shows, keyed off their tagged
// position(s) — a player tagged e.g. both OH and DS_L gets the union of
// both blocks (hitter buttons + serve receive), not a forced single role.
// Assist is deliberately NOT role-gated here — every on-court player gets
// that button (see LiveStatsTab), since a dig-and-set or a broken play can
// come from anyone, not just the tagged Setter.
export interface PlayerStatRoles {
  hitter: boolean; // OH / MB / OPP: attack attempt, kill, attack error, + serve receive
  setter: boolean; // S: also gets attack attempt/kill/error (setters attack too)
  passer: boolean; // DS_L: serve receive only
}

export function statRolesForPositions(positions: Position[]): PlayerStatRoles {
  return {
    hitter: positions.some((p) => p === 'OH' || p === 'MB' || p === 'OPP'),
    setter: positions.includes('S'),
    passer: positions.includes('DS_L'),
  };
}

export const GAME_STAT_LABELS: Record<GameStatType, string> = {
  attack_attempt: 'Attempt',
  kill: 'Kill',
  attack_error: 'Error',
  serve_receive: 'Serve Receive',
  set_attempt: 'Set Attempt',
  assist: 'Assist',
  serve: 'Serve',
};

export function countEvents(events: MinimalStatEvent[], playerId: string, statType: GameStatType): number {
  return events.filter((e) => e.playerId === playerId && e.statType === statType).length;
}

export function serveReceiveAverage(events: MinimalStatEvent[], playerId: string): number | undefined {
  const taps = events.filter((e) => e.playerId === playerId && e.statType === 'serve_receive' && e.value != null);
  if (taps.length === 0) return undefined;
  return taps.reduce((sum, e) => sum + (e.value ?? 0), 0) / taps.length;
}

export function serveAverage(events: MinimalStatEvent[], playerId: string): number | undefined {
  const taps = events.filter((e) => e.playerId === playerId && e.statType === 'serve' && e.value != null);
  if (taps.length === 0) return undefined;
  return taps.reduce((sum, e) => sum + (e.value ?? 0), 0) / taps.length;
}

export interface PlayerGameStatLine {
  player: Player;
  attackAttempts: number;
  kills: number;
  attackErrors: number;
  hittingPct?: number; // (kills - errors) / attempts
  serveReceiveAvg?: number;
  serveReceiveCount: number;
  serveAvg?: number;
  serveCount: number;
  setAttempts: number; // historical only — no UI writes this anymore
  assists: number; // raw explicit Assist taps; see computeAssistCredits for the credit-adjusted total
  settingConversionPct?: number; // assists / setAttempts — historical only
}

// A team/group-level line with the same math as PlayerGameStatLine but no
// single `player` attached — used for drill- or practice-level rollups
// (e.g. "how did the whole group hit in this drill today") where the
// events passed in are already scoped to whatever group is being summarized,
// rather than filtered down to one player's own taps.
export interface AggregateStatLine {
  attackAttempts: number;
  kills: number;
  attackErrors: number;
  hittingPct?: number;
  serveReceiveAvg?: number;
  serveReceiveCount: number;
  assists: number;
}

export function buildAggregateStatLine(events: MinimalStatEvent[]): AggregateStatLine {
  const attackAttempts = events.filter((e) => e.statType === 'attack_attempt').length;
  const kills = events.filter((e) => e.statType === 'kill').length;
  const attackErrors = events.filter((e) => e.statType === 'attack_error').length;
  const assists = events.filter((e) => e.statType === 'assist').length;
  const srTaps = events.filter((e) => e.statType === 'serve_receive' && e.value != null);

  return {
    attackAttempts,
    kills,
    attackErrors,
    hittingPct: attackAttempts > 0 ? (kills - attackErrors) / attackAttempts : undefined,
    serveReceiveAvg: srTaps.length > 0 ? srTaps.reduce((s, e) => s + (e.value ?? 0), 0) / srTaps.length : undefined,
    serveReceiveCount: srTaps.length,
    assists,
  };
}

export function buildPlayerStatLine(player: Player, events: MinimalStatEvent[]): PlayerGameStatLine {
  const playerEvents = events.filter((e) => e.playerId === player.id);
  const attackAttempts = playerEvents.filter((e) => e.statType === 'attack_attempt').length;
  const kills = playerEvents.filter((e) => e.statType === 'kill').length;
  const attackErrors = playerEvents.filter((e) => e.statType === 'attack_error').length;
  const setAttempts = playerEvents.filter((e) => e.statType === 'set_attempt').length;
  const assists = playerEvents.filter((e) => e.statType === 'assist').length;
  const srTaps = playerEvents.filter((e) => e.statType === 'serve_receive' && e.value != null);
  const serveTaps = playerEvents.filter((e) => e.statType === 'serve' && e.value != null);

  return {
    player,
    attackAttempts,
    kills,
    attackErrors,
    hittingPct: attackAttempts > 0 ? (kills - attackErrors) / attackAttempts : undefined,
    serveReceiveAvg: srTaps.length > 0 ? srTaps.reduce((s, e) => s + (e.value ?? 0), 0) / srTaps.length : undefined,
    serveReceiveCount: srTaps.length,
    serveAvg: serveTaps.length > 0 ? serveTaps.reduce((s, e) => s + (e.value ?? 0), 0) / serveTaps.length : undefined,
    serveCount: serveTaps.length,
    setAttempts,
    assists,
    settingConversionPct: setAttempts > 0 ? assists / setAttempts : undefined,
  };
}

// ===== Assist crediting =====
// There's no per-rally linking in this data model (a Kill tap and an
// Assist tap are independent rows), so "the back-row setter gets the
// assist unless otherwise specified" is computed here rather than
// requiring a tap for every single kill. For each (set, rotation) bucket:
// explicit Assist taps always credit whoever they were tapped for; any
// remaining kills beyond that (killCount - explicitAssistCount, when
// positive) are credited to that rotation's sole back-row Setter, if one
// is unambiguous. This means the common case (the on-court setter ran the
// offense) needs zero extra taps, while a broken play someone else set
// just needs one Assist tap on the right player to redirect credit.
export function computeAssistCredits(
  events: GameStatEvent[],
  lineups: GameLineup[],
  playersById: Map<string, Player>,
): Map<string, number> {
  const credits = new Map<string, number>();
  const add = (id: string, n: number) => credits.set(id, (credits.get(id) ?? 0) + n);

  for (const e of events) {
    if (e.statType === 'assist') add(e.playerId, 1);
  }

  const bucketKeys = new Set<string>();
  for (const e of events) {
    if (e.statType === 'kill' && e.rotation != null) bucketKeys.add(`${e.setNumber}:${e.rotation}`);
  }

  for (const key of bucketKeys) {
    const [setNumberStr, rotationStr] = key.split(':');
    const setNumber = Number(setNumberStr);
    const rotation = Number(rotationStr) as 1 | 2 | 3 | 4 | 5 | 6;
    const killCount = events.filter((e) => e.statType === 'kill' && e.setNumber === setNumber && e.rotation === rotation).length;
    const explicitAssistCount = events.filter(
      (e) => e.statType === 'assist' && e.setNumber === setNumber && e.rotation === rotation,
    ).length;
    const gap = killCount - explicitAssistCount;
    if (gap <= 0) continue;
    const lineup = lineups.find((l) => l.setNumber === setNumber);
    if (!lineup) continue;
    const effective = computeEffectiveCourt(lineup, rotation);
    const setterId = backRowSetterId(effective.zoneAssignments, playersById);
    if (setterId) add(setterId, gap);
  }

  return credits;
}

export type InsightTone = 'good' | 'watch';

export interface Insight {
  tone: InsightTone;
  text: string;
}

// Simple, transparent, rule-of-thumb thresholds — not a real AI call (see
// GameInsightsTab.tsx for the framing shown to the coach). Computed
// entirely client-side from taps entered live, so it's ready instantly and
// needs no API key/backend.
const MIN_ATTACK_ATTEMPTS = 3;
const MIN_SR_TAPS = 3;
const MIN_ASSISTS_FOR_CALLOUT = 5;
const GOOD_HITTING_PCT = 0.3;
const WATCH_HITTING_PCT = 0;
const GOOD_SR_AVG = 2.3;
const WATCH_SR_AVG = 1.5;

// ===== Rotation-level breakdowns =====
// Every gameStatEvent carries `rotation` already (see LiveStatsTab), so
// these are just groupings of the same taps by that field instead of by
// player. Note this is a proxy for "offense scoring" — the app doesn't
// track rally outcomes/points, so "which rotation scores more" reads as
// kills/hitting% recorded while that rotation was live, not actual side-out
// or point totals from a scoreboard.
const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;

export interface RotationOffenseLine {
  rotation: number;
  attempts: number;
  kills: number;
  errors: number;
  hittingPct?: number;
}

export function buildRotationOffenseLines(events: GameStatEvent[]): RotationOffenseLine[] {
  return ROTATIONS.map((rotation) => {
    const rEvents = events.filter((e) => e.rotation === rotation);
    const attempts = rEvents.filter((e) => e.statType === 'attack_attempt').length;
    const kills = rEvents.filter((e) => e.statType === 'kill').length;
    const errors = rEvents.filter((e) => e.statType === 'attack_error').length;
    return { rotation, attempts, kills, errors, hittingPct: attempts > 0 ? (kills - errors) / attempts : undefined };
  });
}

export interface RotationServeReceiveLine {
  rotation: number;
  avg?: number;
  count: number;
}

export function buildRotationServeReceiveLines(events: GameStatEvent[]): RotationServeReceiveLine[] {
  return ROTATIONS.map((rotation) => {
    const taps = events.filter((e) => e.rotation === rotation && e.statType === 'serve_receive' && e.value != null);
    return {
      rotation,
      avg: taps.length > 0 ? taps.reduce((s, e) => s + (e.value ?? 0), 0) / taps.length : undefined,
      count: taps.length,
    };
  });
}

const MIN_ROTATION_ATTACK_ATTEMPTS = 3;
const MIN_ROTATION_SR_TAPS = 3;

// Best/worst-rotation callouts, only from rotations with enough reps to be
// meaningful, and only when there's more than one qualifying rotation to
// compare (a single-rotation "best" isn't an insight, it's just the only
// data point).
export function buildRotationInsights(events: GameStatEvent[]): Insight[] {
  const insights: Insight[] = [];

  const offense = buildRotationOffenseLines(events).filter((r) => r.attempts >= MIN_ROTATION_ATTACK_ATTEMPTS);
  if (offense.length > 1) {
    const best = offense.reduce((a, b) => ((b.hittingPct ?? -Infinity) > (a.hittingPct ?? -Infinity) ? b : a));
    const worst = offense.reduce((a, b) => ((b.hittingPct ?? Infinity) < (a.hittingPct ?? Infinity) ? b : a));
    if (best.hittingPct != null) {
      insights.push({
        tone: 'good',
        text: `Rotation ${best.rotation} is your most productive offensively: ${(best.hittingPct * 100).toFixed(0)}% hitting (${best.kills}k/${best.errors}e on ${best.attempts} attempts).`,
      });
    }
    if (worst.hittingPct != null && worst.rotation !== best.rotation) {
      insights.push({
        tone: 'watch',
        text: `Rotation ${worst.rotation} is your weakest offensively: ${(worst.hittingPct * 100).toFixed(0)}% hitting (${worst.kills}k/${worst.errors}e on ${worst.attempts} attempts) — worth a look at what's happening in that rotation.`,
      });
    }
  }

  const sr = buildRotationServeReceiveLines(events).filter((r) => r.count >= MIN_ROTATION_SR_TAPS);
  if (sr.length > 1) {
    const best = sr.reduce((a, b) => ((b.avg ?? -Infinity) > (a.avg ?? -Infinity) ? b : a));
    const worst = sr.reduce((a, b) => ((b.avg ?? Infinity) < (a.avg ?? Infinity) ? b : a));
    if (best.avg != null) {
      insights.push({
        tone: 'good',
        text: `Rotation ${best.rotation} passes best: ${best.avg.toFixed(1)} avg serve receive (${best.count} reps).`,
      });
    }
    if (worst.avg != null && worst.rotation !== best.rotation) {
      insights.push({
        tone: 'watch',
        text: `Rotation ${worst.rotation} struggles in serve receive: ${worst.avg.toFixed(1)} avg (${worst.count} reps) — worth checking who's passing and whether the formation should change for that rotation.`,
      });
    }
  }

  return insights;
}

// ===== Trending players (early vs. late within this game's recorded taps) =====
// There's no cross-game history plumbed into this tab (Insights is scoped
// to one game's gameStatEvents), so "rising/falling" reads as "better or
// worse in the second half of what's been tapped in tonight vs. the
// first half" — a within-game trend, not a multi-game trajectory.

export type TrendMetric = 'hitting' | 'serve_receive' | 'setting';
export type TrendDirection = 'rising' | 'falling';

export interface PlayerTrend {
  player: Player;
  metric: TrendMetric;
  direction: TrendDirection;
  earlyValue: number;
  lateValue: number;
  earlySamples: number;
  lateSamples: number;
}

const MIN_TREND_SAMPLES_PER_HALF = 3;
const HITTING_TREND_DELTA = 0.2; // 20-point swing in hitting/conversion %
const SR_TREND_DELTA = 0.5; // half-point swing on the 0-3 scale

function splitInHalf<T>(items: T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

function trendForMetric(
  chronological: GameStatEvent[],
  types: GameStatType[],
  computeMetric: (subset: GameStatEvent[]) => number | undefined,
): { early: number; late: number; earlyN: number; lateN: number } | undefined {
  const relevant = chronological.filter((e) => types.includes(e.statType));
  if (relevant.length < MIN_TREND_SAMPLES_PER_HALF * 2) return undefined;
  const [early, late] = splitInHalf(relevant);
  const earlyVal = computeMetric(early);
  const lateVal = computeMetric(late);
  if (earlyVal == null || lateVal == null) return undefined;
  return { early: earlyVal, late: lateVal, earlyN: early.length, lateN: late.length };
}

export function buildPlayerTrends(players: Player[], events: GameStatEvent[]): PlayerTrend[] {
  const trends: PlayerTrend[] = [];

  for (const player of players) {
    const chronological = events
      .filter((e) => e.playerId === player.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const roles = statRolesForPositions(player.positions);

    if (roles.hitter) {
      const result = trendForMetric(chronological, ['attack_attempt', 'kill', 'attack_error'], (subset) => {
        const attempts = subset.filter((e) => e.statType === 'attack_attempt').length;
        if (attempts === 0) return undefined;
        const kills = subset.filter((e) => e.statType === 'kill').length;
        const errors = subset.filter((e) => e.statType === 'attack_error').length;
        return (kills - errors) / attempts;
      });
      if (result && Math.abs(result.late - result.early) >= HITTING_TREND_DELTA) {
        trends.push({
          player,
          metric: 'hitting',
          direction: result.late > result.early ? 'rising' : 'falling',
          earlyValue: result.early,
          lateValue: result.late,
          earlySamples: result.earlyN,
          lateSamples: result.lateN,
        });
      }
    }

    if (roles.hitter || roles.passer) {
      const result = trendForMetric(chronological, ['serve_receive'], (subset) => {
        const taps = subset.filter((e) => e.value != null);
        if (taps.length === 0) return undefined;
        return taps.reduce((s, e) => s + (e.value ?? 0), 0) / taps.length;
      });
      if (result && Math.abs(result.late - result.early) >= SR_TREND_DELTA) {
        trends.push({
          player,
          metric: 'serve_receive',
          direction: result.late > result.early ? 'rising' : 'falling',
          earlyValue: result.early,
          lateValue: result.late,
          earlySamples: result.earlyN,
          lateSamples: result.lateN,
        });
      }
    }

    if (roles.setter) {
      const result = trendForMetric(chronological, ['set_attempt', 'assist'], (subset) => {
        const attempts = subset.filter((e) => e.statType === 'set_attempt').length;
        if (attempts === 0) return undefined;
        const assists = subset.filter((e) => e.statType === 'assist').length;
        return assists / attempts;
      });
      if (result && Math.abs(result.late - result.early) >= HITTING_TREND_DELTA) {
        trends.push({
          player,
          metric: 'setting',
          direction: result.late > result.early ? 'rising' : 'falling',
          earlyValue: result.early,
          lateValue: result.late,
          earlySamples: result.earlyN,
          lateSamples: result.lateN,
        });
      }
    }
  }

  return trends;
}

export function describePlayerTrend(t: PlayerTrend): string {
  const name = `${t.player.firstName} ${t.player.lastName}`;
  const arrow = t.direction === 'rising' ? '📈' : '📉';
  const verb = t.direction === 'rising' ? 'trending up' : 'trending down';
  if (t.metric === 'hitting') {
    return `${arrow} ${name} is ${verb} hitting — ${(t.earlyValue * 100).toFixed(0)}% early vs. ${(t.lateValue * 100).toFixed(0)}% more recently.`;
  }
  if (t.metric === 'serve_receive') {
    return `${arrow} ${name} is ${verb} on serve receive — ${t.earlyValue.toFixed(1)} avg early vs. ${t.lateValue.toFixed(1)} avg more recently.`;
  }
  return `${arrow} ${name} is ${verb} on setting conversion — ${(t.earlyValue * 100).toFixed(0)}% early vs. ${(t.lateValue * 100).toFixed(0)}% more recently.`;
}

// How far below the team's own SR average counts as "notably weaker" —
// used to decide whether "hide her" is a realistic suggestion (only if
// teammates are meaningfully stronger) rather than generic advice repeated
// on every card regardless of whether anyone's actually available to cover.
const HIDE_SUGGESTION_DELTA_BELOW_TEAM = 0.3;
const MIN_SR_LINES_FOR_TEAM_NOTE = 2;

export function buildInsights(lines: PlayerGameStatLine[]): Insight[] {
  const insights: Insight[] = [];
  const name = (l: PlayerGameStatLine) => `${l.player.firstName} ${l.player.lastName}`;

  // Team-wide serve-receive context. Every low passer used to get the same
  // "may need to be hidden in serve receive" line regardless of role or
  // whether the roster actually has anyone better to hide her behind — on a
  // small/young roster that's often nobody, and DS/Libero-tagged players
  // can't be "hidden" from serve receive at all, since passing is their
  // whole job. This context lets each low-SR player get advice that's
  // actually actionable for them.
  const srLines = lines.filter((l) => l.serveReceiveCount >= MIN_SR_TAPS && l.serveReceiveAvg != null);
  const teamSrAvg =
    srLines.length > 0 ? srLines.reduce((s, l) => s + (l.serveReceiveAvg ?? 0), 0) / srLines.length : undefined;
  const strongPasserExists = srLines.some((l) => (l.serveReceiveAvg ?? 0) >= GOOD_SR_AVG);

  for (const l of lines) {
    if (l.attackAttempts >= MIN_ATTACK_ATTEMPTS && l.hittingPct != null) {
      if (l.hittingPct >= GOOD_HITTING_PCT) {
        insights.push({
          tone: 'good',
          text: `${name(l)} is hitting ${(l.hittingPct * 100).toFixed(0)}% (${l.kills}k/${l.attackErrors}e on ${l.attackAttempts} attempts) — a real weapon right now.`,
        });
      } else if (l.hittingPct <= WATCH_HITTING_PCT) {
        insights.push({
          tone: 'watch',
          text: `${name(l)} has more errors than kills (${l.kills}k/${l.attackErrors}e on ${l.attackAttempts} attempts) — worth a look, maybe a shot-selection or set-location fix.`,
        });
      }
    }
    if (l.serveReceiveCount >= MIN_SR_TAPS && l.serveReceiveAvg != null) {
      if (l.serveReceiveAvg >= GOOD_SR_AVG) {
        insights.push({
          tone: 'good',
          text: `${name(l)} is passing ${l.serveReceiveAvg.toFixed(1)} avg on serve receive (${l.serveReceiveCount} reps) — reliable option in the rotation.`,
        });
      } else if (l.serveReceiveAvg <= WATCH_SR_AVG) {
        const roles = statRolesForPositions(l.player.positions);
        const isPrimaryPasser = roles.passer && !roles.hitter;
        const meaningfullyBelowTeam =
          teamSrAvg != null && teamSrAvg - l.serveReceiveAvg >= HIDE_SUGGESTION_DELTA_BELOW_TEAM;

        if (isPrimaryPasser) {
          // She's a DS/Libero — passing is the role, not a rotation to hide
          // from. The fix is reps and technique, not lineup gymnastics.
          insights.push({
            tone: 'watch',
            text: `${name(l)} is passing ${l.serveReceiveAvg.toFixed(1)} avg on serve receive (${l.serveReceiveCount} reps) — this is her primary role, so the move is targeted reps on platform/footwork, not trying to hide her.`,
          });
        } else if (strongPasserExists && meaningfullyBelowTeam) {
          // A realistic "hide her" case: at least one teammate is passing
          // well and this player is clearly behind the team's own average.
          insights.push({
            tone: 'watch',
            text: `${name(l)} is passing ${l.serveReceiveAvg.toFixed(1)} avg on serve receive (${l.serveReceiveCount} reps) — worth hiding her in serve receive if the lineup allows it, or targeting extra reps.`,
          });
        } else {
          // Nobody's clearly stronger to hide behind (or she's not far off
          // the team's own average) — hiding isn't a real option, so don't
          // suggest it.
          insights.push({
            tone: 'watch',
            text: `${name(l)} is passing ${l.serveReceiveAvg.toFixed(1)} avg on serve receive (${l.serveReceiveCount} reps) — worth extra reps; the roster doesn't have a clearly stronger passer to lean on yet, so hiding isn't really an option.`,
          });
        }
      }
    }
    if (l.assists >= MIN_ASSISTS_FOR_CALLOUT) {
      insights.push({
        tone: 'good',
        text: `${name(l)} is running the offense — ${l.assists} assists (kills off their sets) so far.`,
      });
    }
  }

  // One team-level note instead of repeating the same complaint on every
  // card when the whole group is passing similarly low — that's a practice
  // focus, not an individual problem.
  if (teamSrAvg != null && teamSrAvg <= WATCH_SR_AVG && srLines.length >= MIN_SR_LINES_FOR_TEAM_NOTE) {
    insights.push({
      tone: 'watch',
      text: `Team is passing ${teamSrAvg.toFixed(1)} avg on serve receive as a group (${srLines.length} players with reps) — likely worth a dedicated passing focus in practice rather than moving players around.`,
    });
  }

  return insights;
}
