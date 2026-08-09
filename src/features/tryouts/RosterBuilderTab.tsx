import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import type { Player, Position, PositionTarget, RosterCandidate, Team } from '../../types';
import { DEFAULT_POSITION_TARGETS, TEAM_LABELS, TEAM_LEVEL, TEAM_RANK, TEAMS } from './teams';
import { POSITIONS, POSITION_LABELS } from './skills';
import { PositionBadges } from './PositionBadges';
import { computeLevelScopedSkillAverages, overallAvgFromSkills } from './composite';
import { CandidateComparisonModal } from './CandidateComparisonModal';

const inputClass =
  'min-h-9 w-14 rounded border border-gray-300 px-1 text-center text-sm focus:border-blue-500 focus:outline-none';

// Position rows are seeded on demand with deterministic ids (`${team}:${position}`)
// so re-running this is naturally idempotent and never clobbers a coach's edits.
async function ensurePositionTargets(team: Team) {
  for (const position of POSITIONS) {
    const id = `${team}:${position}`;
    const existing = await db.positionTargets.get(id);
    if (existing) continue;
    const defaults = DEFAULT_POSITION_TARGETS[position];
    try {
      await db.positionTargets.add({ id, team, position, ...defaults });
    } catch {
      // Another concurrent seed already created it — fine, ignore.
    }
  }
}

