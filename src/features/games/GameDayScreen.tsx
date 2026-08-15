import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Game, RosterCandidate, Team } from '../../types';
import { TEAM_LABELS, TEAMS } from '../tryouts/teams';
import { GameDetailScreen } from './GameDetailScreen';

const inputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none';

export function GameDayScreen({ initialTeam }: { initialTeam?: Team }) {
  const [team, setTeam] = useState<Team>(initialTeam ?? 'jv');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [showNewGame, setShowNewGame] = useState(false);

  const games = useLiveQuery(async () => {
    const { data } = await supabase.from('games').select('*').eq('team', team).order('date', { ascending: false });
    return (data as Game[]) ?? [];
  }, [team]);

  if (selectedGameId) {
    return <GameDetailScreen gameId={selectedGameId} onBack={() => setSelectedGameId(null)} />;
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Game Day</h1>

      <div className="flex gap-2 flex-wrap mb-4">
        {TEAMS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(t)}
            className={`min-h-11 px-4 rounded-lg text-sm font-medium border ${
              team === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {TEAM_LABELS[t]}
          </button>
        ))}
      </div>

      {showNewGame ? (
        <NewGameForm team={team} onDone={(id) => { setShowNewGame(false); setSelectedGameId(id); }} onCancel={() => setShowNewGame(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowNewGame(true)}
          className="min-h-11 w-full mb-4 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700"
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
    // Seed the roster with this team's confirmed players — the coach adds
    // any call-ups (e.g. Varsity players playing up) from the Roster tab
    // afterward.
    const { data: candidates } = await supabase
      .from('rosterCandidates')
      .select('*')
      .eq('team', team)
      .eq('status', 'confirmed');
    const rosterPlayerIds = [...new Set(((candidates as RosterCandidate[]) ?? []).map((c) => c.playerId))];

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
          className="min-h-11 flex-1 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create Game'}
        </button>
      </div>
    </div>
  );
}
