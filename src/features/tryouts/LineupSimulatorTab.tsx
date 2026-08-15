import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { CourtZone, LineupSub, Player, RosterCandidate, SavedLineup, Skill, Team } from '../../types';
import { TEAM_LEVEL } from './teams';
import { computeLevelScopedSkillAverages } from './composite';
import { playerGradeLabel } from '../../lib/playerSearch';
import { zoneAssignmentsForRotation } from './lineupRotation';
import { PlayerRadarPopover } from './PlayerRadarPopover';

const ZONE_GRID: CourtZone[][] = [
  [4, 3, 2], // front row, at the net
  [5, 6, 1], // back row
];
const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;

const inputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none';

export function LineupSimulatorTab({ team }: { team: Team }) {
  const [selectedLineupId, setSelectedLineupId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const lineups = useLiveQuery(async () => {
    const { data } = await supabase.from('lineups').select('*').eq('team', team).order('createdAt');
    return (data as SavedLineup[]) ?? [];
  }, [team]);

  async function createLineup() {
    const name = newName.trim() || 'New Lineup';
    const lineup: SavedLineup = {
      id: crypto.randomUUID(),
      team,
      name,
      zoneAssignments: {},
      subs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await supabase.from('lineups').insert(lineup);
    setNewName('');
    setSelectedLineupId(lineup.id);
  }

  async function deleteLineup(id: string) {
    await supabase.from('lineups').delete().eq('id', id);
    if (selectedLineupId === id) setSelectedLineupId(null);
  }

  const selectedLineup = (lineups ?? []).find((l) => l.id === selectedLineupId);

  if (selectedLineup) {
    return <LineupEditor lineup={selectedLineup} team={team} onBack={() => setSelectedLineupId(null)} />;
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Build and compare possible starting lineups for this team. Rotations 2-6 are derived automatically from
        Rotation 1 by standard clockwise rotation.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          className={inputClass}
          placeholder="Lineup name (e.g. vs. Lakewood)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="button"
          onClick={createLineup}
          className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700 shrink-0"
        >
          + New
        </button>
      </div>

      {lineups !== undefined && lineups.length === 0 && (
        <p className="text-gray-500">No lineups yet for this team. Create one above.</p>
      )}

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
        {lineups?.map((l) => {
          const filled = Object.keys(l.zoneAssignments).length;
          return (
            <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setSelectedLineupId(l.id)}
                className="flex-1 min-h-11 text-left"
              >
                <span className="font-medium text-gray-900">{l.name}</span>
                <span className="text-xs text-gray-500 ml-2">{filled}/6 filled</span>
              </button>
              <button
                type="button"
                onClick={() => deleteLineup(l.id)}
                className="min-h-9 px-2 rounded-lg border border-gray-300 text-gray-500 text-xs font-medium"
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LineupEditor({ lineup, team, onBack }: { lineup: SavedLineup; team: Team; onBack: () => void }) {
  const [rotation, setRotation] = useState<(typeof ROTATIONS)[number]>(1);
  const [selectedBenchPlayerId, setSelectedBenchPlayerId] = useState<string | null>(null);

  const candidates = useLiveQuery(async () => {
    const { data } = await supabase.from('rosterCandidates').select('*').eq('team', team);
    return (data as RosterCandidate[]) ?? [];
  }, [team]);
  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);
  const skillAveragesByLevel = useLiveQuery(() => computeLevelScopedSkillAverages(), []);
  const skillsByPlayer = skillAveragesByLevel?.get(TEAM_LEVEL[team]) ?? new Map<string, Partial<Record<Skill, number>>>();

  const playersById = new Map((players ?? []).map((p) => [p.id, p]));
  const candidatePlayerIds = [...new Set((candidates ?? []).map((c) => c.playerId))];
  const candidatePlayers = candidatePlayerIds
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  async function persist(patch: Partial<Pick<SavedLineup, 'name' | 'zoneAssignments' | 'subs'>>) {
    await supabase.from('lineups').update({ ...patch, updatedAt: new Date().toISOString() }).eq('id', lineup.id);
  }

  const displayedAssignments =
    rotation === 1 ? lineup.zoneAssignments : zoneAssignmentsForRotation(lineup.zoneAssignments, rotation);

  const placedIds = new Set(Object.values(lineup.zoneAssignments));
  const bench = candidatePlayers.filter((p) => !placedIds.has(p.id));

  function handleBenchClick(playerId: string) {
    setSelectedBenchPlayerId((cur) => (cur === playerId ? null : playerId));
  }

  function handleCellClick(zone: CourtZone) {
    if (rotation !== 1) return;
    const next = { ...lineup.zoneAssignments };
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
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 shrink-0"
        >
          ‹ Lineups
        </button>
        <input
          className={inputClass}
          value={lineup.name}
          onChange={(e) => persist({ name: e.target.value })}
        />
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
                  className={`relative min-h-24 rounded-lg border-2 p-2 flex flex-col items-center justify-center text-center ${
                    rotation !== 1
                      ? player
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
                  {player && (
                    <span className="absolute top-1 right-1" onClick={(e) => e.stopPropagation()}>
                      <PlayerRadarPopover player={player} bySkill={skillsByPlayer.get(player.id) ?? {}} />
                    </span>
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

      {rotation === 1 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
          <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900">Bench</div>
          {bench.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Everyone's on the court.</p>}
          <ul className="divide-y divide-gray-100">
            {bench.map((p) => (
              <li key={p.id}>
                <div
                  className={`w-full min-h-11 flex items-center gap-2 px-3 py-2 ${
                    selectedBenchPlayerId === p.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <button type="button" onClick={() => handleBenchClick(p.id)} className="flex-1 text-left">
                    <span className="font-medium text-gray-900">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">{playerGradeLabel(p)}</span>
                  </button>
                  <PlayerRadarPopover player={p} bySkill={skillsByPlayer.get(p.id) ?? {}} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SubsSection lineup={lineup} candidatePlayers={candidatePlayers} skillsByPlayer={skillsByPlayer} onPersist={persist} />
    </div>
  );
}

function SubsSection({
  lineup,
  candidatePlayers,
  skillsByPlayer,
  onPersist,
}: {
  lineup: SavedLineup;
  candidatePlayers: Player[];
  skillsByPlayer: Map<string, Partial<Record<Skill, number>>>;
  onPersist: (patch: Partial<Pick<SavedLineup, 'subs'>>) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [inPlayerId, setInPlayerId] = useState('');
  const [outPlayerId, setOutPlayerId] = useState('');
  const [note, setNote] = useState('');
  const playersById = new Map(candidatePlayers.map((p) => [p.id, p]));

  function addSub() {
    if (!inPlayerId || !outPlayerId) return;
    const sub: LineupSub = { id: crypto.randomUUID(), inPlayerId, outPlayerId, note: note.trim() || undefined };
    onPersist({ subs: [...lineup.subs, sub] });
    setInPlayerId('');
    setOutPlayerId('');
    setNote('');
    setShowAdd(false);
  }

  function removeSub(id: string) {
    onPersist({ subs: lineup.subs.filter((s) => s.id !== id) });
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900">Subs</div>

      {lineup.subs.length === 0 && !showAdd && <p className="px-3 py-2 text-sm text-gray-400">No subs planned yet.</p>}

      <ul className="divide-y divide-gray-100">
        {lineup.subs.map((s) => {
          const inPlayer = playersById.get(s.inPlayerId);
          const outPlayer = playersById.get(s.outPlayerId);
          return (
            <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap">
              <span className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-sm text-gray-900">
                  {inPlayer ? `${inPlayer.firstName} ${inPlayer.lastName}` : 'Unknown'}
                  {inPlayer && (
                    <span onClick={(e) => e.stopPropagation()} className="inline-block align-middle ml-1">
                      <PlayerRadarPopover player={inPlayer} bySkill={skillsByPlayer.get(inPlayer.id) ?? {}} />
                    </span>
                  )}
                  <span className="text-gray-400"> subs for </span>
                  {outPlayer ? `${outPlayer.firstName} ${outPlayer.lastName}` : 'Unknown'}
                  {outPlayer && (
                    <span onClick={(e) => e.stopPropagation()} className="inline-block align-middle ml-1">
                      <PlayerRadarPopover player={outPlayer} bySkill={skillsByPlayer.get(outPlayer.id) ?? {}} />
                    </span>
                  )}
                </span>
                {s.note && <span className="text-xs text-gray-500">— {s.note}</span>}
              </span>
              <button
                type="button"
                onClick={() => removeSub(s.id)}
                className="min-h-9 px-2 rounded-lg border border-gray-300 text-gray-500 text-xs font-medium shrink-0"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      {showAdd ? (
        <div className="px-3 py-3 border-t border-gray-100 space-y-2">
          <select className={inputClass} value={inPlayerId} onChange={(e) => setInPlayerId(e.target.value)}>
            <option value="">Player coming in…</option>
            {candidatePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
          <select className={inputClass} value={outPlayerId} onChange={(e) => setOutPlayerId(e.target.value)}>
            <option value="">Player coming out…</option>
            {candidatePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
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
              disabled={!inPlayerId || !outPlayerId}
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
            + Add sub
          </button>
        </div>
      )}
    </div>
  );
}
