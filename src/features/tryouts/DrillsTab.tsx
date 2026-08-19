import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { TryoutDrill } from '../../types';
import { DrillForm, type DrillFormValues } from './DrillForm';
import { SKILL_LABELS } from './skills';

export function DrillsTab() {
  const [editingDrill, setEditingDrill] = useState<TryoutDrill | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);

  const drills = useLiveQuery(async () => {
    const { data } = await supabase.from('tryoutDrills').select('*').order('name');
    return (data as TryoutDrill[]) ?? [];
  }, []);

  function openAdd() {
    setEditingDrill(undefined);
    setShowForm(true);
  }

  function openEdit(drill: TryoutDrill) {
    setEditingDrill(drill);
    setShowForm(true);
  }

  async function handleSave(values: DrillFormValues) {
    if (editingDrill) {
      await supabase.from('tryoutDrills').update(values).eq('id', editingDrill.id);
    } else {
      const drill: TryoutDrill = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...values,
      };
      await supabase.from('tryoutDrills').insert(drill);
    }
    setShowForm(false);
  }

  async function handleDelete() {
    if (!editingDrill) return;
    await supabase.from('tryoutDrills').delete().eq('id', editingDrill.id);
    setShowForm(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Drills feed skill scores during tryouts.</p>
        <button
          onClick={openAdd}
          className="min-h-11 px-4 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark"
        >
          + Add Drill
        </button>
      </div>

      {drills !== undefined && drills.length === 0 && (
        <p className="text-gray-500">No drills yet. Add your first drill above.</p>
      )}

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
        {drills?.map((drill) => (
          <li key={drill.id}>
            <button
              onClick={() => openEdit(drill)}
              className="w-full min-h-11 flex items-center justify-between gap-3 px-4 py-2 text-left active:bg-gray-50"
            >
              <span>
                <span className="font-medium text-gray-900">{drill.name}</span>
                {drill.description && (
                  <span className="block text-sm text-gray-500">{drill.description}</span>
                )}
              </span>
              <span className="text-sm text-gray-500 shrink-0">{SKILL_LABELS[drill.skill]}</span>
            </button>
          </li>
        ))}
      </ul>

      {showForm && (
        <DrillForm
          drill={editingDrill}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
          onDelete={editingDrill ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
