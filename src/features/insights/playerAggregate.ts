import { supabase } from '../../lib/supabaseClient';
import type { Game, GameLineup, GameStatEvent, Player, Practice, PracticeStatEvent } from '../../types';
import { TEAM_LABELS } from '../tryouts/teams';
import { buildPlayerStatLine, computeAssistCredits, type MinimalStatEvent, type PlayerGameStatLine } from '../games/gameStats';

export interface SessionRow {
  id: string;
  date: string;
  type: 'game' | 'practice';
  label: string; // "vs. X (Team)" or the practice label
  line: PlayerGameStatLine;
}

export interface PlayerAggregateResult {
  line: PlayerGameStatLine;
  sessions: SessionRow[];
  gameCount: number;
  practiceCount: number;
}

export interface PlayerAggregateOpts {
  fromDate?: string;
  toDate?: string;
  includeGames?: boolean;
  includePractices?: boolean;
}

// Shared by both the Player Insights profile view (one player, with date
// range + source filters) and the roster-grid overview (15 players, always
// all-time + both sources, no filters). Pulled out of PlayerInsightsScreen so
// both call sites share the exact same fetch + assist-crediting logic rather
// than drifting apart.
//
// computeAssistCredits buckets by set+rotation, which only makes sense within
// one game's own lineups — called once per game and summed, never passed
// every game's events/lineups together (see CLAUDE.md Player Insights notes).
export async function fetchPlayerAggregate(
  player: Player,
  playersById: Map<string, Player>,
  opts: PlayerAggregateOpts = {},
): Promise<PlayerAggregateResult> {
  const { fromDate = '', toDate = '', includeGames = true, includePractices = true } = opts;

  const [{ data: gamesData }, { data: practicesData }] = await Promise.all([
    includeGames
      ? supabase.from('games').select('*').contains('rosterPlayerIds', [player.id])
      : Promise.resolve({ data: [] as Game[] }),
    includePractices
      ? supabase.from('practices').select('*').contains('rosterPlayerIds', [player.id])
      : Promise.resolve({ data: [] as Practice[] }),
  ]);
  const games = (gamesData as Game[]) ?? [];
  const practices = (practicesData as Practice[]) ?? [];

  const inRangeGames = games
    .filter((g) => (!fromDate || g.date >= fromDate) && (!toDate || g.date <= toDate))
    .sort((a, b) => a.date.localeCompare(b.date));
  const gameIds = inRangeGames.map((g) => g.id);
  const inRangePractices = practices
    .filter((p) => (!fromDate || p.date >= fromDate) && (!toDate || p.date <= toDate))
    .sort((a, b) => a.date.localeCompare(b.date));
  const practiceIds = inRangePractices.map((p) => p.id);

  const [{ data: eventsData }, { data: lineupsData }, { data: practiceEventsData }] = await Promise.all([
    gameIds.length > 0
      ? supabase.from('gameStatEvents').select('*').in('gameId', gameIds)
      : Promise.resolve({ data: [] as GameStatEvent[] }),
    gameIds.length > 0
      ? supabase.from('gameLineups').select('*').in('gameId', gameIds)
      : Promise.resolve({ data: [] as GameLineup[] }),
    practiceIds.length > 0
      ? supabase.from('practiceStatEvents').select('*').in('practiceId', practiceIds)
      : Promise.resolve({ data: [] as PracticeStatEvent[] }),
  ]);
  const events = (eventsData as GameStatEvent[]) ?? [];
  const lineups = (lineupsData as GameLineup[]) ?? [];
  const practiceEvents = (practiceEventsData as PracticeStatEvent[]) ?? [];

  const sessions: SessionRow[] = [];
  let creditedGameAssists = 0;
  let rawPracticeAssists = 0;
  const combinedEvents: MinimalStatEvent[] = [];

  if (includeGames) {
    for (const game of inRangeGames) {
      const gameEvents = events.filter((e) => e.gameId === game.id);
      const gameLineups = lineups.filter((l) => l.gameId === game.id);
      const credits = computeAssistCredits(gameEvents, gameLineups, playersById);
      const assists = credits.get(player.id) ?? 0;
      creditedGameAssists += assists;
      const playerGameEvents = gameEvents.filter((e) => e.playerId === player.id);
      combinedEvents.push(...playerGameEvents);
      if (playerGameEvents.length === 0 && assists === 0) continue;
      const line = { ...buildPlayerStatLine(player, gameEvents), assists };
      sessions.push({ id: game.id, date: game.date, type: 'game', label: `vs. ${game.opponent} (${TEAM_LABELS[game.team]})`, line });
    }
  }

  if (includePractices) {
    for (const practice of inRangePractices) {
      const thisPracticeEvents = practiceEvents.filter((e) => e.practiceId === practice.id);
      const playerPracticeEvents = thisPracticeEvents.filter((e) => e.playerId === player.id);
      if (playerPracticeEvents.length === 0) continue;
      rawPracticeAssists += playerPracticeEvents.filter((e) => e.statType === 'assist').length;
      combinedEvents.push(...playerPracticeEvents);
      const line = buildPlayerStatLine(player, thisPracticeEvents);
      sessions.push({ id: practice.id, date: practice.date, type: 'practice', label: practice.label, line });
    }
  }

  sessions.sort((a, b) => a.date.localeCompare(b.date));

  const line: PlayerGameStatLine = {
    ...buildPlayerStatLine(player, combinedEvents),
    assists: creditedGameAssists + rawPracticeAssists,
  };

  return {
    line,
    sessions,
    gameCount: sessions.filter((s) => s.type === 'game').length,
    practiceCount: sessions.filter((s) => s.type === 'practice').length,
  };
}
