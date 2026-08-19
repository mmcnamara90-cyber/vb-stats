import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { CourtZone, Game, GameLineup, LiberoAssignment, Player, PlannedSub } from '../../types';
import { playerGradeLabel } from '../../lib/playerSearch';
import { PositionBadges } from '../tryouts/PositionBadges';
import { computeEffectiveCourt, liberoRotationPlan } from './effectiveCourt';
import { fetchTeamSettings } from '../settings/teamSettings';

const ZONE_GRID: CourtZone[][] = [
  [4, 3, 2], // front row, at the net
  [5, 6, 1], // back row
];
const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;

const selectClass =
  'min-h-10 w-full rounded-lg border border-gray-300 px-2 text-sm focus:border-brand-indigo focus:outline-none';

// Pre-fill this many blank libero slots (from Settings > Preferences,
// "Liberos you typically run") so the coach just fills in names instead of
// clicking "+ Add libero" first every set.
function blankLiberoSlots(count: number): LiberoAssignment[] {
  return Array.from({ length: count }, () => ({ id: crypto.randomUUID(), liberoPlayerId: '', shadowedPlayerIds: [] }));
}

function emptyLineup(gameId: string, setNumber: number, liberoCount: number): GameLineup {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    gameId,
    setNumber,
    zoneAssignments: {},
    subs: [],
    liberos: blankLiberoSlots(liberoCount),
    createdAt: now,
    updatedAt: now,
  };
}

// A placeholder used only until we know whether a real row exists for this
// set — deliberately stamped with an empty (not "now") updatedAt, which
// sorts before every real ISO timestamp. Stamping it "now" instead was a
// real bug caught in testing: a freshly-mounted phantom's timestamp is
// *newer* than whatever real, previously-saved row eventually loads, so
// the "adopt the server row once it's at least as fresh" check never fired
// and a saved lineup would appear empty until you edited it.
function phantomLineup(gameId: string, setNumber: number, liberoCount: number): GameLineup {
  return { ...emptyLineup(gameId, setNumber, liberoCount), updatedAt: '' };
}

