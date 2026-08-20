import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Game, GameLineup, GameStatEvent, Player, Practice, PracticeStatEvent } from '../../types';
import { PlayerSearchInput } from '../roster/PlayerSearchInput';
import { PositionBadges } from '../tryouts/PositionBadges';
import { playerGradeLabel, matchesPlayerQuery } from '../../lib/playerSearch';
import { TEAM_LABELS } from '../tryouts/teams';
import {
  buildInsights,
  buildPlayerStatLine,
  computeAssistCredits,
  type MinimalStatEvent,
  type PlayerGameStatLine,
} from '../games/gameStats';

const inputClass =
  'min-h-10 rounded-lg border border-gray-300 px-2 text-sm focus:border-brand-indigo focus:outline-none';

type Source = 'games' | 'practices' | 'both';
const SOURCES: { id: Source; label: string }[] = [
  { id: 'both', label: 'Games + Practice' },
  { id: 'games', label: 'Games only' },
  { id: 'practices', label: 'Practice only' },
];

// Cross-game (and now cross-practice) view of one player's stats — distinct
// from the per-game Insights tab (GameInsightsTab, scoped to a single
// gameId). Reuses the same gameStats.ts building blocks, just fed a wider,
// filtered event set.
export function PlayerInsightsScreen() {
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [source, setSource] = useState<Source>('both');

  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);

  if (players === undefined) return <p className="text-gray-500 p-4">Loading…</p>;

  const player = players.find((p) => p.id === selectedPlayerId);
  const candidates = search
    ? players.filter((p) => matchesPlayerQuery(p, search)).sort((a, b) => a.firstName.localeCompare(b.firstName))
    : [];

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Player Insights</h1>
      <p className="text-sm text-gray-500 mb-4">
        One player's stats across every Game Day game and Practice session they've been part of, with an optional
        date range.
      </p>

      <PlayerSearchInput value={search} onChange={setSearch} />
      {search && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 mt-1 mb-4 max-h-64 overflow-y-auto">
          {candidates.slice(0, 20).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedPlayerId(p.id);
                  setSearch('');
                }}
                className="w-full min-h-11 flex items-center gap-1.5 px-3 py-2 text-left flex-wrap"
              >
                <span className="font-medium text-gray-900">
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-xs text-gray-500">{playerGradeLabel(p)}</span>
                <PositionBadges positions={p.positions} />
              </button>
            </li>
          ))}
          {candidates.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matches.</li>}
        </ul>
      )}

      {!player ? (
        <p className="text-sm text-gray-500 mt-2">Search for a player above to see their stats.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-4 mt-2">
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-gray-900 text-lg">
                {player.firstName} {player.lastName}
              </span>
              <span className="text-sm text-gray-500">{playerGradeLabel(player)}</span>
              <PositionBadges positions={player.positions} />
            </span>
            <button
              type="button"
              onClick={() => setSelectedPlayerId(null)}
              className="min-h-9 px-3 rounded-lg border border-gray-300 text-xs font-medium text-gray-600"
            >
              Change player
            </button>
          </div>

          <div className="flex gap-1.5 flex-wrap mb-3">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSource(s.id)}
                className={`min-h-9 px-3 rounded-lg text-xs font-medium border ${
                  source === s.id ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-xs font-medium text-gray-500">From</span>
            <input type="date" className={inputClass} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <span className="text-xs font-medium text-gray-500">To</span>
            <input type="date" className={inputClass} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="min-h-9 px-3 rounded-lg border border-gray-300 text-xs font-medium text-gray-600"
              >
                Clear (all-time)
              </button>
            )}
          </div>

          <PlayerInsightsBody player={player} players={players} fromDate={fromDate} toDate={toDate} source={source} />
        </>
      )}
    </div>
  );
}

interface SessionRow {
  id: string;
  date: string;
  type: 'game' | 'practice';
  label: string; // "vs. X (Team)" or the practice label
  line: PlayerGameStatLine;
}

function PlayerInsightsBody({
  player,
  players,
  fromDate,
  toDate,
  source,
}: {
  player: Player;
  players: Player[];
  fromDate: string;
  toDate: string;
  source: Source;
}) {
  const includeGames = source !== 'practices';
  const includePractices = source !== 'games';

  const games = useLiveQuery(async () => {
    const { data } = await supabase.from('games').select('*').contains('rosterPlayerIds', [player.id]);
    return (data as Game[]) ?? [];
  }, [player.id]);
  const practices = useLiveQuery(async () => {
    const { data } = await supabase.from('practices').select('*').contains('rosterPlayerIds', [player.id]);
    return (data as Practice[]) ?? [];
  }, [player.id]);

  const inRangeGames = (games ?? [])
    .filter((g) => (!fromDate || g.date >= fromDate) && (!toDate || g.date <= toDate))
    .sort((a, b) => a.date.localeCompare(b.date));
  const gameIds = inRangeGames.map((g) => g.id);
  const inRangePractices = (practices ?? [])
    .filter((p) => (!fromDate || p.date >= fromDate) && (!toDate || p.date <= toDate))
    .sort((a, b) => a.date.localeCompare(b.date));
  const practiceIds = inRangePractices.map((p) => p.id);

  const events = useLiveQuery(async () => {
    if (gameIds.length === 0) return [];
    const { data } = await supabase.from('gameStatEvents').select('*').in('gameId', gameIds);
    return (data as GameStatEvent[]) ?? [];
  }, [gameIds.join(',')]);
  const lineups = useLiveQuery(async () => {
    if (gameIds.length === 0) return [];
    const { data } = await supabase.from('gameLineups').select('*').in('gameId', gameIds);
    return (data as GameLineup[]) ?? [];
  }, [gameIds.join(',')]);
  const practiceEvents = useLiveQuery(async () => {
    if (practiceIds.length === 0) return [];
    const { data } = await supabase.from('practiceStatEvents').select('*').in('practiceId', practiceIds);
    return (data as PracticeStatEvent[]) ?? [];
  }, [practiceIds.join(',')]);

  if (games === undefined || events === undefined || lineups === undefined || practices === undefined || practiceEvents === undefined) {
    return <p className="text-gray-500">Loading…</p>;
  }

  const playersById = new Map(players.map((p) => [p.id, p]));
  const sessions: SessionRow[] = [];
  let creditedGameAssists = 0;
  let rawPracticeAssists = 0;
  const combinedEvents: MinimalStatEvent[] = [];

  // Assist crediting (computeAssistCredits) buckets by set+rotation, which
  // only makes sense within a single game's own lineups — run it once per
  // game and sum this player's share, rather than passing every game's
  // events/lineups in together (that would collide Set 1/Rotation 1 across
  // different games). Practice has no rotation, so its assists are always
  // just the raw explicit taps.
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

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No {source === 'games' ? 'games' : source === 'practices' ? 'practices' : 'games or practices'} found for
        this player in that range.
      </p>
    );
  }

  const aggregate: PlayerGameStatLine = {
    ...buildPlayerStatLine(player, combinedEvents),
    assists: creditedGameAssists + rawPracticeAssists,
  };
  const insights = buildInsights([aggregate]);
  const gameCount = sessions.filter((s) => s.type === 'game').length;
  const practiceCount = sessions.filter((s) => s.type === 'practice').length;
  const totalsLabel = [
    gameCount > 0 ? `${gameCount} game${gameCount === 1 ? '' : 's'}` : null,
    practiceCount > 0 ? `${practiceCount} practice${practiceCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div>
      <div className="rounded-lg border border-gray-200 p-3 mb-4">
        <div className="text-sm font-semibold text-gray-900 mb-2">Totals — {totalsLabel}</div>
        <div className="flex gap-4 flex-wrap text-sm text-gray-700">
          {(aggregate.attackAttempts > 0 || aggregate.kills > 0 || aggregate.attackErrors > 0) && (
            <span>
              {aggregate.kills}k / {aggregate.attackErrors}e / {aggregate.attackAttempts} att
              {aggregate.hittingPct != null && ` (${(aggregate.hittingPct * 100).toFixed(0)}%)`}
            </span>
          )}
          {aggregate.assists > 0 && <span>{aggregate.assists} assists</span>}
          {aggregate.serveReceiveCount > 0 && (
            <span>
              SR {aggregate.serveReceiveAvg?.toFixed(1)} avg ({aggregate.serveReceiveCount})
            </span>
          )}
          {aggregate.serveCount > 0 && (
            <span>
              Serve {aggregate.serveAvg?.toFixed(1)} avg ({aggregate.serveCount})
            </span>
          )}
        </div>
      </div>

      {insights.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-3 mb-4 space-y-1.5">
          {insights.map((i, idx) => (
            <p key={idx} className={`text-sm ${i.tone === 'good' ? 'text-emerald-800' : 'text-amber-800'}`}>
              {i.tone === 'good' ? '✅' : '👀'} {i.text}
            </p>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900 text-sm">By session</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 font-medium">Type</th>
                <th className="px-3 py-1.5 font-medium">Session</th>
                <th className="px-3 py-1.5 font-medium">K</th>
                <th className="px-3 py-1.5 font-medium">E</th>
                <th className="px-3 py-1.5 font-medium">Att</th>
                <th className="px-3 py-1.5 font-medium">Hit%</th>
                <th className="px-3 py-1.5 font-medium">Asst</th>
                <th className="px-3 py-1.5 font-medium">SR avg</th>
                <th className="px-3 py-1.5 font-medium">Serve avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((s) => (
                <tr key={`${s.type}:${s.id}`} className="text-gray-800">
                  <td className="px-3 py-1.5">{s.date}</td>
                  <td className="px-3 py-1.5">{s.type === 'game' ? '🏐 Game' : '🏃 Practice'}</td>
                  <td className="px-3 py-1.5">{s.label}</td>
                  <td className="px-3 py-1.5">{s.line.kills}</td>
                  <td className="px-3 py-1.5">{s.line.attackErrors}</td>
                  <td className="px-3 py-1.5">{s.line.attackAttempts}</td>
                  <td className="px-3 py-1.5">{s.line.hittingPct != null ? `${(s.line.hittingPct * 100).toFixed(0)}%` : '—'}</td>
                  <td className="px-3 py-1.5">{s.line.assists}</td>
                  <td className="px-3 py-1.5">{s.line.serveReceiveAvg != null ? s.line.serveReceiveAvg.toFixed(1) : '—'}</td>
                  <td className="px-3 py-1.5">{s.line.serveAvg != null ? s.line.serveAvg.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
