import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { CourtZone, Game, GameLineup, Player, PlannedSub } from '../../types';
import { playerGradeLabel } from '../../lib/playerSearch';
import { PositionBadges } from '../tryouts/PositionBadges';
import { computeEffectiveCourt, liberoRotationPlan } from './effectiveCourt';

const ZONE_GRID: CourtZone[][] = [
  [4, 3, 2], // front row, at the net
  [5, 6, 1], // back row
];
const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;

const selectClass =
  'min-h-10 w-full rounded-lg border border-gray-300 px-2 text-sm focus:border-blue-500 focus:outline-none';

function emptyLineup(gameId: string, setNumber: number): GameLineup {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), gameId, setNumber, zoneAssignments: {}, subs: [], createdAt: now, updatedAt: now };
}

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
  const lineup = (lineups ?? []).find((l) => l.setNumber === setNumber) ?? emptyLineup(game.id, setNumber);

  if (lineups === undefined || players === undefined) {
    return <p className="text-gray-500">Loading…</p>;
  }

  async function persist(patch: Partial<Pick<GameLineup, 'zoneAssignments' | 'subs' | 'liberoPlayerId' | 'liberoForPlayerId'>>) {
    const existing = (lineups ?? []).find((l) => l.setNumber === setNumber);
    const base = existing ?? emptyLineup(game.id, setNumber);
    await supabase.from('gameLineups').upsert({ ...base, ...patch, updatedAt: new Date().toISOString() });
  }

  function addSet() {
    const next = Math.max(...setNumbers) + 1;
    setSetNumber(next);
    setRotation(1);
  }

  const zoneAssignments = lineup.zoneAssignments;
  const effective = computeEffectiveCourt(lineup, rotation);
  const displayedAssignments = rotation === 1 ? zoneAssignments : effective.zoneAssignments;
  const placedIds = new Set(Object.values(zoneAssignments));
  const bench = rosterPlayers.filter((p) => !placedIds.has(p.id));
  const starters = Object.values(zoneAssignments)
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  function handleBenchClick(playerId: string) {
    setSelectedBenchPlayerId((cur) => (cur === playerId ? null : playerId));
  }

  function handleCellClick(zone: CourtZone) {
    if (rotation !== 1) return;
    const next = { ...zoneAssignments };
    if (selectedBenchPlayerId) {
      next[zone] = selectedBenchPlayerId;
      setSelectedBenchPlayerId(null);
      persist({ zoneAssignments: next });
    } else if (next[zone]) {
      delete next[zone];
      persist({ zoneAssignments: next });
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
        <p className="text-xs text-gray-500 mb-2">
          Derived from Rotation 1, plus any subs/libero swap in effect by this rotation — read-only.
        </p>
      ) : (
        <p className="text-xs text-gray-500 mb-2">
          {selectedBenchPlayerId
            ? 'Tap a court cell to place the selected player.'
            : 'Tap a bench player, then a court cell to place them. Tap a filled cell to clear it. (This grid always shows the raw starting six — subs and the libero swap apply starting from the Live/preview rotations, not here.)'}
        </p>
      )}

      <div className="mb-1 text-center text-xs font-medium tracking-widest text-gray-400">— NET —</div>
      <div className="rounded-xl border border-gray-200 p-2 mb-4 bg-gray-50">
        {ZONE_GRID.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 mb-2 last:mb-0">
            {row.map((zone) => {
              const playerId = displayedAssignments[zone];
              const player = playerId ? playersById.get(playerId) : undefined;
              const isLibero = rotation !== 1 && effective.liberoZone === zone;
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
                  className={`relative min-h-24 rounded-lg border-2 p-2 flex flex-col items-center justify-center text-center ${
                    rotation !== 1
                      ? isLibero
                        ? 'bg-violet-100 border-violet-400'
                        : player
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-gray-200'
                      : player
                        ? 'bg-blue-100 border-blue-500'
                        : selectedBenchPlayerId
                          ? 'bg-blue-50 border-blue-400 border-dashed cursor-pointer'
                          : 'bg-white border-gray-200'
                  }`}
                >
                  <span className="absolute top-1 left-1 text-[10px] text-gray-500 font-medium">{zone}</span>
                  {isLibero && <span className="absolute top-1 right-1 text-[10px]">🛡{zone === 1 ? '🎯' : ''}</span>}
                  {player ? (
                    <>
                      <span className="text-xs font-semibold text-gray-900 mt-3 leading-tight">
                        {player.firstName} {player.lastName}
                      </span>
                      <span className="text-[10px] text-gray-600">{playerGradeLabel(player)}</span>
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
        <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
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

      <SubsSection lineup={lineup} rosterPlayers={rosterPlayers} onPersist={persist} />
      <LiberoSection lineup={lineup} rosterPlayers={rosterPlayers} starters={starters} onPersist={persist} />
    </div>
  );
}

function SubsSection({
  lineup,
  rosterPlayers,
  onPersist,
}: {
  lineup: GameLineup;
  rosterPlayers: Player[];
  onPersist: (patch: Partial<Pick<GameLineup, 'subs'>>) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [outPlayerId, setOutPlayerId] = useState('');
  const [inPlayerId, setInPlayerId] = useState('');
  const [effectiveRotation, setEffectiveRotation] = useState<number>(2);
  const playersById = new Map(rosterPlayers.map((p) => [p.id, p]));
  const sortedSubs = [...lineup.subs].sort((a, b) => a.effectiveRotation - b.effectiveRotation);

  function addSub() {
    if (!outPlayerId || !inPlayerId) return;
    const sub: PlannedSub = { id: crypto.randomUUID(), outPlayerId, inPlayerId, effectiveRotation };
    onPersist({ subs: [...lineup.subs, sub] });
    setOutPlayerId('');
    setInPlayerId('');
    setEffectiveRotation(2);
    setShowAdd(false);
  }

  function removeSub(id: string) {
    onPersist({ subs: lineup.subs.filter((s) => s.id !== id) });
  }

  const name = (id: string) => {
    const p = playersById.get(id);
    return p ? `${p.firstName} ${p.lastName}` : 'Unknown';
  };

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
      <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900">Planned Substitutions</div>
      <p className="px-3 pt-2 text-xs text-gray-500">
        Declare a sub you already know is coming, keyed to the rotation it starts at (e.g. "Leila in for Olivia
        starting Rotation 2"). It stays in effect for that rotation and every one after it — 2 through 6, then 1 —
        until another planned sub reverses it. Rotations 2-6 above and the Live tab both reflect this automatically.
      </p>

      {sortedSubs.length === 0 && !showAdd && <p className="px-3 py-2 text-sm text-gray-400">No subs planned yet.</p>}

      <ul className="divide-y divide-gray-100">
        {sortedSubs.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap">
            <span className="text-sm text-gray-900">
              <span className="font-medium">{name(s.inPlayerId)}</span>
              <span className="text-gray-400"> in for </span>
              <span className="font-medium">{name(s.outPlayerId)}</span>
              <span className="text-xs text-gray-500 ml-1">from Rotation {s.effectiveRotation}</span>
            </span>
            <button
              type="button"
              onClick={() => removeSub(s.id)}
              className="min-h-8 px-2.5 rounded-md bg-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-300 shrink-0"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {showAdd ? (
        <div className="px-3 py-3 border-t border-gray-100 space-y-2">
          <select className={selectClass} value={outPlayerId} onChange={(e) => setOutPlayerId(e.target.value)}>
            <option value="">Player coming out…</option>
            {rosterPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
          <select className={selectClass} value={inPlayerId} onChange={(e) => setInPlayerId(e.target.value)}>
            <option value="">Player coming in…</option>
            {rosterPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 shrink-0">Starting at Rotation:</span>
            <select
              className={selectClass}
              value={effectiveRotation}
              onChange={(e) => setEffectiveRotation(Number(e.target.value))}
            >
              {ROTATIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addSub}
              disabled={!outPlayerId || !inPlayerId}
              className="min-h-11 flex-1 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="min-h-9 px-3 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-xs font-medium"
          >
            + Add planned sub
          </button>
        </div>
      )}
    </div>
  );
}

function LiberoSection({
  lineup,
  rosterPlayers,
  starters,
  onPersist,
}: {
  lineup: GameLineup;
  rosterPlayers: Player[];
  starters: Player[];
  onPersist: (patch: Partial<Pick<GameLineup, 'liberoPlayerId' | 'liberoForPlayerId'>>) => void;
}) {
  const playersById = new Map(rosterPlayers.map((p) => [p.id, p]));
  const plan =
    lineup.liberoForPlayerId && Object.keys(lineup.zoneAssignments).length === 6
      ? liberoRotationPlan(lineup.zoneAssignments, lineup.liberoForPlayerId)
      : [];
  const backRowStops = plan.filter((s) => s.backRow);
  const servingStop = backRowStops.find((s) => s.zone === 1);

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
      <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900">🛡 Libero</div>
      <div className="px-3 py-3 space-y-2">
        <label className="block text-xs font-medium text-gray-500">Libero</label>
        <select
          className={selectClass}
          value={lineup.liberoPlayerId ?? ''}
          onChange={(e) => onPersist({ liberoPlayerId: e.target.value || undefined })}
        >
          <option value="">Not designated for this set</option>
          {rosterPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
            </option>
          ))}
        </select>

        {lineup.liberoPlayerId && (
          <>
            <label className="block text-xs font-medium text-gray-500">Replaces (shadows this starter's back-row zones)</label>
            <select
              className={selectClass}
              value={lineup.liberoForPlayerId ?? ''}
              onChange={(e) => onPersist({ liberoForPlayerId: e.target.value || undefined })}
            >
              <option value="">Select a starter…</option>
              {starters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          </>
        )}

        {lineup.liberoPlayerId && lineup.liberoForPlayerId && (
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-xs text-violet-900">
            {backRowStops.length === 0 ? (
              <p>Fill in all 6 starting spots above to compute the libero's rotation plan.</p>
            ) : (
              <>
                <p className="font-medium mb-1">
                  {playersById.get(lineup.liberoPlayerId)?.firstName} is in for{' '}
                  {playersById.get(lineup.liberoForPlayerId)?.firstName} at Rotation
                  {backRowStops.length > 1 ? 's' : ''} {backRowStops.map((s) => s.rotation).join(', ')} (back row).
                </p>
                <p>
                  {servingStop
                    ? `Serves at Rotation ${servingStop.rotation} (Zone 1).`
                    : `Doesn't reach Zone 1 with this lineup — won't serve.`}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
