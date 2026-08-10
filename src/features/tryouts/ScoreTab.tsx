import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type {
  Benchmark,
  DrillRun,
  Player,
  PlayerGroup,
  Position,
  RosterCandidate,
  Session,
  SkillScore,
  TryoutDrill,
} from '../../types';
import { benchmarkKey, computeHighScores } from './composite';
import { POSITIONS, POSITION_LABELS, POSITION_SHORT_LABELS, SKILL_LABELS } from './skills';
import { TEAMS, TEAM_LEVEL } from './teams';
import { matchesPlayerQuery, playerGradeLabel } from '../../lib/playerSearch';
import { PlayerSearchInput } from '../roster/PlayerSearchInput';

const checkboxClass = (checked: boolean) =>
  `h-5 w-5 rounded border flex items-center justify-center shrink-0 text-xs ${
    checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
  }`;

export function ScoreTab({ session }: { session: Session | undefined }) {
  const drills = useLiveQuery(async () => {
    const { data } = await supabase.from('tryoutDrills').select('*').order('name');
    return (data as TryoutDrill[]) ?? [];
  }, []);

  const activeRun = useLiveQuery(async () => {
    const { data } = await supabase.from('drillRuns').select('*').is('endedAt', null).limit(1).maybeSingle();
    return (data as DrillRun) ?? undefined;
  }, []);

  if (activeRun) {
    return <ActiveDrillRun run={activeRun} drills={drills} session={session} />;
  }
  return <StartDrillForm session={session} drills={drills} />;
}

