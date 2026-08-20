import type { Player, PracticeDrill, PracticeDrillLog, PracticeStatEvent } from '../../types';
import {
  buildAggregateStatLine,
  buildInsights,
  buildPlayerStatLine,
  type AggregateStatLine,
  type Insight,
} from '../games/gameStats';

// Rule-based post-practice summary — computed entirely client-side from
// today's taps and drill logs (same framing as GameInsightsTab: transparent
// thresholds, not a real AI/LLM call). See CLAUDE.md "Practice" for why this
// stayed rule-based rather than wired to a real Anthropic API call. The
// duration/payoff/notes captured per drill (PracticeDrillLog, logged from
// the Plan tab) are exactly the structured input a future real-AI summary
// would want alongside the raw stat taps — feeding them into this rule-based
// version now means that data already exists if/when that upgrade happens.

const MIN_HISTORICAL_ATTEMPTS = 3;
const MIN_HISTORICAL_SR_TAPS = 3;
const HITTING_COMPARISON_DELTA = 0.15; // 15-point swing vs. this drill's history
const SR_COMPARISON_DELTA = 0.4; // 0.4-point swing on the 0-3 scale
const LOW_PAYOFF_TIME_SHARE = 0.4; // 40%+ of logged minutes rated "low" payoff

export interface DrillSummaryLine {
  drill: PracticeDrill;
  today: AggregateStatLine;
  eventCount: number;
  playerCount: number;
  comparisonNotes: string[]; // vs. this drill's history in prior practices, when there's enough history to say something
  durationMinutes?: number;
  payoff?: PracticeDrillLog['payoff'];
  notes?: string;
  followUp: boolean;
}

export interface PracticeSummary {
  totalEvents: number;
  playerCount: number;
  drillLines: DrillSummaryLine[];
  generalEventCount: number; // taps recorded with no drill selected
  totalLoggedMinutes?: number;
  playerInsights: Insight[];
  practiceInsights: Insight[]; // separate from playerInsights — about drills/time, not individual players
}

// historicalEventsByDrillId: this drill's PracticeStatEvents from every
// OTHER practice (never today's practiceId) — used purely as a comparison
// baseline, not folded into "today"'s numbers.
export function buildPracticeSummary(
  todayEvents: PracticeStatEvent[],
  historicalEventsByDrillId: Map<string, PracticeStatEvent[]>,
  drillsById: Map<string, PracticeDrill>,
  rosterPlayers: Player[],
  logsByDrillId: Map<string, PracticeDrillLog> = new Map(),
): PracticeSummary {
  const involvedPlayerIds = new Set(todayEvents.map((e) => e.playerId));
  const playerLines = rosterPlayers
    .filter((p) => involvedPlayerIds.has(p.id))
    .map((p) => buildPlayerStatLine(p, todayEvents));
  const playerInsights = buildInsights(playerLines);

  // A drill can show up here because it has taps today, a log entry (time/
  // payoff/notes), or both — a warm-up or scrimmage drill the coach logged
  // but didn't tap individual stats for should still appear.
  const eventDrillIds = todayEvents.map((e) => e.drillId).filter((id): id is string => !!id);
  const logDrillIds = [...logsByDrillId.keys()];
  const drillIds = [...new Set([...eventDrillIds, ...logDrillIds])];

  const drillLines: DrillSummaryLine[] = drillIds
    .map((drillId): DrillSummaryLine | null => {
      const drill = drillsById.get(drillId);
      if (!drill) return null;
      const drillEvents = todayEvents.filter((e) => e.drillId === drillId);
      const today = buildAggregateStatLine(drillEvents);
      const historical = historicalEventsByDrillId.get(drillId) ?? [];
      const histLine = historical.length > 0 ? buildAggregateStatLine(historical) : undefined;
      const log = logsByDrillId.get(drillId);

      const comparisonNotes: string[] = [];
      if (
        histLine?.hittingPct != null &&
        today.hittingPct != null &&
        histLine.attackAttempts >= MIN_HISTORICAL_ATTEMPTS
      ) {
        const delta = today.hittingPct - histLine.hittingPct;
        if (Math.abs(delta) >= HITTING_COMPARISON_DELTA) {
          comparisonNotes.push(
            `Hitting ${(today.hittingPct * 100).toFixed(0)}% today vs. ${(histLine.hittingPct * 100).toFixed(0)}% historically in this drill (${delta > 0 ? 'up' : 'down'} ${Math.abs(delta * 100).toFixed(0)} pts).`,
          );
        }
      }
      if (
        histLine?.serveReceiveAvg != null &&
        today.serveReceiveAvg != null &&
        histLine.serveReceiveCount >= MIN_HISTORICAL_SR_TAPS
      ) {
        const delta = today.serveReceiveAvg - histLine.serveReceiveAvg;
        if (Math.abs(delta) >= SR_COMPARISON_DELTA) {
          comparisonNotes.push(
            `Serve receive ${today.serveReceiveAvg.toFixed(1)} avg today vs. ${histLine.serveReceiveAvg.toFixed(1)} avg historically in this drill (${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)}).`,
          );
        }
      }

      return {
        drill,
        today,
        eventCount: drillEvents.length,
        playerCount: new Set(drillEvents.map((e) => e.playerId)).size,
        comparisonNotes,
        durationMinutes: log?.durationMinutes,
        payoff: log?.payoff,
        notes: log?.notes,
        followUp: log?.followUp ?? false,
      };
    })
    .filter((d): d is DrillSummaryLine => d !== null)
    .sort((a, b) => b.eventCount - a.eventCount);

  const practiceInsights: Insight[] = [];
  const timedLines = drillLines.filter((d) => d.durationMinutes != null && d.durationMinutes > 0);
  const totalLoggedMinutes = timedLines.length > 0 ? timedLines.reduce((s, d) => s + (d.durationMinutes ?? 0), 0) : undefined;
  if (totalLoggedMinutes) {
    const lowPayoffMinutes = timedLines
      .filter((d) => d.payoff === 'low')
      .reduce((s, d) => s + (d.durationMinutes ?? 0), 0);
    if (lowPayoffMinutes / totalLoggedMinutes >= LOW_PAYOFF_TIME_SHARE) {
      practiceInsights.push({
        tone: 'watch',
        text: `${lowPayoffMinutes} of ${totalLoggedMinutes} logged minutes today were in drills rated "low" payoff — worth reconsidering that time next practice.`,
      });
    }
  }
  const followUps = drillLines.filter((d) => d.followUp);
  if (followUps.length > 0) {
    practiceInsights.push({
      tone: 'watch',
      text: `Flagged for follow-up: ${followUps.map((d) => d.drill.name).join(', ')}.`,
    });
  }

  return {
    totalEvents: todayEvents.length,
    playerCount: involvedPlayerIds.size,
    drillLines,
    generalEventCount: todayEvents.filter((e) => !e.drillId).length,
    totalLoggedMinutes,
    playerInsights,
    practiceInsights,
  };
}
