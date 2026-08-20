import type { CaptainBallot, CaptainVoteRanking } from '../../types';

// ===== Ballot question option lists =====
// Carried over from the program's previous Google Form (two screenshots
// shared by the coach): a general "what matters to you in a captain"
// checklist, kept close to the original wording/options, and a shorter
// "why did you pick them" reasons list, asked once per ranked pick instead
// of once total — the old form only ever captured a single top choice.

export const CAPTAIN_QUALITIES = [
  'On-court leadership',
  'Practice leadership',
  'Plans team social events',
  'Leads strategy',
  'Talks during timeouts',
  'Energetic',
  'Loud',
  'Believes in their team',
  'Humble & confident',
] as const;

export type CaptainQuality = (typeof CAPTAIN_QUALITIES)[number];

export const CAPTAIN_VOTE_REASONS = [
  'Leadership',
  'Spirit',
  'Focus during practice',
  'Inspirational',
  'Role model',
  'Improves team morale',
  'Playing ability',
] as const;

export type CaptainVoteReason = (typeof CAPTAIN_VOTE_REASONS)[number];

// Ranked-choice scoring: 1st = 3 points, 2nd = 2, 3rd = 1 (a simple Borda
// count) — good enough for picking a captain among ~10 players without the
// complexity of full instant-runoff. Documented here since it's the one
// number that isn't self-evident from the raw ballots.
const RANK_POINTS: Record<1 | 2 | 3, number> = { 1: 3, 2: 2, 3: 1 };

export interface CaptainCandidateResult {
  playerId: string;
  points: number;
  firstPlaceVotes: number;
  mentionCount: number;       // how many ballots ranked this player at all (1st-3rd)
  reasonCounts: Partial<Record<CaptainVoteReason, number>>;
}

// Aggregates every submitted ballot into per-candidate scores, sorted
// highest-points first (ties broken by first-place-vote count, then
// mention count). Anonymous by design — takes ballots in, never returns
// anything keyed by voterId.
export function computeCaptainResults(ballots: CaptainBallot[]): CaptainCandidateResult[] {
  const byPlayer = new Map<string, CaptainCandidateResult>();

  function entryFor(playerId: string): CaptainCandidateResult {
    let entry = byPlayer.get(playerId);
    if (!entry) {
      entry = { playerId, points: 0, firstPlaceVotes: 0, mentionCount: 0, reasonCounts: {} };
      byPlayer.set(playerId, entry);
    }
    return entry;
  }

  for (const ballot of ballots) {
    for (const ranking of ballot.rankings) {
      const entry = entryFor(ranking.playerId);
      entry.points += RANK_POINTS[ranking.rank] ?? 0;
      entry.mentionCount += 1;
      if (ranking.rank === 1) entry.firstPlaceVotes += 1;
      for (const reason of ranking.reasons as CaptainVoteReason[]) {
        entry.reasonCounts[reason] = (entry.reasonCounts[reason] ?? 0) + 1;
      }
    }
  }

  return [...byPlayer.values()].sort(
    (a, b) => b.points - a.points || b.firstPlaceVotes - a.firstPlaceVotes || b.mentionCount - a.mentionCount
  );
}

// Team-wide tally of the "what matters to you in a captain" checklist —
// not per-candidate, just how many voters (out of however many have
// submitted) checked each quality. Useful as its own standalone insight
// ("here's what your team values in a captain") independent of who wins.
export function computeQualityTallies(ballots: CaptainBallot[]): { quality: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const ballot of ballots) {
    for (const q of ballot.qualities) counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  return [...counts.entries()].map(([quality, count]) => ({ quality, count })).sort((a, b) => b.count - a.count);
}

// Every playerId this ballot ranks — used to enforce "no duplicate picks
// across rank 1/2/3" client-side while building a ballot.
export function rankedPlayerIds(rankings: CaptainVoteRanking[]): Set<string> {
  return new Set(rankings.map((r) => r.playerId));
}
