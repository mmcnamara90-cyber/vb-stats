import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { PracticeDrill, Skill } from '../../types';
import { SKILLS, SKILL_LABELS } from '../tryouts/skills';
import { DrillDetailScreen } from './DrillDetailScreen';

const inputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-brand-indigo focus:outline-none';

// The practice drill catalog — global (not team-scoped), reachable from
// PracticeScreen's "🗂 Drills" button and from the drill picker in a
// practice's Plan tab. Click a drill to see its all-time stats across every
// practice it's been run in (DrillDetailScreen).
export function DrillCatalogScreen({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState('');
  const [showNewDrill, setShowNewDrill] = useState(false);
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);

  const drills = useLiveQuery(async () => {
    const { data } = await supabase.from('drills').select('*').order('name', { ascending: true });
    return (data as PracticeDrill[]) ?? [];
  }, []);

  if (selectedDrillId) {
    return <DrillDetailScreen drillId={selectedDrillId} onBack={() => setSelectedDrillId(null)} />;
  }

  const filtered = (drills ?? []).filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return d.name.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-1">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 shrink-0"
        >
          ‹ Practice
        </button>
        <h1 className="text-xl font-bold text-gray-900">🗂 Drill Catalog</h1>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Reusable drills you can add to any practice's plan. Tap a drill to see how the team has performed in it over
        time.
      </p>

      <input className={`${inputClass} mb-3`} placeholder="Search drills…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {showNewDrill ? (
        <NewDrillForm onDone={() => setShowNewDrill(false)} onCancel={() => setShowNewDrill(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowNewDrill(true)}
          className="min-h-11 w-full mb-4 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark"
        >
          + New Drill
        </button>
      )}

      {drills !== undefined && filtered.length === 0 && (
        <p className="text-sm text-gray-500">
          {drills.length === 0 ? 'No drills in the catalog yet — add one above.' : 'No drills match that search.'}
        </p>
      )}

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
        {filtered.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => setSelectedDrillId(d.id)}
              className="w-full min-h-11 text-left flex items-center justify-between gap-2 px-3 py-2 flex-wrap"
            >
              <span className="flex items-baseline gap-2 flex-wrap min-w-0">
                <span className="font-medium text-gray-900">{d.name}</span>
                {d.description && <span className="text-xs text-gray-500 truncate">{d.description}</span>}
              </span>
              {d.focusSkill && (
                <span className="shrink-0 text-[11px] font-medium text-brand-indigo bg-brand-indigo/10 rounded-full px-2 py-0.5">
                  {SKILL_LABELS[d.focusSkill]}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Exported so the Plan tab's inline picker can create a drill without
// duplicating this form.
export async function createDrill(input: { name: string; description?: string; focusSkill?: Skill }): Promise<PracticeDrill> {
  const drill: PracticeDrill = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    focusSkill: input.focusSkill,
    createdAt: new Date().toISOString(),
  };
  await supabase.from('drills').insert(drill);
  return drill;
}

function NewDrillForm({ onDone, onCancel }: { onDone: (drill: PracticeDrill) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [focusSkill, setFocusSkill] = useState<Skill | ''>('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const drill = await createDrill({ name, description, focusSkill: focusSkill || undefined });
    setSaving(false);
    onDone(drill);
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3 mb-4 space-y-2">
      <label className="block text-xs font-medium text-gray-500">Name</label>
      <input className={inputClass} placeholder="e.g. Line Passing" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <label className="block text-xs font-medium text-gray-500">Description (optional)</label>
      <input className={inputClass} placeholder="e.g. Serve receive, 2 lines, coach tosses" value={description} onChange={(e) => setDescription(e.target.value)} />
      <label className="block text-xs font-medium text-gray-500">Focus skill (optional)</label>
      <select className={inputClass} value={focusSkill} onChange={(e) => setFocusSkill(e.target.value as Skill | '')}>
        <option value="">— none —</option>
        {SKILLS.map((s) => (
          <option key={s} value={s}>
            {SKILL_LABELS[s]}
          </option>
        ))}
      </select>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700">
          Cancel
        </button>
        <button
          type="button"
          onClick={create}
          disabled={!name.trim() || saving}
          className="min-h-11 flex-1 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add Drill'}
        </button>
      </div>
    </div>
  );
}
