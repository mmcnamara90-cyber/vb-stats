import { useState } from 'react';
import type { Player, Position } from '../../types';
import { POSITIONS, POSITION_LABELS } from '../tryouts/skills';

export interface PlayerFormValues {
  firstName: string;
  lastName: string;
  gradYear: number;
  positions: Position[];
  jerseyNumber?: number;
  contactPhone?: string;
  contactEmail?: string;
  tags: string[];
  active: boolean;
}

function toFormValues(player?: Player): PlayerFormValues {
  return {
    firstName: player?.firstName ?? '',
    lastName: player?.lastName ?? '',
    gradYear: player?.gradYear ?? new Date().getFullYear() + 1,
    positions: player?.positions ?? [],
    jerseyNumber: player?.jerseyNumber,
    contactPhone: player?.contactPhone ?? '',
    contactEmail: player?.contactEmail ?? '',
    tags: player?.tags ?? [],
    active: player?.active ?? true,
  };
}

const inputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export function PlayerForm({
  player,
  onSave,
  onCancel,
  onDelete,
}: {
  player?: Player;
  onSave: (values: PlayerFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [values, setValues] = useState<PlayerFormValues>(() => toFormValues(player));
  const [tagsInput, setTagsInput] = useState(() => (player?.tags ?? []).join(', '));

  function update<K extends keyof PlayerFormValues>(key: K, value: PlayerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function togglePosition(pos: Position) {
    setValues((v) => ({
      ...v,
      positions: v.positions.includes(pos)
        ? v.positions.filter((p) => p !== pos)
        : [...v.positions, pos],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.firstName.trim() || !values.lastName.trim()) return;
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({ ...values, tags });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-xl font-bold mb-4">{player ? 'Edit Player' : 'Add Player'}</h2>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelClass}>First name</label>
            <input
              className={inputClass}
              value={values.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Last name</label>
            <input
              className={inputClass}
              value={values.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelClass}>Grad year</label>
            <input
              type="number"
              className={inputClass}
              value={values.gradYear}
              onChange={(e) => update('gradYear', Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Jersey #</label>
            <input
              type="number"
              className={inputClass}
              value={values.jerseyNumber ?? ''}
              onChange={(e) =>
                update('jerseyNumber', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
          </div>
        </div>

        <div className="mb-3">
          <label className={labelClass}>Positions (select all that apply)</label>
          <div className="flex flex-wrap gap-2">
            {POSITIONS.map((p) => {
              const checked = values.positions.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePosition(p)}
                  className={`min-h-11 px-3 rounded-full border text-sm font-medium ${
                    checked
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {POSITION_LABELS[p]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3">
          <label className={labelClass}>Phone</label>
          <input
            type="tel"
            className={inputClass}
            value={values.contactPhone}
            onChange={(e) => update('contactPhone', e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className={labelClass}>Email</label>
          <input
            type="email"
            className={inputClass}
            value={values.contactEmail}
            onChange={(e) => update('contactEmail', e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className={labelClass}>Tags (comma separated)</label>
          <input
            className={inputClass}
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="returner, club-outside, jv-callup"
          />
        </div>

        <label className="flex items-center gap-2 mb-5 min-h-11">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={values.active}
            onChange={(e) => update('active', e.target.checked)}
          />
          <span className="text-sm font-medium text-gray-700">Active</span>
        </label>

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
            className="min-h-11 flex-1 rounded-lg bg-blue-600 text-base font-medium text-white active:bg-blue-700"
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
            Delete player
          </button>
        )}
      </form>
    </div>
  );
}