export function RosterBuilderTab() {
  const [team, setTeam] = useState<Team>('varsity');
  const [comparingPosition, setComparingPosition] = useState<Position | null>(null);

  // Plain effect, not useLiveQuery — liveQuery runs its callback in a
  // read-only transaction, so writes inside it throw ReadOnlyError.
  useEffect(() => {
    ensurePositionTargets(team);
  }, [team]);

  const targets = useLiveQuery(() => db.positionTargets.where('team').equals(team).toArray(), [team]);
  const candidates = useLiveQuery(() => db.rosterCandidates.where('team').equals(team).toArray(), [team]);
  const players = useLiveQuery(async () => {
    const all = await db.players.orderBy('lastName').toArray();
    return all.filter((p) => p.active);
  }, []);

  const level = TEAM_LEVEL[team];
  const skillAveragesByLevel = useLiveQuery(() => computeLevelScopedSkillAverages(), []);
  const skillsByPlayer = skillAveragesByLevel?.get(level) ?? new Map();

  const playersById = new Map((players ?? []).map((p) => [p.id, p]));
  const targetByPosition = new Map((targets ?? []).map((t) => [t.position, t]));

  const candidatesByPosition = new Map<Position, RosterCandidate[]>();
  for (const c of candidates ?? []) {
    const list = candidatesByPosition.get(c.position) ?? [];
    list.push(c);
    candidatesByPosition.set(c.position, list);
  }

  const comparingCandidates =
    comparingPosition != null
      ? (candidatesByPosition.get(comparingPosition) ?? []).filter((c) => c.status === 'considering')
      : [];

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {TEAMS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(t)}
            className={`min-h-11 px-4 rounded-lg text-sm font-medium border ${
              team === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {TEAM_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {POSITIONS.map((position) => (
          <PositionCard
            key={position}
            team={team}
            position={position}
            target={targetByPosition.get(position)}
            candidates={candidatesByPosition.get(position) ?? []}
            playersById={playersById}
            skillsByPlayer={skillsByPlayer}
            onCompare={() => setComparingPosition(position)}
          />
        ))}
      </div>

      {comparingPosition && (
        <CandidateComparisonModal
          position={comparingPosition}
          candidates={comparingCandidates}
          playersById={playersById}
          skillsByPlayer={skillsByPlayer}
          onClose={() => setComparingPosition(null)}
        />
      )}
    </div>
  );
}

function PositionCard({
  team,
  position,
  target,
  candidates,
  playersById,
  skillsByPlayer,
  onCompare,
}: {
  team: Team;
  position: Position;
  target: PositionTarget | undefined;
  candidates: RosterCandidate[];
  playersById: Map<string, Player>;
  skillsByPlayer: Map<string, Partial<Record<string, number>>>;
  onCompare: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);

  const confirmed = candidates.filter((c) => c.status === 'confirmed');
  const considering = candidates.filter((c) => c.status === 'considering');

  const minCount = target?.minCount ?? DEFAULT_POSITION_TARGETS[position].minCount;
  const targetCount = target?.targetCount ?? DEFAULT_POSITION_TARGETS[position].targetCount;

  const statusColor =
    confirmed.length >= targetCount
      ? 'bg-emerald-100 text-emerald-700'
      : confirmed.length >= minCount
        ? 'bg-amber-100 text-amber-700'
        : 'bg-rose-100 text-rose-700';

  async function updateTarget(patch: Partial<Pick<PositionTarget, 'minCount' | 'targetCount'>>) {
    const id = `${team}:${position}`;
    const existing = await db.positionTargets.get(id);
    if (existing) {
      await db.positionTargets.update(id, patch);
    } else {
      await db.positionTargets.add({
        id,
        team,
        position,
        ...DEFAULT_POSITION_TARGETS[position],
        ...patch,
      });
    }
  }

  async function setStatus(candidateId: string, status: RosterCandidate['status']) {
    if (status === 'confirmed') {
      const candidate = candidates.find((c) => c.id === candidateId);
      if (candidate) {
        // A player fills exactly one slot per team — demote any other confirmed
        // slot they hold on this team back to "considering".
        const others = await db.rosterCandidates
          .where('team')
          .equals(team)
          .filter((c) => c.playerId === candidate.playerId && c.status === 'confirmed' && c.id !== candidateId)
          .toArray();
        for (const other of others) {
          await db.rosterCandidates.update(other.id, { status: 'considering' });
        }
      }
    }
    await db.rosterCandidates.update(candidateId, { status });
  }

  async function removeCandidate(candidateId: string) {
    await db.rosterCandidates.delete(candidateId);
  }

  function renderRow(candidate: RosterCandidate, kind: 'confirmed' | 'considering') {
    const player = playersById.get(candidate.playerId);
    if (!player) return null;
    const avg = overallAvgFromSkills(skillsByPlayer.get(player.id) ?? {});
    const otherPositions = player.positions.filter((p) => p !== position);
    return (
      <li key={candidate.id} className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-medium text-gray-900 whitespace-nowrap">
            {player.firstName} {player.lastName}
          </span>
          <PositionBadges positions={otherPositions} />
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {avg != null ? `Avg ${avg.toFixed(1)}` : 'No scores yet'}
          </span>
        </span>
        <span className="flex gap-1 shrink-0">
          {kind === 'considering' && (
            <button
              type="button"
              onClick={() => setStatus(candidate.id, 'confirmed')}
              className="min-h-9 px-2 rounded-lg bg-emerald-600 text-white text-xs font-medium active:bg-emerald-700"
            >
              Confirm
            </button>
          )}
          {kind === 'confirmed' && (
            <button
              type="button"
              onClick={() => setStatus(candidate.id, 'considering')}
              className="min-h-9 px-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium"
            >
              Unconfirm
            </button>
          )}
          <button
            type="button"
            onClick={() => removeCandidate(candidate.id)}
            className="min-h-9 px-2 rounded-lg border border-gray-300 text-gray-500 text-xs font-medium"
          >
            Remove
          </button>
        </span>
      </li>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 flex-wrap">
        <span className="font-semibold text-gray-900">{POSITION_LABELS[position]}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
            {confirmed.length} / {targetCount} confirmed
          </span>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            Min
            <input
              type="number"
              min={0}
              className={inputClass}
              value={minCount}
              onChange={(e) => updateTarget({ minCount: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            Target
            <input
              type="number"
              min={0}
              className={inputClass}
              value={targetCount}
              onChange={(e) => updateTarget({ targetCount: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      {confirmed.length > 0 && <ul className="divide-y divide-gray-100">{confirmed.map((c) => renderRow(c, 'confirmed'))}</ul>}

      {considering.length > 0 && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {considering.map((c) => renderRow(c, 'considering'))}
        </ul>
      )}

      {confirmed.length === 0 && considering.length === 0 && (
        <p className="px-3 py-2 text-sm text-gray-400">No candidates yet.</p>
      )}

      <div className="flex gap-2 px-3 py-2 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="min-h-9 px-3 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-xs font-medium"
        >
          + Add candidate
        </button>
        {considering.length >= 2 && (
          <button
            type="button"
            onClick={onCompare}
            className="min-h-9 px-3 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium"
          >
            Compare {considering.length} candidates
          </button>
        )}
      </div>

      {showAdd && (
        <AddCandidatesModal
          team={team}
          position={position}
          existingPlayerIds={new Set(candidates.map((c) => c.playerId))}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function AddCandidatesModal({
  team,
  position,
  existingPlayerIds,
  onClose,
}: {
  team: Team;
  position: Position;
  existingPlayerIds: Set<string>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const players = useLiveQuery(async () => {
    const all = await db.players.toArray();
    return all
      .filter((p) => p.active && !existingPlayerIds.has(p.id))
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, []);

  // Confirmed-elsewhere lookup, across every team, so a player already locked
  // into a higher-ranked team shows as unavailable here rather than letting a
  // coach double-book them onto a lower team.
  const confirmedElsewhere = useLiveQuery(
    () => db.rosterCandidates.where('status').equals('confirmed').toArray(),
    [],
  );
  const bestConfirmedTeamByPlayer = new Map<string, Team>();
  for (const c of confirmedElsewhere ?? []) {
    const existing = bestConfirmedTeamByPlayer.get(c.playerId);
    if (!existing || TEAM_RANK[c.team] < TEAM_RANK[existing]) {
      bestConfirmedTeamByPlayer.set(c.playerId, c.team);
    }
  }

  const query = search.trim().toLowerCase();
  const visiblePlayers = players?.filter(
    (p) => !query || p.firstName.toLowerCase().startsWith(query) || p.lastName.toLowerCase().startsWith(query),
  );

  function toggle(playerId: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  async function handleAdd() {
    for (const playerId of selected) {
      const candidate: RosterCandidate = {
        id: crypto.randomUUID(),
        team,
        position,
        playerId,
        status: 'considering',
        createdAt: new Date().toISOString(),
      };
      await db.rosterCandidates.add(candidate);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-xl font-bold mb-1">Add {POSITION_LABELS[position]} Candidates</h2>
        <p className="text-sm text-gray-500 mb-3">{selected.size} selected</p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          autoFocus
          className="min-h-11 w-full rounded-lg border border-gray-300 px-3 mb-3 text-base focus:border-blue-500 focus:outline-none"
        />

        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden max-h-80 overflow-y-auto mb-4">
          {visiblePlayers?.map((p) => {
            const checked = selected.has(p.id);
            const lockedByTeam = bestConfirmedTeamByPlayer.get(p.id);
            const locked = lockedByTeam != null && TEAM_RANK[lockedByTeam] < TEAM_RANK[team];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => toggle(p.id)}
                  title={locked ? `Already confirmed on ${TEAM_LABELS[lockedByTeam]}` : undefined}
                  className={`w-full min-h-11 flex items-center gap-3 px-4 py-2 text-left ${
                    locked ? 'opacity-40 cursor-not-allowed' : checked ? 'bg-blue-50' : ''
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
                    {locked && (
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        Confirmed: {TEAM_LABELS[lockedByTeam]}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {players !== undefined && players.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-400">Everyone active is already listed for this position.</li>
          )}
          {players !== undefined && players.length > 0 && visiblePlayers?.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-400">No players match "{search}".</li>
          )}
        </ul>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700 active:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.size === 0}
            className="min-h-11 flex-1 rounded-lg bg-blue-600 text-base font-medium text-white active:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
