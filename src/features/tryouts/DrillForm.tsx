import { useState } from 'react';
import type { Skill, TryoutDrill } from '../../types';
import { SKILLS, SKILL_LABELS } from './skills';

export interface DrillFormValues {
  name: string;
  description?: string;
  skill: Skill;
}

function toFormValues(drill?: TryoutDrill): DrillFormValues {
  return {
    name: drill?.name ?? '',
    description: drill?.description ?? '',
    skill: drill?.skill ?? 'serve',
  };
}

const inputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-brand-indigo focus:outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export function DrillForm({
  drill,
  onSave,
  onCancel,
  onDelete,
}: {
  drill?: TryoutDrill;
  onSave: (values: DrillFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [values, setValues] = useState<DrillFormValues>(() => toFormValues(drill));

  function update<K extends keyof DrillFormValues>(key: K, value: DrillFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return;
    onSave(values);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-xl font-bold mb-4">{drill ? 'Edit Drill' : 'Add Drill'}</h2>

        <div className="mb-3">
          <label className={labelClass}>Drill name</label>
          <input
            className={inputClass}
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className={labelClass}>Skill category</label>
          <select
            className={inputClass}
            value={values.skill}
            onChange={(e) => update('skill', e.target.value as Skill)}
          >
            {SKILLS.map((s) => (
              <option key={s} value={s}>
                {SKILL_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-5">
          <label className={labelClass}>Description (optional)</label>
          <textarea
            className="w-full min-h-20 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-brand-indigo focus:outline-none"
            value={values.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700 active:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-11 flex-1 rounded-lg bg-brand-indigo text-base font-medium text-white active:bg-brand-indigo-dark"
          >
            Save
          </button>
        </div>

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="min-h-11 w-full mt-3 rounded-lg text-base font-medium text-red-600 active:bg-red-50"
          >
            Delete drill
          </button>
        )}
      </form>
    </div>
  );
}