function StartDrillForm({
  session,
  drills,
}: {
  session: Session | undefined;
  drills: TryoutDrill[] | undefined;
}) {
  const [drillId, setDrillId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const activePlayers = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true).order('lastName');
    return (data as Player[]) ?? [];
  }, []);
  const visiblePlayers = activePlayers?.filter((p) => matchesPlayerQuery(p, search));

  const groups = useLiveQuery(async () => {
    const { data } = await supabase.from('playerGroups').select('*').order('name');
    return (data as PlayerGroup[]) ?? [];
  }, []);

  const tags = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('tags').eq('active', true);
    const set = new Set<string>();
    for (const p of (data as { tags: string[] }[] | null) ?? []) for (const t of p.tags) set.add(t);
    return [...set].sort();
  }, []);

  // Quick-select by position: "all candidates being considered for DS/Lib"
  // etc., scoped to whichever teams feed this session's tryout pool (upper
  // -> varsity+jv, lower -> freshman+level3) — always live off current
  // rosterCandidates, never a stale saved list.
  const level = session?.level;
  const candidates = useLiveQuery(async () => {
    if (!level) return [] as RosterCandidate[];
    const teamsForLevel = TEAMS.filter((t) => TEAM_LEVEL[t] === level);
    const { data } = await supabase.from('rosterCandidates').select('*').in('team', teamsForLevel);
    return (data as RosterCandidate[]) ?? [];
  }, [level]);

  const positionCandidateIds = new Map<Position, Set<string>>();
  for (const c of candidates ?? []) {
    const set = positionCandidateIds.get(c.position) ?? new Set<string>();
    set.add(c.playerId);
    positionCandidateIds.set(c.position, set);
  }

  function selectByPosition(position: Position) {
    const ids = positionCandidateIds.get(position);
    if (!ids) return;
    setSelected((s) => new Set([...s, ...ids]));
  }

  function togglePlayer(playerId: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function selectByTag(tag: string) {
    setSelected((s) => {
      const next = new Set(s);
      for (const p of activePlayers ?? []) if (p.tags.includes(tag)) next.add(p.id);
      return next;
    });
  }

  function selectByGroup(group: PlayerGroup) {
    setSelected((s) => {
      const next = new Set(s);
      for (const id of group.playerIds) next.add(id);
      return next;
    });
  }

  async function startDrill() {
    if (!session || !drillId || selected.size === 0) return;
    const run: DrillRun = {
      id: crypto.randomUUID(),
      drillId,
      sessionId: session.id,
      playerIds: [...selected],
      startedAt: new Date().toISOString(),
    };
    await supabase.from('drillRuns').insert(run);
  }

  return (
    <div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Drill</label>
        <select
          className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none"
          value={drillId}
          onChange={(e) => setDrillId(e.target.value)}
        >
          <option value="">Select a drill…</option>
          {drills?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({SKILL_LABELS[d.skill]})
            </option>
          ))}
        </select>
        {drills !== undefined && drills.length === 0 && (
          <p className="text-sm text-gray-500 mt-1">No drills yet — add one in the Drills tab.</p>
        )}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Players ({selected.size} selected)</label>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="min-h-11 px-2 text-sm text-blue-600 font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {groups !== undefined && groups.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => selectByGroup(g)}
                className="min-h-11 px-3 rounded-full border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium"
              >
                + {g.name}
              </button>
            ))}
          </div>
        )}

        {level && (
          <div className="flex flex-wrap gap-2 mb-2">
            {POSITIONS.map((pos) => {
              const count = positionCandidateIds.get(pos)?.size ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => selectByPosition(pos)}
                  title={`${POSITION_LABELS[pos]} candidates on ${level === 'upper' ? 'Varsity/JV' : 'Freshman/Level 3'}`}
                  className="min-h-11 px-3 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-medium"
                >
                  + {POSITION_SHORT_LABELS[pos]} ({count})
                </button>
              );
            })}
          </div>
        )}

        {tags !== undefined && tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => selectByTag(t)}
                className="min-h-11 px-3 rounded-full border border-gray-300 bg-white text-gray-700 text-sm font-medium"
              >
                + {t}
              </button>
            ))}
          </div>
        )}

        <div className="mb-2">
          <PlayerSearchInput value={search} onChange={setSearch} />
        </div>

        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
          {visiblePlayers?.map((p) => {
            const checked = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => togglePlayer(p.id)}
                  className={`w-full min-h-11 flex items-center gap-3 px-4 py-2 text-left ${
                    checked ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className={checkboxClass(checked)}>{checked ? '✓' : ''}</span>
                  <span className="font-medium text-gray-900">
                    {p.firstName} {p.lastName}
                    {p.jerseyNumber != null && <span className="text-gray-400"> #{p.jerseyNumber}</span>}
                  </span>
                  <span className="text-xs text-gray-500">{playerGradeLabel(p)}</span>
                </button>
              </li>
            );
          })}
          {visiblePlayers !== undefined && visiblePlayers.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-400">No players match "{search}".</li>
          )}
        </ul>
      </div>

      <button
        type="button"
        onClick={startDrill}
        disabled={!session || !drillId || selected.size === 0}
        className="min-h-11 w-full rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700 disabled:opacity-50"
      >
        Start Drill
      </button>
    </div>
  );
}

function ActiveDrillRun({
  run,
  drills,
  session,
}: {
  run: DrillRun;
  drills: TryoutDrill[] | undefined;
  session: Session | undefined;
}) {
  const drill = drills?.find((d) => d.id === run.drillId);
  const playerIdsKey = run.playerIds.join(',');
  const level = session?.level;

  // Ordered to match run.playerIds (not alphabetical) so the coach's
  // reordering (see movePlayer below) is what actually renders.
  const players = useLiveQuery(async () => {
    if (run.playerIds.length === 0) return [];
    const { data } = await supabase.from('players').select('*').in('id', run.playerIds);
    const byId = new Map(((data as Player[]) ?? []).map((p) => [p.id, p]));
    return run.playerIds.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  }, [playerIdsKey]);

  async function movePlayer(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= run.playerIds.length) return;
    const next = [...run.playerIds];
    [next[index], next[newIndex]] = [next[newIndex], next[index]];
    await supabase.from('drillRuns').update({ playerIds: next }).eq('id', run.id);
  }

  const benchmarks = useLiveQuery(async () => {
    if (!level) return [] as Benchmark[];
    const { data } = await supabase.from('benchmarks').select('*').eq('level', level);
    return (data as Benchmark[]) ?? [];
  }, [level]);

  const highScores = useLiveQuery(() => computeHighScores(), []);

  const benchmarksByKey = new Map((benchmarks ?? []).map((b) => [benchmarkKey(b.level, b.position, b.skill), b]));

  const scoresByPlayer = useLiveQuery(async () => {
    const { data: tryoutSessions } = await supabase.from('sessions').select('id').eq('type', 'tryout');
    const sessionIds = new Set(((tryoutSessions as { id: string }[]) ?? []).map((s) => s.id));
    const { data: rows } = await supabase.from('skillScores').select('*').eq('drillId', run.drillId);
    const relevant = ((rows as SkillScore[]) ?? [])
      .filter((r) => sessionIds.has(r.sessionId) && run.playerIds.includes(r.playerId))
      .sort((a, b) => a.scoredAt.localeCompare(b.scoredAt));
    const map = new Map<string, SkillScore[]>();
    for (const row of relevant) {
      const list = map.get(row.playerId) ?? [];
      list.push(row);
      map.set(row.playerId, list);
    }
    return map;
  }, [run.id, run.drillId, playerIdsKey]);

  async function addTap(playerId: string, value: 0 | 1 | 2 | 3) {
    if (!drill) return;
    const row: SkillScore = {
      id: crypto.randomUUID(),
      playerId,
      sessionId: run.sessionId,
      drillId: run.drillId,
      runId: run.id,
      skill: drill.skill,
      score: value,
      scoredAt: new Date().toISOString(),
    };
    await supabase.from('skillScores').insert(row);
  }

  async function removeTap(scoreId: string) {
    await supabase.from('skillScores').delete().eq('id', scoreId);
  }

  async function endDrill() {
    await supabase.from('drillRuns').update({ endedAt: new Date().toISOString() }).eq('id', run.id);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div>
          <p className="font-semibold text-gray-900">{drill?.name ?? 'Drill'}</p>
          <p className="text-sm text-gray-500">
            {drill ? SKILL_LABELS[drill.skill] : ''} · {run.playerIds.length} players
          </p>
        </div>
        <button
          type="button"
          onClick={endDrill}
          className="min-h-11 px-4 rounded-lg bg-red-600 text-white text-base font-medium active:bg-red-700 shrink-0"
        >
          End Drill
        </button>
      </div>

      <ul className="space-y-2">
        {players?.map((player, index) => {
          const entries = scoresByPlayer?.get(player.id) ?? [];
          const avg = entries.length
            ? entries.reduce((a, e) => a + e.score, 0) / entries.length
            : null;

          const targets =
            drill && level
              ? player.positions
                  .map((pos) => ({
                    pos,
                    benchmark: benchmarksByKey.get(benchmarkKey(level, pos, drill.skill)),
                  }))
                  .filter((t): t is { pos: typeof t.pos; benchmark: Benchmark } => !!t.benchmark)
              : [];

          const bestForPlayer =
            drill && level
              ? player.positions
                  .map((pos) => highScores?.get(benchmarkKey(level, pos, drill.skill)))
                  .filter((h): h is NonNullable<typeof h> => !!h)
                  .sort((a, b) => b.value - a.value)[0]
              : undefined;

          return (
            <li key={player.id} className="rounded-lg border border-gray-200 p-2">
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="font-medium text-gray-900 min-w-0 truncate">
                  {player.firstName} {player.lastName}
                  {player.jerseyNumber != null && (
                    <span className="text-gray-400"> #{player.jerseyNumber}</span>
                  )}
                  <span className="text-gray-400"> · {playerGradeLabel(player)}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-gray-500">
                    {avg != null ? `Avg ${avg.toFixed(1)} (${entries.length})` : 'No taps yet'}
                  </span>
                  <button
                    type="button"
                    onClick={() => movePlayer(index, -1)}
                    disabled={index === 0}
                    title="Move up"
                    className="min-h-9 min-w-9 rounded-lg border border-gray-200 text-gray-500 text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => movePlayer(index, 1)}
                    disabled={index === players.length - 1}
                    title="Move down"
                    className="min-h-9 min-w-9 rounded-lg border border-gray-200 text-gray-500 text-xs disabled:opacity-30"
                  >
                    ↓
                  </button>
                </span>
              </div>

              {(targets.length > 0 || bestForPlayer) && (
                <p className="text-xs text-gray-500 mb-1">
                  {targets.length > 0 && (
                    <>
                      Target:{' '}
                      {targets
                        .map((t) => `${t.benchmark.manualValue.toFixed(1)} (${POSITION_LABELS[t.pos]})`)
                        .join(' · ')}
                    </>
                  )}
                  {targets.length > 0 && bestForPlayer && ' — '}
                  {bestForPlayer && (
                    <>Best this year: {bestForPlayer.value.toFixed(1)} ({bestForPlayer.playerName})</>
                  )}
                </p>
              )}

              {/* Always rendered (even with 0 taps) and non-wrapping so this row
                  reserves a constant height — the card can't resize as taps
                  are recorded. */}
              <div className="flex items-center gap-1 mb-1 min-h-9 overflow-x-auto">
                {entries.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => removeTap(e.id)}
                    title="Tap to remove"
                    className="min-h-9 min-w-9 shrink-0 px-2 rounded bg-gray-100 text-gray-700 text-sm font-medium active:bg-red-100"
                  >
                    {e.score}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {([0, 1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => addTap(player.id, n)}
                    className="min-h-12 sm:min-h-14 rounded-xl text-2xl font-bold border-2 bg-white text-gray-700 border-gray-300 active:bg-blue-600 active:text-white active:border-blue-600"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
