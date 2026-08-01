import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import type { PlayerGroup } from '../../types';
import { GroupForm, type GroupFormValues } from './GroupForm';

export function GroupsTab() {
  const [editingGroup, setEditingGroup] = useState<PlayerGroup | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);

  const groups = useLiveQuery(() => db.playerGroups.orderBy('name').toArray(), []);

  function openAdd() {
    setEditingGroup(undefined);
    setShowForm(true);
  }

  function openEdit(group: PlayerGroup) {
    setEditingGroup(group);
    setShowForm(true);
  }

  async function handleSave(values: GroupFormValues) {
    if (editingGroup) {
      await db.playerGroups.put({ ...editingGroup, ...values });
    } else {
      const group: PlayerGroup = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...values,
      };
      await db.playerGroups.add(group);
    }
    setShowForm(false);
  }

  async function handleDelete() {
    if (!editingGroup) return;
    await db.playerGroups.delete(editingGroup.id);
    setShowForm(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Reusable player sets for building drill rosters.</p>
        <button
          onClick={openAdd}
          className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700"
        >
          + Add Group
        </button>
      </div>

      {groups !== undefined && groups.length === 0 && (
        <p className="text-gray-500">No groups yet. Add your first group above.</p>
      )}

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
        {groups?.map((group) => (
          <li key={group.id}>
            <button
              onClick={() => openEdit(group)}
              className="w-full min-h-11 flex items-center justify-between gap-3 px-4 py-2 text-left active:bg-gray-50"
            >
              <span className="font-medium text-gray-900">{group.name}</span>
              <span className="text-sm text-gray-500 shrink-0">{group.playerIds.length} players</span>
            </button>
          </li>
        ))}
      </ul>

      {showForm && (
        <GroupForm
          group={editingGroup}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
          onDelete={editingGroup ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
