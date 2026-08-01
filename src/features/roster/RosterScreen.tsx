import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import type { Player } from '../../types';
import { PlayerForm, type PlayerFormValues } from './PlayerForm';

export function RosterScreen() {
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);

  const players = useLiveQuery(async () => {
    const all = await db.players.orderBy('lastName').toArray();
    return showActiveOnly ? all.filter((p) => p.active) : all;
  }, [showActiveOnly]);

  function openAddForm() {
    setEditingPlayer(undefined);
    setShowForm(true);
  }

  function openEditForm(player: Player) {
    setEditingPlayer(player);
    setShowForm(true);
  }

  async function handleSave(values: PlayerFormValues) {
    if (editingPlayer) {
      await db.players.put({ ...editingPlayer, ...values });
    } else {
      const newPlayer: Player = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...values,
      };
      await db.players.add(newPlayer);
    }
    setShowForm(false);
  }

  async function handleDelete() {
    if (!editingPlayer) return;
    await db.players.delete(editingPlayer.id);
    setShowForm(false);
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Roster</h1>
        <button
          onClick={openAddForm}
          className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700"
        >
          + Add Player
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowActiveOnly(true)}
          className={`min-h-11 px-4 rounded-lg text-base font-medium border ${
            showActiveOnly
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setShowActiveOnly(false)}
          className={`min-h-11 px-4 rounded-lg text-base font-medium border ${
            !showActiveOnly
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300'
          }`}
        >
          All
        </button>
      </div>

      {players === undefined && <p className="text-gray-500">Loading…</p>}

      {players !== undefined && players.length === 0 && (
        <p className="text-gray-500">No players yet. Add your first player above.</p>
      )}

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
        {players?.map((player) => (
          <li key={player.id}>
            <button
              onClick={() => openEditForm(player)}
              className="w-full min-h-11 flex items-center justify-between gap-3 px-4 py-2 text-left active:bg-gray-50"
            >
              <span className="flex items-center gap-3">
                {player.jerseyNumber != null && (
                  <span className="w-8 text-center text-sm font-semibold text-gray-500">
                    #{player.jerseyNumber}
                  </span>
                )}
                <span className={`font-medium ${player.active ? 'text-gray-900' : 'text-gray-400'}`}>
                  {player.firstName} {player.lastName}
                </span>
                {!player.active && (
                  <span className="text-xs rounded bg-gray-100 text-gray-500 px-1.5 py-0.5">inactive</span>
                )}
              </span>
              <span className="text-sm text-gray-500">
                {player.primaryPosition}
                {player.secondaryPosition ? `/${player.secondaryPosition}` : ''} · {player.gradYear}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {showForm && (
        <PlayerForm
          player={editingPlayer}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
          onDelete={editingPlayer ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
