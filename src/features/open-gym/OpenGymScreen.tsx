import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import type { Note } from '../../types';
import { useTodaysSession } from '../../lib/dailySession';

export function OpenGymScreen() {
  const session = useTodaysSession('open_gym');
  const [playerId, setPlayerId] = useState('');
  const [text, setText] = useState('');

  const activePlayers = useLiveQuery(async () => {
    const all = await db.players.orderBy('lastName').toArray();
    return all.filter((p) => p.active);
  }, []);

  const notes = useLiveQuery(async () => {
    if (!session) return [];
    const rows = await db.notes.where('sessionId').equals(session.id).toArray();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [session?.id]);

  const playersById = new Map((activePlayers ?? []).map((p) => [p.id, p]));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !playerId || !text.trim()) return;
    const note: Note = {
      id: crypto.randomUUID(),
      playerId,
      sessionId: session.id,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    await db.notes.add(note);
    setText('');
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Open Gym</h1>
      <p className="text-sm text-gray-500 mb-4">
        {session ? new Date(session.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Loading…'}
      </p>

      <form onSubmit={handleSave} className="mb-6 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Player</label>
          <select
            className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            required
          >
            <option value="" disabled>
              Select a player…
            </option>
            {activePlayers?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
                {p.jerseyNumber != null ? ` (#${p.jerseyNumber})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
          <textarea
            className="w-full min-h-24 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What did you see?"
            required
          />
        </div>

        <button
          type="submit"
          disabled={!session || !playerId || !text.trim()}
          className="min-h-11 w-full rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700 disabled:opacity-50"
        >
          Save Note
        </button>
      </form>

      <h2 className="text-lg font-semibold mb-2">Today's Notes</h2>
      {notes !== undefined && notes.length === 0 && (
        <p className="text-gray-500">No notes yet today.</p>
      )}
      <ul className="space-y-2">
        {notes?.map((note) => {
          const player = playersById.get(note.playerId);
          return (
            <li key={note.id} className="rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900">
                  {player ? `${player.firstName} ${player.lastName}` : 'Unknown player'}
                </span>
                <span className="text-xs text-gray-500 shrink-0">
                  {new Date(note.createdAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-gray-700 mt-1">{note.text}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
