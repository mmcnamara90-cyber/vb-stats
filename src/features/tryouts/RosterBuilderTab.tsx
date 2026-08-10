import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Player, Position, PositionTarget, RosterCandidate, Team } from '../../types';
import { DEFAULT_POSITION_TARGETS, TEAM_LABELS, TEAM_LEVEL, TEAMS, nextLowerTeam } from './teams';
import { POSITIONS, POSITION_LABELS, POSITION_SHORT_LABELS, currentTryoutCycleId } from './skills';
import { PositionBadges } from './PositionBadges';
import { computeLevelScopedSkillAverages, overallAvgFromSkills } from './composite';
import { CandidateComparisonModal } from './CandidateComparisonModal';
import { gradYearToGrade } from '../../lib/grade';
import { matchesPlayerQuery, playerGradeLabel } from '../../lib/playerSearch';
import { PlayerSearchInput } from '../roster/PlayerSearchInput';

const CYCLE_ID = currentTryoutCycleId();

// Which players are cascade-eligible for a team's "available" pool by
// default, before any manual add/remove. Varsity is manual-only (coaches
// pick everyone by hand); JV auto-picks Juniors and below not already on
// Varsity; Level 3 auto-picks Sophomores and below not already on
// Varsity/JV; Freshman shows every Freshman (elsewhere-placed ones just
// show greyed).
function cascadeEligiblePlayers(
  team: Team,
  players: Player[],
  candidatesByTeam: Map<Team, RosterCandidate[]>,
): Player[] {
  const playerIdsOnTeam = (t: Team) => new Set((candidatesByTeam.get(t) ?? []).map((c) => c.playerId));
  const grade = (p: Player) => gradYearToGrade(p.gradYear);

  if (team === 'varsity') return players;
  if (team === 'jv') {
    const varsityIds = playerIdsOnTeam('varsity');
    return players.filter((p) => grade(p) <= 11 && !varsityIds.has(p.id));
  }
  if (team === 'level3') {
    const upperIds = new Set([...playerIdsOnTeam('varsity'), ...playerIdsOnTeam('jv')]);
    return players.filter((p) => grade(p) <= 10 && !upperIds.has(p.id));
  }
  // freshman
  return players.filter((p) => grade(p) === 9);
}

const inputClass =
  'min-h-9 w-14 rounded border border-gray-300 px-1 text-center text-sm focus:border-blue-500 focus:outline-none';

// Position rows are seeded on demand with deterministic ids (`${team}:${position}`)
// so re-running this is naturally idempotent and never clobbers a coach's edits.
async function ensurePositionTargets(team: Team) {
  const rows = POSITIONS.map((position) => ({
    id: `${team}:${position}`,
    team,
    position,
    ...DEFAULT_POSITION_TARGETS[position],
  }));
  // ignoreDuplicates makes this safe to call concurrently (e.g. React
  // StrictMode's double effect invocation) without racing or overwriting a
  // coach's already-edited target values.
  await supabase.from('positionTargets').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
}

