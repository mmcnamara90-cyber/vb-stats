import type { GameStatEvent, GameStatType, Player, Position } from '../../types';

// Which stat buttons a player's card shows, keyed off their tagged
// position(s) — a player tagged e.g. both OH and DS_L gets the union of
// both blocks (hitter buttons + serve receive), not a forced single role.
export interface PlayerStatRoles {
  hitter: boolean; // OH / MB / OPP: attack attempt, kill, attack error, + serve receive
  setter: boolean; // S: set attempt, assist (set that led to a kill)
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
  assist: 'Kill Off Set',
};

export function countEvents(events: GameStatEvent[], playerId: string, statType: GameStatType): number {
  return events.filter((e) => e.playerId === playerId && e.statType === statType).length;
}

export function serveReceiveAverage(events: GameStatEvent[], playerId: string): number | undefined {
  const taps = events.filter((e) => e.playerId === playerId && e.statType === 'serve_receive' && e.value != null);
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
  setAttempts: number;
  assists: number;
  settingConversionPct?: number; // assists / setAttempts
}

export function buildPlayerStatLine(player: Player, events: GameStatEvent[]): PlayerGameStatLine {
  const playerEvents = events.filter((e) => e.playerId === player.id);
  const attackAttempts = playerEvents.filter((e) => e.statType === 'attack_attempt').length;
  const kills = playerEvents.filter((e) => e.statType === 'kill').length;
  const attackErrors = playerEvents.filter((e) => e.statType === 'attack_error').length;
  const setAttempts = playerEvents.filter((e) => e.statType === 'set_attempt').length;
  const assists = playerEvents.filter((e) => e.statType === 'assist').length;
  const srTaps = playerEvents.filter((e) => e.statType === 'serve_receive' && e.value != null);

  return {
    player,
    attackAttempts,
    kills,
    attackErrors,
    hittingPct: attackAttempts > 0 ? (kills - attackErrors) / attackAttempts : undefined,
    serveReceiveAvg: srTaps.length > 0 ? srTaps.reduce((s, e) => s + (e.value ?? 0), 0) / srTaps.length : undefined,
    serveReceiveCount: srTaps.length,
    setAttempts,
    assists,
    settingConversionPct: setAttempts > 0 ? assists / setAttempts : undefined,
  };
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
const MIN_SET_ATTEMPTS = 3;
const GOOD_HITTING_PCT = 0.3;
const WATCH_HITTING_PCT = 0;
const GOOD_SR_AVG = 2.3;
const WATCH_SR_AVG = 1.5;
const GOOD_CONVERSION_PCT = 0.3;

export function buildInsights(lines: PlayerGameStatLine[]): Insight[] {
  const insights: Insight[] = [];
  const name = (l: PlayerGameStatLine) => `${l.player.firstName} ${l.player.lastName}`;

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
        insights.push({
          tone: 'watch',
          text: `${name(l)} is passing ${l.serveReceiveAvg.toFixed(1)} avg on serve receive (${l.serveReceiveCount} reps) — may need to be hidden in serve receive or get extra passing reps.`,
        });
      }
    }
    if (l.setAttempts >= MIN_SET_ATTEMPTS && l.settingConversionPct != null) {
      if (l.settingConversionPct >= GOOD_CONVERSION_PCT) {
        insights.push({
          tone: 'good',
          text: `${name(l)} is converting ${(l.settingConversionPct * 100).toFixed(0)}% of sets into kills (${l.assists}/${l.setAttempts}) — offense is running well through them.`,
        });
      }
    }
  }

  return insights;
}
