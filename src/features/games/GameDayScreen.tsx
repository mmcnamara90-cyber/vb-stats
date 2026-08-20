import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Game, RosterCandidate, Team } from '../../types';
import { TEAM_LABELS } from '../tryouts/teams';
import { fetchTeamSettings } from '../settings/teamSettings';
import { GameDetailScreen } from './GameDetailScreen';

const inputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-brand-indigo focus:outline-none';

// Only JV runs Game Day this year — no team switcher. (Varsity/Freshman/
// Level 3 still exist for Roster Builder/Tryouts, which need all four for
// the tryout pool and the "push down a level" workflow; this screen just
// doesn't need to switch between them.)
const team: Team = 'jv';

export function GameDayScreen() {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [showNewGame, setShowNewGame] = useState(false);

  const games = useLiveQuery(async () => {
    const { data } = await supabase.from('games').select('*').eq('team', team).order('date', { ascending: false });
    return (data as Game[]) ?? [];
  }, []);

  if (selectedGameId) {
    return <GameDetailScreen gameId={selectedGameId} onBack={() => setSelectedGameId(null)} />;
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Game Day</h1>

      {showNewGame ? (
        <NewGameForm team={team} onDone={(id) => { setShowNewGame(false); setSelectedGameId(id); }} onCancel={() => setShowNewGame(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowNewGame(true)}
          className="min-h-11 w-full mb-4 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark"
        >
          + New Game
        </button>
      )}

      {games !== undefined && games.length === 0 && !showNewGame && (
        <p className="text-gray-500">No games yet for {TEAM_LABELS[team]}. Create one above.</p>
      )}

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
        {games?.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => setSelectedGameId(g.id)}
              className="w-full min-h-11 text-left flex items-center justify-between gap-2 px-3 py-2"
            >
              <span>
                <span className="font-medium text-gray-900">vs. {g.opponent}</span>
                <span className="text-xs text-gray-500 ml-2">{g.date}</span>
              </span>
              <span className="text-xs text-gray-500 shrink-0">{g.rosterPlayerIds.length} on roster</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewGameForm({ team, onDone, onCancel }: { team: Team; onDone: (gameId: string) => void; onCancel: () => void }) {
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!opponent.trim() || saving) return;
    setSaving(true);
    // Seed the roster with this team's confirmed players plus any standing
    // call-ups set in Settings > Preferences (e.g. the Varsity players who
    // regularly play up) — the coach can still add/remove call-ups for
    // this specific game from the Roster tab afterward.
    const [{ data: candidates }, teamSettings] = await Promise.all([
      supabase.from('rosterCandidates').select('*').eq('team', team).eq('status', 'confirmed'),
      fetchTeamSettings(team),
    ]);
    const rosterPlayerIds = [
      ...new Set([
        ...((candidates as RosterCandidate[]) ?? []).map((c) => c.playerId),
        ...teamSettings.defaultCallUpPlayerIds,
      ]),
    ];

    const game: Game = {
      id: crypto.randomUUID(),
      team,
      opponent: opponent.trim(),
      date,
      rosterPlayerIds,
      createdAt: new Date().toISOString(),
    };
    await supabase.from('games').insert(game);
    setSaving(false);
    onDone(game.id);
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3 mb-4 space-y-2">
      <label className="block text-xs font-medium text-gray-500">Opponent</label>
      <input className={inputClass} placeholder="e.g. Lakewood" value={opponent} onChange={(e) => setOpponent(e.target.value)} autoFocus />
      <label className="block text-xs font-medium text-gray-500">Date</label>
      <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700">
          Cancel
        </button>
        <button
          type="button"
          onClick={create}
          disabled={!opponent.trim() || saving}
          className="min-h-11 flex-1 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create Game'}
        </button>
      </div>
    </div>
  );
}
