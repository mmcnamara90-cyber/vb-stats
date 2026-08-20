import type { Player, PracticeDrill, PracticeStatEvent } from '../../types';
import {
  buildAggregateStatLine,
  buildInsights,
  buildPlayerStatLine,
  type AggregateStatLine,
  type Insight,
} from '../games/gameStats';

// Rule-based post-practice summary — computed entirely client-side from
// today's taps (same framing as GameInsightsTab: transparent thresholds, not
// a real AI/LLM call). See CLAUDE.md "Practice" for why this stayed
// rule-based rather than wired to a real Anthropic API call.

const MIN_HISTORICAL_ATTEMPTS = 3;
const MIN_HISTORICAL_SR_TAPS = 3;
const HITTING_COMPARISON_DELTA = 0.15; // 15-point swing vs. this drill's history
const SR_COMPARISON_DELTA = 0.4; // 0.4-point swing on the 0-3 scale

export interface DrillSummaryLine {
  drill: PracticeDrill;
  today: AggregateStatLine;
  eventCount: number;
  playerCount: number;
  comparisonNotes: string[]; // vs. this drill's history in prior practices, when there's enough history to say something
}

export interface PracticeSummary {
  totalEvents: number;
  playerCount: number;
  drillLines: DrillSummaryLine[];
  generalEventCount: number; // taps recorded with no drill selected
  playerInsights: Insight[];
}

// historicalEventsByDrillId: this drill's PracticeStatEvents from every
// OTHER practice (never today's practiceId) — used purely as a comparison
// baseline, not folded into "today"'s numbers.
export function buildPracticeSummary(
  todayEvents: PracticeStatEvent[],
  historicalEventsByDrillId: Map<string, PracticeStatEvent[]>,
  drillsById: Map<string, PracticeDrill>,
  rosterPlayers: Player[],
): PracticeSummary {
  const involvedPlayerIds = new Set(todayEvents.map((e) => e.playerId));
  const playerLines = rosterPlayers
    .filter((p) => involvedPlayerIds.has(p.id))
    .map((p) => buildPlayerStatLine(p, todayEvents));
  const playerInsights = buildInsights(playerLines);

  const drillIds = [...new Set(todayEvents.map((e) => e.drillId).filter((id): id is string => !!id))];
  const drillLines: DrillSummaryLine[] = drillIds
    .map((drillId): DrillSummaryLine | null => {
      const drill = drillsById.get(drillId);
      if (!drill) return null;
      const drillEvents = todayEvents.filter((e) => e.drillId === drillId);
      const today = buildAggregateStatLine(drillEvents);
      const historical = historicalEventsByDrillId.get(drillId) ?? [];
      const histLine = historical.length > 0 ? buildAggregateStatLine(historical) : undefined;

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
      };
    })
    .filter((d): d is DrillSummaryLine => d !== null)
    .sort((a, b) => b.eventCount - a.eventCount);

  return {
    totalEvents: todayEvents.length,
    playerCount: involvedPlayerIds.size,
    drillLines,
    generalEventCount: todayEvents.filter((e) => !e.drillId).length,
    playerInsights,
  };
}
