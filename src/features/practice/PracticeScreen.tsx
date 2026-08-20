import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Practice, RosterCandidate, Team } from '../../types';
import { TEAM_LABELS } from '../tryouts/teams';
import { PracticeDetailScreen } from './PracticeDetailScreen';

const inputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-brand-indigo focus:outline-none';

// Only JV runs Practice this year — no team switcher, same as GameDayScreen.
const team: Team = 'jv';

// Deliberately simpler than GameDayScreen's NewGameForm: no opponent field,
// and the roster is just this team's confirmed players — no call-up search,
// since practice is the core team, not "who's playing up today."
export function PracticeScreen() {
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(null);
  const [showNewPractice, setShowNewPractice] = useState(false);

  const practices = useLiveQuery(async () => {
    const { data } = await supabase.from('practices').select('*').eq('team', team).order('date', { ascending: false });
    return (data as Practice[]) ?? [];
  }, []);

  if (selectedPracticeId) {
    return <PracticeDetailScreen practiceId={selectedPracticeId} onBack={() => setSelectedPracticeId(null)} />;
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">🏃 Practice</h1>

      {showNewPractice ? (
        <NewPracticeForm
          team={team}
          onDone={(id) => {
            setShowNewPractice(false);
            setSelectedPracticeId(id);
          }}
          onCancel={() => setShowNewPractice(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNewPractice(true)}
          className="min-h-11 w-full mb-4 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark"
        >
          + New Practice
        </button>
      )}

      {practices !== undefined && practices.length === 0 && !showNewPractice && (
        <p className="text-gray-500">No practices logged yet for {TEAM_LABELS[team]}. Create one above.</p>
      )}

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
        {practices?.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setSelectedPracticeId(p.id)}
              className="w-full min-h-11 text-left flex items-center justify-between gap-2 px-3 py-2"
            >
              <span>
                <span className="font-medium text-gray-900">{p.label}</span>
                <span className="text-xs text-gray-500 ml-2">{p.date}</span>
              </span>
              <span className="text-xs text-gray-500 shrink-0">{p.rosterPlayerIds.length} on roster</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewPracticeForm({
  team,
  onDone,
  onCancel,
}: {
  team: Team;
  onDone: (practiceId: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('Practice');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!label.trim() || saving) return;
    setSaving(true);
    // Just this team's confirmed players — no call-up flow, unlike games.
    const { data: candidates } = await supabase
      .from('rosterCandidates')
      .select('*')
      .eq('team', team)
      .eq('status', 'confirmed');
    const rosterPlayerIds = [...new Set(((candidates as RosterCandidate[]) ?? []).map((c) => c.playerId))];

    const practice: Practice = {
      id: crypto.randomUUID(),
      team,
      date,
      label: label.trim(),
      rosterPlayerIds,
      createdAt: new Date().toISOString(),
    };
    await supabase.from('practices').insert(practice);
    setSaving(false);
    onDone(practice.id);
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3 mb-4 space-y-2">
      <label className="block text-xs font-medium text-gray-500">Label</label>
      <input className={inputClass} placeholder="e.g. Practice, Scrimmage" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      <label className="block text-xs font-medium text-gray-500">Date</label>
      <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700">
          Cancel
        </button>
        <button
          type="button"
          onClick={create}
          disabled={!label.trim() || saving}
          className="min-h-11 flex-1 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create Practice'}
        </button>
      </div>
    </div>
  );
}