export function GameLineupTab({ game }: { game: Game }) {
  const [setNumber, setSetNumber] = useState(1);
  const [rotation, setRotation] = useState<(typeof ROTATIONS)[number]>(1);
  const [selectedBenchPlayerId, setSelectedBenchPlayerId] = useState<string | null>(null);
  const [subTargetZone, setSubTargetZone] = useState<CourtZone | null>(null);

  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);
  const lineups = useLiveQuery(async () => {
    const { data } = await supabase.from('gameLineups').select('*').eq('gameId', game.id).order('setNumber');
    return (data as GameLineup[]) ?? [];
  }, [game.id]);
  const teamSettings = useLiveQuery(() => fetchTeamSettings(game.team), [game.team]);
  const liberoCount = teamSettings?.liberoCount ?? 1;

  const playersById = new Map((players ?? []).map((p) => [p.id, p]));
  const rosterPlayers = game.rosterPlayerIds
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  const setNumbers = [...new Set([1, setNumber, ...(lineups ?? []).map((l) => l.setNumber)])].sort((a, b) => a - b);
  const serverLineup = (lineups ?? []).find((l) => l.setNumber === setNumber);

  // Local optimistic copy of the lineup being edited. Every edit here
  // (toggling both libero "shadow" buttons back to back, adding a sub then
  // immediately adding another, etc.) is a burst of persist() calls that
  // happen faster than a Supabase upsert + realtime refetch round-trip —
  // if each call read its base from the query result directly, the second
  // call would still see the pre-first-edit snapshot and silently clobber
  // it on upsert. Keeping a local copy that advances synchronously on every
  // persist() sidesteps that; it re-syncs to the server row once that row
  // is at least as fresh as our own last write (or immediately on set
  // switch), so it never diverges for long or fights genuine server state.
  // Starts null rather than lazily building a phantom at mount time —
  // building it eagerly raced teamSettings (still loading on first mount,
  // always `undefined` for at least one render since the fetch is async),
  // so a fresh Set 1 would silently get 1 pre-filled libero slot even when
  // the coach has liberoCount set to 2. Waiting for teamSettings before
  // creating the phantom (below) fixes that at the cost of one extra
  // "Loading…" beat on first visit.
  const [workingLineup, setWorkingLineup] = useState<GameLineup | null>(null);

  useEffect(() => {
    if (teamSettings === undefined) return;
    setWorkingLineup((cur) => {
      if (!cur || cur.setNumber !== setNumber) return serverLineup ?? phantomLineup(game.id, setNumber, liberoCount);
      if (serverLineup && serverLineup.updatedAt >= cur.updatedAt) return serverLineup;
      return cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLineup, setNumber, teamSettings, liberoCount]);

  if (lineups === undefined || players === undefined || workingLineup === null) {
    return <p className="text-gray-500">Loading…</p>;
  }

  const lineup = workingLineup;

  async function persist(patch: Partial<Pick<GameLineup, 'zoneAssignments' | 'subs' | 'liberos'>>) {
    const updated = { ...lineup, ...patch, updatedAt: new Date().toISOString() };
    setWorkingLineup(updated);
    await supabase.from('gameLineups').upsert(updated);
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
    if (rotation === 1) {
      const next = { ...zoneAssignments };
      if (selectedBenchPlayerId) {
        next[zone] = selectedBenchPlayerId;
        setSelectedBenchPlayerId(null);
        persist({ zoneAssignments: next });
      } else if (next[zone]) {
        delete next[zone];
        persist({ zoneAssignments: next });
      }
      return;
    }
    // Rotations 2-6: tapping a cell opens/closes the "sub someone in here,
    // starting at this rotation" picker for that zone.
    setSubTargetZone((cur) => (cur === zone ? null : zone));
  }

  function scheduleSub(zone: CourtZone, inPlayerId: string) {
    const outPlayerId = effective.zoneAssignments[zone];
    if (!outPlayerId) return;
    const sub: PlannedSub = { id: crypto.randomUUID(), outPlayerId, inPlayerId, effectiveRotation: rotation };
    persist({ subs: [...lineup.subs, sub] });
    setSubTargetZone(null);
  }

  function removeSub(id: string) {
    persist({ subs: lineup.subs.filter((s) => s.id !== id) });
  }

  const onCourtIds = new Set(Object.values(effective.zoneAssignments));
  const subCandidates = rosterPlayers.filter((p) => !onCourtIds.has(p.id));

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
            onClick={() => { setSetNumber(n); setRotation(1); setSubTargetZone(null); }}
            className={`min-h-9 px-3 rounded-lg text-sm font-medium border ${
              setNumber === n ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
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
            onClick={() => { setRotation(r); setSubTargetZone(null); }}
            className={`min-h-9 px-3 rounded-lg text-sm font-medium border ${
              rotation === r ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            Rotation {r}
          </button>
        ))}
      </div>
      {rotation !== 1 ? (
        <p className="text-xs text-gray-500 mb-2">
          {subTargetZone
            ? 'Pick who subs in below.'
            : 'Shows the derived court for this rotation, plus any subs/libero already in effect. Tap a player to schedule a sub starting here.'}
        </p>
      ) : (
        <p className="text-xs text-gray-500 mb-2">
          {selectedBenchPlayerId
            ? 'Tap a court cell to place the selected player.'
            : 'Tap a bench player, then a court cell to place them. Tap a filled cell to clear it. (This grid always shows the raw starting six — subs and the libero swap apply starting from the Live/preview rotations, not here.)'}
        </p>
      )}

      {rotation !== 1 && effective.liberoConflict && (
        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
          ⚠️ Two different liberos would both be on court this rotation — NFHS only allows one at a time. Check the
          Libero section below.
        </p>
      )}

      <div className="mb-1 text-center text-xs font-medium tracking-widest text-gray-400">— NET —</div>
      <div className="rounded-xl border border-gray-200 p-2 mb-2 bg-gray-50">
        {ZONE_GRID.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 mb-2 last:mb-0">
            {row.map((zone) => {
              const playerId = displayedAssignments[zone];
              const player = playerId ? playersById.get(playerId) : undefined;
              const activeLibero = rotation !== 1 ? effective.liberosOnCourt.find((l) => l.zone === zone) : undefined;
              const isTargeted = rotation !== 1 && subTargetZone === zone;
              return (
                <div
                  key={zone}
                  role="button"
                  tabIndex={0}
                  aria-label={`Zone ${zone}${player ? `: ${player.firstName} ${player.lastName}` : ', empty'}`}
                  onClick={() => handleCellClick(zone)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCellClick(zone);
                    }
                  }}
                  className={`relative min-h-24 rounded-lg border-2 p-2 flex flex-col items-center justify-center text-center cursor-pointer ${
                    rotation !== 1
                      ? isTargeted
                        ? 'bg-blue-50 border-blue-400 border-dashed'
                        : activeLibero
                          ? 'bg-violet-100 border-violet-400'
                          : player
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-white border-gray-200'
                      : player
                        ? 'bg-blue-100 border-brand-indigo'
                        : selectedBenchPlayerId
                          ? 'bg-blue-50 border-blue-400 border-dashed cursor-pointer'
                          : 'bg-white border-gray-200'
                  }`}
                >
                  <span className="absolute top-1 left-1 text-[10px] text-gray-500 font-medium">{zone}</span>
                  {activeLibero && (
                    <span className="absolute top-1 right-1 text-[10px]">🛡{activeLibero.serving ? '🎯' : ''}</span>
                  )}
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

      {rotation !== 1 && subTargetZone && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 overflow-hidden mb-4">
          <div className="px-3 py-2 text-xs text-blue-900">
            Sub in for <span className="font-semibold">
              {playersById.get(effective.zoneAssignments[subTargetZone] ?? '')?.firstName ?? 'this spot'}
            </span>{' '}
            (Zone {subTargetZone}), starting Rotation {rotation}:
          </div>
          <ul className="divide-y divide-blue-100 bg-white">
            {subCandidates.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">Everyone else is already on the court.</li>
            )}
            {subCandidates.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => scheduleSub(subTargetZone, p.id)}
                  className="w-full min-h-11 flex items-center gap-2 px-3 py-2 text-left active:bg-blue-50"
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
          <button
            type="button"
            onClick={() => setSubTargetZone(null)}
            className="w-full min-h-9 px-3 py-2 text-xs font-medium text-gray-500 border-t border-blue-100"
          >
            Cancel
          </button>
        </div>
      )}

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

      <SubsList lineup={lineup} rosterPlayers={rosterPlayers} onRemove={removeSub} />
      <LiberoSection lineup={lineup} rosterPlayers={rosterPlayers} starters={starters} onPersist={persist} />
    </div>
  );
}

