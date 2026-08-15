import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { CourtZone, Game, GameLineup, Player } from '../../types';
import { zoneAssignmentsForRotation } from '../tryouts/lineupRotation';
import { playerGradeLabel } from '../../lib/playerSearch';
import { PositionBadges } from '../tryouts/PositionBadges';

const ZONE_GRID: CourtZone[][] = [
  [4, 3, 2], // front row, at the net
  [5, 6, 1], // back row
];
const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;

export function GameLineupTab({ game }: { game: Game }) {
  const [setNumber, setSetNumber] = useState(1);
  const [rotation, setRotation] = useState<(typeof ROTATIONS)[number]>(1);
  const [selectedBenchPlayerId, setSelectedBenchPlayerId] = useState<string | null>(null);

  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);
  const lineups = useLiveQuery(async () => {
    const { data } = await supabase.from('gameLineups').select('*').eq('gameId', game.id).order('setNumber');
    return (data as GameLineup[]) ?? [];
  }, [game.id]);

  const playersById = new Map((players ?? []).map((p) => [p.id, p]));
  const rosterPlayers = game.rosterPlayerIds
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  const setNumbers = [...new Set([1, setNumber, ...(lineups ?? []).map((l) => l.setNumber)])].sort((a, b) => a - b);
  const lineup = (lineups ?? []).find((l) => l.setNumber === setNumber);

  if (lineups === undefined || players === undefined) {
    return <p className="text-gray-500">Loading…</p>;
  }

  async function ensureLineup(): Promise<GameLineup> {
    if (lineup) return lineup;
    const created: GameLineup = {
      id: crypto.randomUUID(),
      gameId: game.id,
      setNumber,
      zoneAssignments: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await supabase.from('gameLineups').insert(created);
    return created;
  }

  async function persistZones(zoneAssignments: Partial<Record<CourtZone, string>>) {
    const current = await ensureLineup();
    await supabase
      .from('gameLineups')
      .upsert({ ...current, zoneAssignments, updatedAt: new Date().toISOString() });
  }

  function addSet() {
    const next = Math.max(...setNumbers) + 1;
    setSetNumber(next);
    setRotation(1);
  }

  const zoneAssignments = lineup?.zoneAssignments ?? {};
  const displayedAssignments = rotation === 1 ? zoneAssignments : zoneAssignmentsForRotation(zoneAssignments, rotation);
  const placedIds = new Set(Object.values(zoneAssignments));
  const bench = rosterPlayers.filter((p) => !placedIds.has(p.id));

  function handleBenchClick(playerId: string) {
    setSelectedBenchPlayerId((cur) => (cur === playerId ? null : playerId));
  }

  function handleCellClick(zone: CourtZone) {
    if (rotation !== 1) return;
    const next = { ...zoneAssignments };
    if (selectedBenchPlayerId) {
      next[zone] = selectedBenchPlayerId;
      setSelectedBenchPlayerId(null);
      persistZones(next);
    } else if (next[zone]) {
      delete next[zone];
      persistZones(next);
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        Set the starting rotation for each set. Rotation 1 is what you place here — rotations 2-6 are derived
        automatically.
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-medium text-gray-500">Set:</span>
        {setNumbers.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { setSetNumber(n); setRotation(1); }}
            className={`min-h-9 px-3 rounded-lg text-sm font-medium border ${
              setNumber === n ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {n}
          </button>
        ))}
        <button type="button" onClick={addSet} className="min-h-9 px-3 rounded-lg text-sm font-medium border border-dashed border-gray-300 text-gray-500">
          + Set
        </button>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {ROTATIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRotation(r)}
            className={`min-h-9 px-3 rounded-lg text-sm font-medium border ${
              rotation === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            Rotation {r}
          </button>
        ))}
      </div>
      {rotation !== 1 ? (
        <p className="text-xs text-gray-500 mb-2">Derived from Rotation 1 — read-only.</p>
      ) : (
        <p className="text-xs text-gray-500 mb-2">
          {selectedBenchPlayerId
            ? 'Tap a court cell to place the selected player.'
            : 'Tap a bench player, then a court cell to place them. Tap a filled cell to clear it.'}
        </p>
      )}

      <div className="mb-1 text-center text-xs font-medium tracking-widest text-gray-400">— NET —</div>
      <div className="rounded-xl border border-gray-200 p-2 mb-4 bg-gray-50">
        {ZONE_GRID.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 mb-2 last:mb-0">
            {row.map((zone) => {
              const playerId = displayedAssignments[zone];
              const player = playerId ? playersById.get(playerId) : undefined;
              return (
                <div
                  key={zone}
                  role="button"
                  tabIndex={rotation === 1 ? 0 : -1}
                  aria-label={`Zone ${zone}${player ? `: ${player.firstName} ${player.lastName}` : ', empty'}`}
                  onClick={() => handleCellClick(zone)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCellClick(zone);
                    }
                  }}
                  className={`relative min-h-24 rounded-lg border-2 p-2 flex flex-col items-center justify-center text-center bg-white ${
                    rotation !== 1
                      ? 'border-gray-200'
                      : player
                        ? 'border-blue-300'
                        : selectedBenchPlayerId
                          ? 'border-blue-400 border-dashed cursor-pointer'
                          : 'border-gray-200'
                  }`}
                >
                  <span className="absolute top-1 left-1 text-[10px] text-gray-400">{zone}</span>
                  {player ? (
                    <>
                      <span className="text-xs font-medium text-gray-900 mt-3 leading-tight">
                        {player.firstName} {player.lastName}
                      </span>
                      <span className="text-[10px] text-gray-500">{playerGradeLabel(player)}</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-300">{rotation === 1 ? 'Tap to place' : '—'}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {rotation === 1 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900">Bench</div>
          {bench.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Everyone's on the court.</p>}
          <ul className="divide-y divide-gray-100">
            {bench.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleBenchClick(p.id)}
                  className={`w-full min-h-11 flex items-center gap-2 px-3 py-2 text-left ${
                    selectedBenchPlayerId === p.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="font-medium text-gray-900">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-xs text-gray-500">{playerGradeLabel(p)}</span>
                  <PositionBadges positions={p.positions} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
