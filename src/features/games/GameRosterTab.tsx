import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Game, Player, RosterCandidate } from '../../types';
import { playerGradeLabel, matchesPlayerQuery } from '../../lib/playerSearch';
import { PlayerSearchInput } from '../roster/PlayerSearchInput';
import { PositionBadges } from '../tryouts/PositionBadges';
import { TEAM_LABELS } from '../tryouts/teams';

export function GameRosterTab({ game }: { game: Game }) {
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);
  const candidates = useLiveQuery(async () => {
    const { data } = await supabase.from('rosterCandidates').select('*').eq('status', 'confirmed');
    return (data as RosterCandidate[]) ?? [];
  }, []);

  const playersById = new Map((players ?? []).map((p) => [p.id, p]));
  const teamsByPlayerId = new Map<string, string[]>();
  for (const c of candidates ?? []) {
    const list = teamsByPlayerId.get(c.playerId) ?? [];
    if (!list.includes(c.team)) list.push(c.team);
    teamsByPlayerId.set(c.playerId, list);
  }

  const roster = game.rosterPlayerIds
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  const rosterIdSet = new Set(game.rosterPlayerIds);
  const searchResults = query.trim()
    ? (players ?? [])
        .filter((p) => !rosterIdSet.has(p.id) && matchesPlayerQuery(p, query))
        .slice(0, 20)
    : [];

  async function addPlayer(playerId: string) {
    const next = [...new Set([...game.rosterPlayerIds, playerId])];
    await supabase.from('games').update({ rosterPlayerIds: next }).eq('id', game.id);
    setQuery('');
  }

  async function removePlayer(playerId: string) {
    const next = game.rosterPlayerIds.filter((id) => id !== playerId);
    await supabase.from('games').update({ rosterPlayerIds: next }).eq('id', game.id);
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Seeded with {TEAM_LABELS[game.team]}'s confirmed roster. Add any call-ups (e.g. Varsity players playing up)
        below — they'll show up in the Lineup and Live tabs like everyone else.
      </p>

      {showAdd ? (
        <div className="mb-4">
          <PlayerSearchInput value={query} onChange={setQuery} />
          {query.trim() && (
            <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden max-h-64 overflow-y-auto">
              {searchResults.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matches.</li>}
              {searchResults.map((p) => {
                const teams = teamsByPlayerId.get(p.id) ?? [];
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addPlayer(p.id)}
                      className="w-full min-h-11 flex items-center justify-between gap-2 px-3 py-2 text-left active:bg-gray-50"
                    >
                      <span>
                        <span className="font-medium text-gray-900">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="text-xs text-gray-500 ml-1">{playerGradeLabel(p)}</span>
                        {teams.length > 0 && (
                          <span className="text-xs text-blue-600 ml-1">
                            ({teams.map((t) => TEAM_LABELS[t as keyof typeof TEAM_LABELS] ?? t).join(', ')})
                          </span>
                        )}
                      </span>
                      <span className="text-blue-600 text-sm font-medium shrink-0">+ Add</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => { setShowAdd(false); setQuery(''); }}
            className="min-h-9 mt-2 px-3 rounded-lg border border-gray-300 text-xs font-medium text-gray-700"
          >
            Done adding
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="min-h-11 w-full mb-4 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium"
        >
          + Add a player (e.g. Varsity call-up)
        </button>
      )}

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900">
          Game Roster <span className="text-xs font-normal text-gray-500">({roster.length})</span>
        </div>
        {roster.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No players on this game's roster yet.</p>}
        <ul className="divide-y divide-gray-100">
          {roster.map((p) => {
            const teams = teamsByPlayerId.get(p.id) ?? [];
            const isCallUp = teams.length > 0 && !teams.includes(game.team);
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="font-medium text-gray-900">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-xs text-gray-500">{playerGradeLabel(p)}</span>
                  <PositionBadges positions={p.positions} />
                  {isCallUp && (
                    <span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
                      Call-up{teams[0] ? ` · ${TEAM_LABELS[teams[0] as keyof typeof TEAM_LABELS] ?? teams[0]}` : ''}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removePlayer(p.id)}
                  className="min-h-9 px-2 rounded-lg border border-gray-300 text-gray-500 text-xs font-medium shrink-0"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