function SubsList({
  lineup,
  rosterPlayers,
  onRemove,
}: {
  lineup: GameLineup;
  rosterPlayers: Player[];
  onRemove: (id: string) => void;
}) {
  const playersById = new Map(rosterPlayers.map((p) => [p.id, p]));
  const sortedSubs = [...lineup.subs].sort((a, b) => a.effectiveRotation - b.effectiveRotation);
  const name = (id: string) => {
    const p = playersById.get(id);
    return p ? `${p.firstName} ${p.lastName}` : 'Unknown';
  };

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
      <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900">Planned Substitutions</div>
      <p className="px-3 pt-2 text-xs text-gray-500">
        On Rotations 2-6 above, tap the player leaving the court, then pick who's coming in — it takes effect that
        rotation and stays until another sub reverses it.
      </p>
      {sortedSubs.length === 0 ? (
        <p className="px-3 py-2 text-sm text-gray-400">No subs planned yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 mt-1">
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
                onClick={() => onRemove(s.id)}
                className="min-h-8 px-2.5 rounded-md bg-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-300 shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
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
  onPersist: (patch: Partial<Pick<GameLineup, 'liberos'>>) => void;
}) {
  function updateAssignment(id: string, patch: Partial<LiberoAssignment>) {
    onPersist({ liberos: lineup.liberos.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }

  function addAssignment() {
    if (lineup.liberos.length >= 2) return;
    const assignment: LiberoAssignment = { id: crypto.randomUUID(), liberoPlayerId: '', shadowedPlayerIds: [] };
    onPersist({ liberos: [...lineup.liberos, assignment] });
  }

  function removeAssignment(id: string) {
    onPersist({ liberos: lineup.liberos.filter((a) => a.id !== id) });
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
      <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900">🛡 Libero{lineup.liberos.length !== 1 ? 's' : ''}</div>
      <p className="px-3 pt-2 text-xs text-gray-500">
        NFHS allows up to 2 designated liberos per set. Each can shadow one or two starters (commonly both middles) —
        she takes over whichever of them is currently back row.
      </p>

      {lineup.liberos.map((assignment, i) => (
        <LiberoAssignmentCard
          key={assignment.id}
          index={i}
          assignment={assignment}
          lineup={lineup}
          rosterPlayers={rosterPlayers}
          starters={starters}
          onChange={(patch) => updateAssignment(assignment.id, patch)}
          onRemove={() => removeAssignment(assignment.id)}
        />
      ))}

      <div className="px-3 py-2 border-t border-gray-100">
        <button
          type="button"
          onClick={addAssignment}
          disabled={lineup.liberos.length >= 2}
          className="min-h-9 px-3 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-xs font-medium disabled:opacity-40"
        >
          + Add libero{lineup.liberos.length >= 2 ? ' (max 2)' : ''}
        </button>
      </div>
    </div>
  );
}

function LiberoAssignmentCard({
  index,
  assignment,
  lineup,
  rosterPlayers,
  starters,
  onChange,
  onRemove,
}: {
  index: number;
  assignment: LiberoAssignment;
  lineup: GameLineup;
  rosterPlayers: Player[];
  starters: Player[];
  onChange: (patch: Partial<LiberoAssignment>) => void;
  onRemove: () => void;
}) {
  const playersById = new Map(rosterPlayers.map((p) => [p.id, p]));
  const plan =
    assignment.shadowedPlayerIds.length > 0 && Object.keys(lineup.zoneAssignments).length === 6
      ? liberoRotationPlan(lineup.zoneAssignments, assignment)
      : [];
  const servingStop = plan.find((s) => s.serving);

  function toggleShadow(playerId: string) {
    const has = assignment.shadowedPlayerIds.includes(playerId);
    const next = has
      ? assignment.shadowedPlayerIds.filter((id) => id !== playerId)
      : [...assignment.shadowedPlayerIds, playerId];
    const patch: Partial<LiberoAssignment> = { shadowedPlayerIds: next };
    if (assignment.servesForPlayerId && !next.includes(assignment.servesForPlayerId)) {
      patch.servesForPlayerId = undefined;
    }
    onChange(patch);
  }

  return (
    <div className="px-3 py-3 border-t border-gray-100 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">Libero {index + 1}</span>
        <button type="button" onClick={onRemove} className="text-xs text-gray-400 underline">
          Remove
        </button>
      </div>

      <label className="block text-xs font-medium text-gray-500">Player</label>
      <select
        className={selectClass}
        value={assignment.liberoPlayerId}
        onChange={(e) => onChange({ liberoPlayerId: e.target.value })}
      >
        <option value="">Select…</option>
        {rosterPlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.firstName} {p.lastName}
          </option>
        ))}
      </select>

      <label className="block text-xs font-medium text-gray-500">Shadows (tap to toggle, usually both middles)</label>
      <div className="flex flex-wrap gap-1.5">
        {starters.map((p) => {
          const active = assignment.shadowedPlayerIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleShadow(p.id)}
              className={`min-h-9 px-2.5 rounded-lg text-xs font-medium border ${
                active ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              {p.firstName}
            </button>
          );
        })}
      </div>

      {assignment.shadowedPlayerIds.length > 1 && (
        <>
          <label className="block text-xs font-medium text-gray-500">Serves for (which one she actually serves)</label>
          <select
            className={selectClass}
            value={assignment.servesForPlayerId ?? ''}
            onChange={(e) => onChange({ servesForPlayerId: e.target.value || undefined })}
          >
            <option value="">Default: {playersById.get(assignment.shadowedPlayerIds[0])?.firstName ?? 'first'}</option>
            {assignment.shadowedPlayerIds.map((id) => (
              <option key={id} value={id}>
                {playersById.get(id)?.firstName ?? 'Unknown'}
              </option>
            ))}
          </select>
        </>
      )}

      {assignment.liberoPlayerId && assignment.shadowedPlayerIds.length > 0 && (
        <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-xs text-violet-900">
          {plan.length === 0 ? (
            <p>Fill in all 6 starting spots above to compute the rotation plan.</p>
          ) : (
            <>
              <p className="font-medium mb-1">
                {playersById.get(assignment.liberoPlayerId)?.firstName} is in at Rotation
                {plan.length > 1 ? 's' : ''}{' '}
                {plan.map((s) => `${s.rotation} (for ${playersById.get(s.shadowedPlayerId)?.firstName ?? '?'})`).join(', ')}.
              </p>
              <p>
                {servingStop
                  ? `Serves at Rotation ${servingStop.rotation}, for ${playersById.get(servingStop.shadowedPlayerId)?.firstName ?? '?'}.`
                  : `Doesn't reach Zone 1 for the designated server with this lineup — won't serve.`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
