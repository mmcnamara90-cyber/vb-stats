import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Player, RosterCandidate, Team, TeamSettings } from '../../types';
import { PlayerSearchInput } from '../roster/PlayerSearchInput';
import { PositionBadges } from '../tryouts/PositionBadges';
import { playerGradeLabel, matchesPlayerQuery } from '../../lib/playerSearch';
import { buildInsights } from '../games/gameStats';
import { defaultTeamSettings } from '../settings/teamSettings';
import { fetchPlayerAggregate } from './playerAggregate';

const inputClass =
  'min-h-10 rounded-lg border border-gray-300 px-2 text-sm focus:border-brand-indigo focus:outline-none';

type Source = 'games' | 'practices' | 'both';
const SOURCES: { id: Source; label: string }[] = [
  { id: 'both', label: 'Games + Practice' },
  { id: 'games', label: 'Games only' },
  { id: 'practices', label: 'Practice only' },
];

// Matches Game Day/Practice — only JV runs live tracking this year.
const team: Team = 'jv';

// Cross-game (and cross-practice) view of a player's stats — distinct from
// the per-game Insights tab (GameInsightsTab, scoped to a single gameId).
// Defaults to a roster overview grid (the core 10 + the known Varsity
// push-downs from Settings > Preferences' default call-ups) with a tap-in
// profile view per player; a player search remains available underneath for
// anyone outside that group (e.g. a one-off call-up from another team).
export function PlayerInsightsScreen() {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [source, setSource] = useState<Source>('both');

  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);
  const rosterCandidates = useLiveQuery(async () => {
    const { data } = await supabase.from('rosterCandidates').select('*').eq('team', team).eq('status', 'confirmed');
    return (data as RosterCandidate[]) ?? [];
  }, []);
  const settingsRows = useLiveQuery(async () => {
    const { data } = await supabase.from('teamSettings').select('*').eq('team', team);
    return (data as TeamSettings[]) ?? [];
  }, []);

  if (players === undefined || rosterCandidates === undefined || settingsRows === undefined) {
    return <p className="text-gray-500 p-4">Loading…</p>;
  }

  const settings = settingsRows.find((s) => s.team === team) ?? defaultTeamSettings(team);
  const playersById = new Map(players.map((p) => [p.id, p]));
  const rosterIds = [...new Set([...rosterCandidates.map((c) => c.playerId), ...settings.defaultCallUpPlayerIds])];
  const rosterPlayers = rosterIds
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  const player = players.find((p) => p.id === selectedPlayerId);
  const candidates = search
    ? players.filter((p) => matchesPlayerQuery(p, search)).sort((a, b) => a.firstName.localeCompare(b.firstName))
    : [];

  function selectPlayer(id: string) {
    setSelectedPlayerId(id);
    setSearch('');
    setShowSearch(false);
    setFromDate('');
    setToDate('');
    setSource('both');
  }

  if (!player) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-1">Player Insights</h1>
        <p className="text-sm text-gray-500 mb-4">
          Tap a player for their stats across every Game Day game and Practice session they've been part of.
        </p>

        {rosterPlayers.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">
            No confirmed JV roster yet — confirm players in Settings → Roster Builder, or set default call-ups in
            Settings → Preferences.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
            {rosterPlayers.map((p) => (
              <PlayerGridCard key={p.id} player={p} playersById={playersById} onSelect={() => selectPlayer(p.id)} />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowSearch((v) => !v)}
          className="text-xs font-medium text-brand-indigo underline"
        >
          {showSearch ? 'Hide search' : 'Looking for someone else? Search all players'}
        </button>

        {showSearch && (
          <div className="mt-2">
            <PlayerSearchInput value={search} onChange={setSearch} />
            {search && (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 mt-1 max-h-64 overflow-y-auto">
                {candidates.slice(0, 20).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => selectPlayer(p.id)}
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
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
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
          ← All players
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
    </div>
  );
}

// One tile in the 5x3 (desktop) / 3-wide (mobile) roster grid — a compact,
// always all-time + both-sources summary. Each card does its own fetch (15
// small queries) rather than one giant combined query; at this app's scale
// (15 players) that's simpler than threading a batch fetch through, and it
// still benefits from the same coarse realtime refetch-on-any-change pattern
// as everywhere else.
function PlayerGridCard({
  player,
  playersById,
  onSelect,
}: {
  player: Player;
  playersById: Map<string, Player>;
  onSelect: () => void;
}) {
  const result = useLiveQuery(() => fetchPlayerAggregate(player, playersById), [player.id]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="min-h-24 rounded-lg border border-gray-200 bg-white p-2 text-left active:bg-gray-50 flex flex-col gap-1"
    >
      <span className="font-semibold text-gray-900 text-sm leading-tight">
        {player.firstName} {player.lastName}
      </span>
      <span className="flex items-center gap-1 flex-wrap">
        <span className="text-[11px] text-gray-500">{playerGradeLabel(player)}</span>
        <PositionBadges positions={player.positions} />
      </span>
      {result === undefined ? (
        <span className="text-[11px] text-gray-400">Loading…</span>
      ) : result.gameCount + result.practiceCount === 0 ? (
        <span className="text-[11px] text-gray-400">No stats yet</span>
      ) : (
        <span className="text-[11px] text-gray-600 leading-snug">
          {result.gameCount + result.practiceCount} session{result.gameCount + result.practiceCount === 1 ? '' : 's'}
          {result.line.hittingPct != null && <> · {(result.line.hittingPct * 100).toFixed(0)}% hit</>}
          {result.line.serveReceiveAvg != null && <> · {result.line.serveReceiveAvg.toFixed(1)} SR</>}
          {result.line.assists > 0 && <> · {result.line.assists} ast</>}
        </span>
      )}
    </button>
  );
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
  const playersById = new Map(players.map((p) => [p.id, p]));

  const result = useLiveQuery(
    () => fetchPlayerAggregate(player, playersById, { fromDate, toDate, includeGames, includePractices }),
    [player.id, fromDate, toDate, includeGames, includePractices],
  );

  if (result === undefined) return <p className="text-gray-500">Loading…</p>;
  const { line: aggregate, sessions, gameCount, practiceCount } = result;

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No {source === 'games' ? 'games' : source === 'practices' ? 'practices' : 'games or practices'} found for
        this player in that range.
      </p>
    );
  }

  const insights = buildInsights([aggregate]);
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
