import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Player, PlayerGroup } from '../../types';
import { PositionBadges } from './PositionBadges';

export interface GroupFormValues {
  name: string;
  playerIds: string[];
}

export function GroupForm({
  group,
  onSave,
  onCancel,
  onDelete,
}: {
  group?: PlayerGroup;
  onSave: (values: GroupFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [playerIds, setPlayerIds] = useState<string[]>(group?.playerIds ?? []);

  const activePlayers = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true).order('lastName');
    return (data as Player[]) ?? [];
  }, []);

  function toggle(playerId: string) {
    setPlayerIds((ids) =>
      ids.includes(playerId) ? ids.filter((id) => id !== playerId) : [...ids, playerId],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || playerIds.length === 0) return;
    onSave({ name: name.trim(), playerIds });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-xl font-bold mb-4">{group ? 'Edit Group' : 'Add Group'}</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Group name</label>
          <input
            className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juniors, Back Row Candidates, ..."
            required
          />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Members ({playerIds.length} selected)
          </label>
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden max-h-64 overflow-y-auto">
            {activePlayers?.map((p) => {
              const checked = playerIds.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`w-full min-h-11 flex items-center gap-3 px-4 py-2 text-left ${
                      checked ? 'bg-blue-50' : ''
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 text-xs ${
                        checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
                      }`}
                    >
                      {checked ? '✓' : ''}
                    </span>
                    <span className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-medium text-gray-900">
                        {p.firstName} {p.lastName}
                      </span>
                      <PositionBadges positions={p.positions} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
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
            Delete group
          </button>
        )}
      </form>
    </div>
  );
}
