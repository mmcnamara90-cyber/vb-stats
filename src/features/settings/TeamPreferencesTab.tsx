import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Player, Team, TeamSettings } from '../../types';
import { TEAM_LABELS, TEAMS } from '../tryouts/teams';
import { PlayerSearchInput } from '../roster/PlayerSearchInput';
import { PositionBadges } from '../tryouts/PositionBadges';
import { playerGradeLabel, matchesPlayerQuery } from '../../lib/playerSearch';
import { defaultTeamSettings, saveTeamSettings } from './teamSettings';

const pillClass = (active: boolean) =>
  `min-h-11 px-4 rounded-lg text-sm font-medium border ${
    active ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
  }`;

export function TeamPreferencesTab() {
  const [team, setTeam] = useState<Team>('jv');
  const [search, setSearch] = useState('');

  const settingsRows = useLiveQuery(async () => {
    const { data } = await supabase.from('teamSettings').select('*');
    return (data as TeamSettings[]) ?? [];
  }, []);
  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);

  if (settingsRows === undefined || players === undefined) return <p className="text-gray-500">Loading…</p>;

  const settings = settingsRows.find((s) => s.team === team) ?? defaultTeamSettings(team);
  const playersById = new Map(players.map((p) => [p.id, p]));
  const callUps = settings.defaultCallUpPlayerIds.map((id) => playersById.get(id)).filter((p): p is Player => !!p);
  const candidates = players
    .filter((p) => !settings.defaultCallUpPlayerIds.includes(p.id))
    .filter((p) => matchesPlayerQuery(p, search))
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  async function update(patch: Partial<TeamSettings>) {
    await saveTeamSettings({ ...settings, ...patch, team });
  }

  function toggleCallUp(playerId: string) {
    const has = settings.defaultCallUpPlayerIds.includes(playerId);
    update({
      defaultCallUpPlayerIds: has
        ? settings.defaultCallUpPlayerIds.filter((id) => id !== playerId)
        : [...settings.defaultCallUpPlayerIds, playerId],
    });
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Defaults for this team — applied automatically so you're not re-entering the same choices every game.
      </p>

      <div className="flex gap-2 flex-wrap mb-4">
        {TEAMS.map((t) => (
          <button key={t} type="button" onClick={() => setTeam(t)} className={pillClass(team === t)}>
            {TEAM_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 p-3 mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Default offense</label>
        <div className="flex gap-2 mb-3">
          {(['5-1', '6-2'] as const).map((sys) => (
            <button
              key={sys}
              type="button"
              onClick={() => update({ offenseSystem: sys })}
              className={pillClass(settings.offenseSystem === sys)}
            >
              {sys}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Stored for reference — nothing currently changes behavior based on this (the assist auto-crediting is
          already rotation-based, so it works the same under either system). Let me know if you want something
          specific to branch on it.
        </p>

        <label className="block text-xs font-medium text-gray-500 mb-1.5">Liberos you typically run</label>
        <div className="flex gap-2">
          {([1, 2] as const).map((n) => (
            <button key={n} type="button" onClick={() => update({ liberoCount: n })} className={pillClass(settings.liberoCount === n)}>
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          New game lineups start with this many blank libero slots already added on the Lineup tab, ready to fill in.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900">
          Default call-ups ({callUps.length})
        </div>
        <p className="px-3 pt-2 text-xs text-gray-500">
          Players automatically added to every new {TEAM_LABELS[team]} game's roster — e.g. the Varsity players who
          regularly play up. You can still remove any of them from a specific game afterward.
        </p>
        {callUps.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-400">None set.</p>
        ) : (
          <ul className="divide-y divide-gray-100 mt-1">
            {callUps.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-gray-900">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-xs text-gray-500">{playerGradeLabel(p)}</span>
                  <PositionBadges positions={p.positions} />
                </span>
                <button
                  type="button"
                  onClick={() => toggleCallUp(p.id)}
                  className="min-h-8 px-2.5 rounded-md bg-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-300 shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="px-3 py-2 border-t border-gray-100">
          <PlayerSearchInput value={search} onChange={setSearch} />
        </div>
        {search && (
          <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {candidates.slice(0, 20).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    toggleCallUp(p.id);
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
      </div>
    </div>
  );
}
