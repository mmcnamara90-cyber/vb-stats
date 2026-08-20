import type { Player } from '../../../types';
import { playerGradeLabel } from '../../../lib/playerSearch';
import { setSelfPlayerId } from './voteAuth';

export function SelectSelfScreen({
  players,
  onSelect,
}: {
  players: Player[];
  onSelect: (playerId: string) => void;
}) {
  function choose(playerId: string) {
    setSelfPlayerId(playerId);
    onSelect(playerId);
  }

  return (
    <div className="min-h-svh bg-gray-50 p-4">
      <div className="max-w-sm mx-auto pt-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Which player are you?</h1>
        <p className="text-sm text-gray-500 mb-4">Tap your name to start voting.</p>

        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden bg-white">
          {players
            .slice()
            .sort((a, b) => a.firstName.localeCompare(b.firstName))
            .map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  className="w-full min-h-12 flex items-center justify-between gap-2 px-4 py-2 text-left active:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-xs text-gray-400">{playerGradeLabel(p)}</span>
                </button>
              </li>
            ))}
          {players.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">No roster loaded.</li>}
        </ul>
      </div>
    </div>
  );
}
