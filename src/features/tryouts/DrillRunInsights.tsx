import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Benchmark, DrillRun, Player, Session, SkillScore, TryoutDrill } from '../../types';
import { benchmarkKey } from './composite';
import { POSITION_SHORT_LABELS, SKILL_LABELS } from './skills';
import { playerGradeLabel } from '../../lib/playerSearch';

// Half-point swing on the 0-3 scale — same threshold used for the
// serve-receive within-game trend in gameStats.ts, reused here for
// consistency since it's the same rating scale.
const TREND_DELTA = 0.5;

function avg(scores: SkillScore[]): number | null {
  return scores.length ? scores.reduce((a, s) => a + s.score, 0) / scores.length : null;
}

// Focused summary for a single drill run — just the players who were in it,
// scoped to the taps recorded during that run specifically (via runId), with
// their season-long average on the same drill and their benchmark target
// alongside for context. Distinct from the Rankings tab, which is an
// all-players/all-drills table; this is "what just happened in that group."
export function DrillRunInsights({ runId, onBack }: { runId: string; onBack: () => void }) {
  const run = useLiveQuery(async () => {
    const { data } = await supabase.from('drillRuns').select('*').eq('id', runId).maybeSingle();
    return (data as DrillRun) ?? undefined;
  }, [runId]);

  const drill = useLiveQuery(async () => {
    if (!run) return undefined;
    const { data } = await supabase.from('tryoutDrills').select('*').eq('id', run.drillId).maybeSingle();
    return (data as TryoutDrill) ?? undefined;
  }, [run?.drillId]);

  const session = useLiveQuery(async () => {
    if (!run) return undefined;
    const { data } = await supabase.from('sessions').select('*').eq('id', run.sessionId).maybeSingle();
    return (data as Session) ?? undefined;
  }, [run?.sessionId]);

  const playerIdsKey = run?.playerIds.join(',') ?? '';
  const players = useLiveQuery(async () => {
    if (!run || run.playerIds.length === 0) return [];
    const { data } = await supabase.from('players').select('*').in('id', run.playerIds);
    const byId = new Map(((data as Player[]) ?? []).map((p) => [p.id, p]));
    return run.playerIds.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  }, [run?.id, playerIdsKey]);

  // Every tap on this drill (any tryout session) for these players, split
  // into "this run" vs "prior" — lets the summary show both what just
  // happened and how it compares to their season-long average on the drill.
  const scoresByPlayer = useLiveQuery(async () => {
    if (!run) return undefined;
    const { data: tryoutSessions } = await supabase.from('sessions').select('id').eq('type', 'tryout');
    const sessionIds = new Set(((tryoutSessions as { id: string }[]) ?? []).map((s) => s.id));
    const { data: rows } = await supabase.from('skillScores').select('*').eq('drillId', run.drillId);
    const relevant = ((rows as SkillScore[]) ?? []).filter(
      (r) => sessionIds.has(r.sessionId) && run.playerIds.includes(r.playerId)
    );
    const map = new Map<string, { thisRun: SkillScore[]; prior: SkillScore[] }>();
    for (const row of relevant) {
      const entry = map.get(row.playerId) ?? { thisRun: [], prior: [] };
      if (row.runId === run.id) entry.thisRun.push(row);
      else entry.prior.push(row);
      map.set(row.playerId, entry);
    }
    return map;
  }, [run?.id, run?.drillId, playerIdsKey]);

  const benchmarks = useLiveQuery(async () => {
    if (!session?.level) return [] as Benchmark[];
    const { data } = await supabase.from('benchmarks').select('*').eq('level', session.level);
    return (data as Benchmark[]) ?? [];
  }, [session?.level]);
  const benchmarksByKey = new Map((benchmarks ?? []).map((b) => [benchmarkKey(b.level, b.position, b.skill), b]));

  const BackButton = (
    <button
      type="button"
      onClick={onBack}
      className="min-h-11 px-3 -ml-3 mb-3 text-brand-indigo font-medium"
    >
      ← Back
    </button>
  );

  if (!run || !drill || players === undefined || scoresByPlayer === undefined) {
    return (
      <div>
        {BackButton}
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  type Row = {
    player: Player;
    runTaps: SkillScore[];
    runAvg: number | null;
    priorAvg: number | null;
    target: number | null;
  };

  const rows: Row[] = players
    .map((player) => {
      const entry = scoresByPlayer.get(player.id) ?? { thisRun: [], prior: [] };
      const target = session?.level
        ? (player.positions
            .map((pos) => benchmarksByKey.get(benchmarkKey(session.level!, pos, drill.skill))?.manualValue)
            .filter((v): v is number => v != null)
            .sort((a, b) => b - a)[0] ?? null)
        : null;
      return {
        player,
        runTaps: entry.thisRun,
        runAvg: avg(entry.thisRun),
        priorAvg: avg(entry.prior),
        target,
      };
    })
    .sort((a, b) => (b.runAvg ?? -Infinity) - (a.runAvg ?? -Infinity));

  const runAvgs = rows.map((r) => r.runAvg).filter((v): v is number => v != null);
  const groupAvg = runAvgs.length ? runAvgs.reduce((a, b) => a + b, 0) / runAvgs.length : null;

  const metTarget = rows.filter((r) => r.target != null && r.runAvg != null && r.runAvg >= r.target);
  const belowTarget = rows.filter((r) => r.target != null && r.runAvg != null && r.runAvg < r.target);
  const rising = rows.filter(
    (r) => r.runAvg != null && r.priorAvg != null && r.runAvg - r.priorAvg >= TREND_DELTA
  );
  const falling = rows.filter(
    (r) => r.runAvg != null && r.priorAvg != null && r.priorAvg - r.runAvg >= TREND_DELTA
  );

  return (
    <div>
      {BackButton}

      <div className="mb-4">
        <p className="font-semibold text-gray-900">{drill.name}</p>
        <p className="text-sm text-gray-500">
          {SKILL_LABELS[drill.skill]} · {players.length} players ·{' '}
          {new Date(run.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {groupAvg != null && <> · Group avg {groupAvg.toFixed(1)}</>}
        </p>
      </div>

      {(metTarget.length > 0 || rising.length > 0) && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-3">
          <h3 className="text-sm font-semibold text-emerald-800 mb-2">✅ Working well</h3>
          <ul className="space-y-1">
            {metTarget.map((r) => (
              <li key={`target-${r.player.id}`} className="text-sm text-emerald-900">
                {r.player.firstName} {r.player.lastName} hit target ({r.runAvg!.toFixed(1)} vs {r.target!.toFixed(1)})
              </li>
            ))}
            {rising.map((r) => (
              <li key={`rising-${r.player.id}`} className="text-sm text-emerald-900">
                {r.player.firstName} {r.player.lastName} up from season avg ({r.priorAvg!.toFixed(1)} →{' '}
                {r.runAvg!.toFixed(1)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {(belowTarget.length > 0 || falling.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">👀 Worth a look</h3>
          <ul className="space-y-1">
            {belowTarget.map((r) => (
              <li key={`target-${r.player.id}`} className="text-sm text-amber-900">
                {r.player.firstName} {r.player.lastName} below target ({r.runAvg!.toFixed(1)} vs {r.target!.toFixed(1)})
              </li>
            ))}
            {falling.map((r) => (
              <li key={`falling-${r.player.id}`} className="text-sm text-amber-900">
                {r.player.firstName} {r.player.lastName} down from season avg ({r.priorAvg!.toFixed(1)} →{' '}
                {r.runAvg!.toFixed(1)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {rows.map((r) => (
            <li key={r.player.id} className="p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-medium text-gray-900 min-w-0 truncate">
                  {r.player.firstName} {r.player.lastName}
                  {r.player.jerseyNumber != null && <span className="text-gray-400"> #{r.player.jerseyNumber}</span>}
                  <span className="text-gray-400 font-normal">
                    {' '}
                    · {playerGradeLabel(r.player)}
                    {r.player.positions.length > 0 && (
                      <> · {r.player.positions.map((p) => POSITION_SHORT_LABELS[p]).join(', ')}</>
                    )}
                  </span>
                </span>
                <span className="text-lg font-bold text-gray-900 shrink-0">
                  {r.runAvg != null ? r.runAvg.toFixed(1) : '—'}
                </span>
              </div>

              <div className="flex items-center gap-1 mb-1 flex-wrap">
                {r.runTaps.map((tap) => (
                  <span
                    key={tap.id}
                    className="min-h-7 min-w-7 px-1.5 flex items-center justify-center rounded bg-gray-100 text-gray-700 text-xs font-medium"
                  >
                    {tap.score}
                  </span>
                ))}
                {r.runTaps.length === 0 && <span className="text-xs text-gray-400">No taps recorded this run</span>}
              </div>

              <p className="text-xs text-gray-500">
                {r.priorAvg != null && <>Season avg {r.priorAvg.toFixed(1)}</>}
                {r.priorAvg != null && r.target != null && ' · '}
                {r.target != null && <>Target {r.target.toFixed(1)}</>}
                {r.priorAvg == null && r.target == null && 'No prior history or benchmark for this drill'}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
