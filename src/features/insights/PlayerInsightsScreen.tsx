import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Game, GameLineup, GameStatEvent, Player } from '../../types';
import { PlayerSearchInput } from '../roster/PlayerSearchInput';
import { PositionBadges } from '../tryouts/PositionBadges';
import { playerGradeLabel, matchesPlayerQuery } from '../../lib/playerSearch';
import { TEAM_LABELS } from '../tryouts/teams';
import { buildInsights, buildPlayerStatLine, computeAssistCredits, type PlayerGameStatLine } from '../games/gameStats';

const inputClass =
  'min-h-10 rounded-lg border border-gray-300 px-2 text-sm focus:border-brand-indigo focus:outline-none';

// Cross-game view of one player's stats — distinct from the per-game
// Insights tab (GameInsightsTab, scoped to a single gameId). Reuses the
// same gameStats.ts building blocks, just fed a wider, filtered event set.
export function PlayerInsightsScreen() {
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

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
        One player's stats across every Game Day game they've played in, with an optional date range.
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

          <PlayerInsightsBody player={player} players={players} fromDate={fromDate} toDate={toDate} />
        </>
      )}
    </div>
  );
}

function PlayerInsightsBody({
  player,
  players,
  fromDate,
  toDate,
}: {
  player: Player;
  players: Player[];
  fromDate: string;
  toDate: string;
}) {
  const games = useLiveQuery(async () => {
    const { data } = await supabase.from('games').select('*').contains('rosterPlayerIds', [player.id]);
    return (data as Game[]) ?? [];
  }, [player.id]);

  const inRangeGames = (games ?? [])
    .filter((g) => (!fromDate || g.date >= fromDate) && (!toDate || g.date <= toDate))
    .sort((a, b) => a.date.localeCompare(b.date));
  const gameIds = inRangeGames.map((g) => g.id);

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

  if (games === undefined || events === undefined || lineups === undefined) {
    return <p className="text-gray-500">Loading…</p>;
  }

  if (inRangeGames.length === 0) {
    return <p className="text-sm text-gray-500">No games found for this player in that range.</p>;
  }

  const playersById = new Map(players.map((p) => [p.id, p]));

  // Assist crediting (computeAssistCredits) buckets by set+rotation, which
  // only makes sense within a single game's own lineups — run it once per
  // game and sum this player's share, rather than passing every game's
  // events/lineups in together (that would collide Set 1/Rotation 1 across
  // different games).
  let creditedAssists = 0;
  const perGameLines: { game: Game; line: PlayerGameStatLine }[] = [];
  for (const game of inRangeGames) {
    const gameEvents = events.filter((e) => e.gameId === game.id);
    const gameLineups = lineups.filter((l) => l.gameId === game.id);
    const credits = computeAssistCredits(gameEvents, gameLineups, playersById);
    creditedAssists += credits.get(player.id) ?? 0;
    const playerGameEvents = gameEvents.filter((e) => e.playerId === player.id);
    if (playerGameEvents.length === 0 && (credits.get(player.id) ?? 0) === 0) continue;
    const line = buildPlayerStatLine(player, gameEvents);
    perGameLines.push({ game, line: { ...line, assists: credits.get(player.id) ?? 0 } });
  }

  const playerEvents = events.filter((e) => e.playerId === player.id);
  const aggregate: PlayerGameStatLine = { ...buildPlayerStatLine(player, playerEvents), assists: creditedAssists };
  const insights = buildInsights([aggregate]);

  return (
    <div>
      <div className="rounded-lg border border-gray-200 p-3 mb-4">
        <div className="text-sm font-semibold text-gray-900 mb-2">
          Totals — {inRangeGames.length} game{inRangeGames.length === 1 ? '' : 's'}
        </div>
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
        <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900 text-sm">By game</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 font-medium">Opponent</th>
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
              {perGameLines.map(({ game, line }) => (
                <tr key={game.id} className="text-gray-800">
                  <td className="px-3 py-1.5">{game.date}</td>
                  <td className="px-3 py-1.5">
                    vs. {game.opponent}
                    <span className="text-gray-400"> ({TEAM_LABELS[game.team]})</span>
                  </td>
                  <td className="px-3 py-1.5">{line.kills}</td>
                  <td className="px-3 py-1.5">{line.attackErrors}</td>
                  <td className="px-3 py-1.5">{line.attackAttempts}</td>
                  <td className="px-3 py-1.5">{line.hittingPct != null ? `${(line.hittingPct * 100).toFixed(0)}%` : '—'}</td>
                  <td className="px-3 py-1.5">{line.assists}</td>
                  <td className="px-3 py-1.5">{line.serveReceiveAvg != null ? line.serveReceiveAvg.toFixed(1) : '—'}</td>
                  <td className="px-3 py-1.5">{line.serveAvg != null ? line.serveAvg.toFixed(1) : '—'}</td>
                </tr>
              ))}
              {perGameLines.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-2 text-gray-400">
                    No stats recorded in any of these games yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