export function RosterBuilderTab({ initialTeam }: { initialTeam?: Team }) {
  const [team, setTeam] = useState<Team>(initialTeam ?? 'varsity');
  const [comparingPosition, setComparingPosition] = useState<Position | null>(null);

  // Plain effect, not useLiveQuery — liveQuery runs its callback in a
  // read-only transaction, so writes inside it throw ReadOnlyError.
  useEffect(() => {
    ensurePositionTargets(team);
  }, [team]);

  const targets = useLiveQuery(async () => {
    const { data } = await supabase.from('positionTargets').select('*').eq('team', team);
    return (data as PositionTarget[]) ?? [];
  }, [team]);
  const candidates = useLiveQuery(async () => {
    const { data } = await supabase.from('rosterCandidates').select('*').eq('team', team);
    return (data as RosterCandidate[]) ?? [];
  }, [team]);
  // Across every team — needed for cascade eligibility (e.g. "Juniors not
  // already on Varsity") and the symmetric grey-out rule.
  const allCandidates = useLiveQuery(async () => {
    const { data } = await supabase.from('rosterCandidates').select('*');
    return (data as RosterCandidate[]) ?? [];
  }, []);
  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true).order('lastName');
    return (data as Player[]) ?? [];
  }, []);
  // Cut players (this tryout cycle) are excluded from every team's available
  // pool and count — once cut, they're no longer being considered anywhere.
  const cutPlayerIds = useLiveQuery(async () => {
    const { data } = await supabase
      .from('rosterDecisions')
      .select('playerId')
      .eq('tryoutCycleId', CYCLE_ID)
      .eq('madeTeam', false);
    return new Set(((data as { playerId: string }[]) ?? []).map((d) => d.playerId));
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

  const candidatesByTeam = new Map<Team, RosterCandidate[]>();
  const candidatesByPlayer = new Map<string, RosterCandidate[]>();
  for (const c of allCandidates ?? []) {
    const teamList = candidatesByTeam.get(c.team) ?? [];
    teamList.push(c);
    candidatesByTeam.set(c.team, teamList);
    const playerList = candidatesByPlayer.get(c.playerId) ?? [];
    playerList.push(c);
    candidatesByPlayer.set(c.playerId, playerList);
  }

  async function quickAdd(playerId: string, position: Position) {
    const candidate: RosterCandidate = {
      id: crypto.randomUUID(),
      team,
      position,
      playerId,
      status: 'considering',
      createdAt: new Date().toISOString(),
    };
    await supabase.from('rosterCandidates').insert(candidate);
  }

  async function tagAndAdd(playerId: string, position: Position) {
    await supabase.from('players').update({ positions: [position] }).eq('id', playerId);
    await quickAdd(playerId, position);
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

      <AvailablePlayersWidget
        team={team}
        players={players ?? []}
        candidatesByTeam={candidatesByTeam}
        candidatesByPlayer={candidatesByPlayer}
        cutPlayerIds={cutPlayerIds ?? new Set()}
        onQuickAdd={quickAdd}
        onTagAndAdd={tagAndAdd}
      />

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

// Cascade-eligible players not yet assigned to any position on this team,
// with a one-tap "+ position" button per tagged position. Anyone already
// placed on a DIFFERENT team shows greyed/italic and can't be quick-added —
// they're not "available" here anymore, just visible for context.
function AvailablePlayersWidget({
  team,
  players,
  candidatesByTeam,
  candidatesByPlayer,
  cutPlayerIds,
  onQuickAdd,
  onTagAndAdd,
}: {
  team: Team;
  players: Player[];
  candidatesByTeam: Map<Team, RosterCandidate[]>;
  candidatesByPlayer: Map<string, RosterCandidate[]>;
  cutPlayerIds: Set<string>;
  onQuickAdd: (playerId: string, position: Position) => void;
  onTagAndAdd: (playerId: string, position: Position) => void;
}) {
  const [search, setSearch] = useState('');
  const assignedHere = new Set((candidatesByTeam.get(team) ?? []).map((c) => c.playerId));
  const eligible = cascadeEligiblePlayers(team, players, candidatesByTeam);

  const pool = eligible
    .filter((p) => !cutPlayerIds.has(p.id) && !assignedHere.has(p.id) && matchesPlayerQuery(p, search))
    .map((p) => ({
      player: p,
      greyed: (candidatesByPlayer.get(p.id) ?? []).some((c) => c.team !== team),
    }))
    .sort((a, b) => a.player.firstName.localeCompare(b.player.firstName));

  const availableCount = pool.filter((x) => !x.greyed).length;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50">
        <span className="font-semibold text-gray-900">Available Players</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
          {availableCount} available
        </span>
      </div>

      <div className="px-3 pt-2">
        <PlayerSearchInput value={search} onChange={setSearch} />
      </div>

      {pool.length === 0 && (
        <p className="px-3 py-2 text-sm text-gray-400">
          {search ? `No one matches "${search}".` : 'No one currently eligible.'}
        </p>
      )}

      <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
        {pool.map(({ player, greyed }) => (
          <li key={player.id} className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap">
            <span className={`font-medium whitespace-nowrap ${greyed ? 'italic text-gray-400' : 'text-gray-900'}`}>
              {player.firstName} {player.lastName}
              <span className="text-xs font-normal text-gray-500"> · {playerGradeLabel(player)}</span>
            </span>
            <span className="flex gap-1 flex-wrap">
              {player.positions.length === 0 &&
                (greyed ? (
                  <span className="text-xs text-gray-400 italic">no position tagged</span>
                ) : (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const pos = e.target.value as Position;
                      if (pos) onTagAndAdd(player.id, pos);
                      e.target.value = '';
                    }}
                    className="min-h-9 rounded-lg border border-gray-300 text-xs px-1 text-gray-700"
                  >
                    <option value="" disabled>
                      Tag position…
                    </option>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {POSITION_LABELS[pos]}
                      </option>
                    ))}
                  </select>
                ))}
              {player.positions.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  disabled={greyed}
                  onClick={() => onQuickAdd(player.id, pos)}
                  title={greyed ? 'Already on another team' : `Add as ${POSITION_LABELS[pos]}`}
                  className={`min-h-9 px-2 rounded-lg border text-xs font-medium ${
                    greyed
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'border-blue-300 bg-blue-50 text-blue-700'
                  }`}
                >
                  + {POSITION_SHORT_LABELS[pos]}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
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
    const { data: existing } = await supabase.from('positionTargets').select('*').eq('id', id).maybeSingle();
    await supabase.from('positionTargets').upsert({
      id,
      team,
      position,
      ...DEFAULT_POSITION_TARGETS[position],
      ...existing,
      ...patch,
    });
  }

  async function setStatus(candidateId: string, status: RosterCandidate['status']) {
    if (status === 'confirmed') {
      const candidate = candidates.find((c) => c.id === candidateId);
      if (candidate) {
        // A player fills exactly one slot per team — demote any other confirmed
        // slot they hold on this team back to "considering".
        const { data: others } = await supabase
          .from('rosterCandidates')
          .select('id')
          .eq('team', team)
          .eq('playerId', candidate.playerId)
          .eq('status', 'confirmed')
          .neq('id', candidateId);
        for (const other of (others as { id: string }[]) ?? []) {
          await supabase.from('rosterCandidates').update({ status: 'considering' }).eq('id', other.id);
        }
      }
    }
    await supabase.from('rosterCandidates').update({ status }).eq('id', candidateId);
  }

  async function removeCandidate(candidateId: string) {
    await supabase.from('rosterCandidates').delete().eq('id', candidateId);
  }

  // Moves a candidate off this team and onto the next-lower team's list for
  // the same position, as "considering" — so pushing someone off Varsity
  // lands them straight on JV's list instead of vanishing and needing the
  // JV coach to re-add them from scratch.
  async function pushDown(candidate: RosterCandidate) {
    const lowerTeam = nextLowerTeam(team);
    if (!lowerTeam) return;
    await supabase.from('rosterCandidates').delete().eq('id', candidate.id);
    await supabase.from('rosterCandidates').insert({
      id: crypto.randomUUID(),
      team: lowerTeam,
      position: candidate.position,
      playerId: candidate.playerId,
      status: 'considering',
      createdAt: new Date().toISOString(),
    });
  }

  function renderRow(candidate: RosterCandidate, kind: 'confirmed' | 'considering') {
    const player = playersById.get(candidate.playerId);
    if (!player) return null;
    const lowerTeam = nextLowerTeam(team);
    const avg = overallAvgFromSkills(skillsByPlayer.get(player.id) ?? {});
    const otherPositions = player.positions.filter((p) => p !== position);
    return (
      <li key={candidate.id} className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-medium text-gray-900 whitespace-nowrap">
            {player.firstName} {player.lastName}
            <span className="text-xs font-normal text-gray-500"> · {playerGradeLabel(player)}</span>
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
          {lowerTeam && (
            <button
              type="button"
              onClick={() => pushDown(candidate)}
              title={`Move to ${TEAM_LABELS[lowerTeam]} (${POSITION_LABELS[position]}), considering`}
              className="min-h-9 px-2 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-xs font-medium"
            >
              ↓ {TEAM_LABELS[lowerTeam]}
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
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return ((data as Player[]) ?? [])
      .filter((p) => !existingPlayerIds.has(p.id))
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, []);

  // Elsewhere lookup, across every team (any status — considering or
  // confirmed), so a player already on a different team's list shows locked
  // here rather than letting a coach double-book them onto another team.
  const candidatesElsewhere = useLiveQuery(async () => {
    const { data } = await supabase.from('rosterCandidates').select('*').neq('team', team);
    return (data as RosterCandidate[]) ?? [];
  }, [team]);
  const elsewhereTeamByPlayer = new Map<string, Team>();
  for (const c of candidatesElsewhere ?? []) {
    if (!elsewhereTeamByPlayer.has(c.playerId)) elsewhereTeamByPlayer.set(c.playerId, c.team);
  }

  const visiblePlayers = players?.filter((p) => matchesPlayerQuery(p, search));

  function toggle(playerId: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  async function handleAdd() {
    const newCandidates: RosterCandidate[] = [...selected].map((playerId) => ({
      id: crypto.randomUUID(),
      team,
      position,
      playerId,
      status: 'considering',
      createdAt: new Date().toISOString(),
    }));
    if (newCandidates.length > 0) await supabase.from('rosterCandidates').insert(newCandidates);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-xl font-bold mb-1">Add {POSITION_LABELS[position]} Candidates</h2>
        <p className="text-sm text-gray-500 mb-3">{selected.size} selected</p>

        <div className="mb-3">
          <PlayerSearchInput value={search} onChange={setSearch} />
        </div>

        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden max-h-80 overflow-y-auto mb-4">
          {visiblePlayers?.map((p) => {
            const checked = selected.has(p.id);
            const lockedByTeam = elsewhereTeamByPlayer.get(p.id);
            const locked = lockedByTeam != null;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => toggle(p.id)}
                  title={locked ? `Already on ${TEAM_LABELS[lockedByTeam]}` : undefined}
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
                    <span className="text-xs text-gray-500">{playerGradeLabel(p)}</span>
                    <PositionBadges positions={p.positions} />
                    {locked && (
                      <span className="text-xs text-gray-500 whitespace-nowrap">On {TEAM_LABELS[lockedByTeam]}</span>
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
