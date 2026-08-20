import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Practice, PracticeDrill, PracticeDrillLog, PracticeStatEvent } from '../../types';
import { SKILL_LABELS } from '../tryouts/skills';
import { buildAggregateStatLine } from '../games/gameStats';

const PAYOFF_LABELS: Record<NonNullable<PracticeDrillLog['payoff']>, string> = {
  high: '🔥 High',
  medium: '🙂 Medium',
  low: '😕 Low',
};

// A drill's "historical catalog of previous stats" — every practice it's
// been used in, aggregated, plus whatever time/payoff/notes were logged for
// it each time. Distinct from the per-practice Summary tab
// (PracticeSummaryTab), which compares one practice's run of a drill
// against this same history; here the history itself is the whole page.
export function DrillDetailScreen({ drillId, onBack }: { drillId: string; onBack: () => void }) {
  const drill = useLiveQuery(async () => {
    const { data } = await supabase.from('drills').select('*').eq('id', drillId).maybeSingle();
    return (data as PracticeDrill) ?? null;
  }, [drillId]);
  const events = useLiveQuery(async () => {
    const { data } = await supabase.from('practiceStatEvents').select('*').eq('drillId', drillId);
    return (data as PracticeStatEvent[]) ?? [];
  }, [drillId]);
  const logs = useLiveQuery(async () => {
    const { data } = await supabase.from('practiceDrillLogs').select('*').eq('drillId', drillId);
    return (data as PracticeDrillLog[]) ?? [];
  }, [drillId]);
  const practiceIds = [...new Set([...(events ?? []).map((e) => e.practiceId), ...(logs ?? []).map((l) => l.practiceId)])];
  const practices = useLiveQuery(async () => {
    if (practiceIds.length === 0) return [];
    const { data } = await supabase.from('practices').select('*').in('id', practiceIds);
    return (data as Practice[]) ?? [];
  }, [practiceIds.join(',')]);

  if (drill === undefined || events === undefined || logs === undefined || practices === undefined) {
    return <div className="max-w-2xl mx-auto p-4 text-gray-500">Loading…</div>;
  }
  if (drill === null) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <p className="text-gray-500 mb-3">This drill no longer exists.</p>
        <button type="button" onClick={onBack} className="min-h-11 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700">
          ‹ Back
        </button>
      </div>
    );
  }

  const practicesById = new Map(practices.map((p) => [p.id, p]));
  const logsByPracticeId = new Map(logs.map((l) => [l.practiceId, l]));
  const overall = buildAggregateStatLine(events);
  const totalLoggedMinutes = logs.reduce((s, l) => s + (l.durationMinutes ?? 0), 0);
  const byPractice = practiceIds
    .map((id) => ({
      practice: practicesById.get(id),
      line: buildAggregateStatLine(events.filter((e) => e.practiceId === id)),
      log: logsByPracticeId.get(id),
    }))
    .filter((row): row is { practice: Practice; line: ReturnType<typeof buildAggregateStatLine>; log: PracticeDrillLog | undefined } => !!row.practice)
    .sort((a, b) => a.practice.date.localeCompare(b.practice.date));
  const notedPractices = byPractice.filter((row) => row.log?.notes);

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-1">
        <button type="button" onClick={onBack} className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 shrink-0">
          ‹ Drills
        </button>
        <h1 className="text-xl font-bold text-gray-900 truncate">{drill.name}</h1>
      </div>
      {drill.description && <p className="text-sm text-gray-600 mb-1">{drill.description}</p>}
      {drill.focusSkill && (
        <span className="inline-block text-[11px] font-medium text-brand-indigo bg-brand-indigo/10 rounded-full px-2 py-0.5 mb-3">
          {SKILL_LABELS[drill.focusSkill]}
        </span>
      )}

      {byPractice.length === 0 ? (
        <p className="text-sm text-gray-500">This drill hasn't been run in any practice yet.</p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 p-3 mb-4">
            <div className="text-sm font-semibold text-gray-900 mb-2">
              All-time — {byPractice.length} practice{byPractice.length === 1 ? '' : 's'}
              {totalLoggedMinutes > 0 && <> · {totalLoggedMinutes} min logged</>}
            </div>
            <div className="flex gap-4 flex-wrap text-sm text-gray-700">
              {(overall.attackAttempts > 0 || overall.kills > 0 || overall.attackErrors > 0) && (
                <span>
                  {overall.kills}k / {overall.attackErrors}e / {overall.attackAttempts} att
                  {overall.hittingPct != null && ` (${(overall.hittingPct * 100).toFixed(0)}%)`}
                </span>
              )}
              {overall.assists > 0 && <span>{overall.assists} assists</span>}
              {overall.serveReceiveCount > 0 && (
                <span>
                  SR {overall.serveReceiveAvg?.toFixed(1)} avg ({overall.serveReceiveCount})
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
            <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900 text-sm">By practice</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="px-3 py-1.5 font-medium">Date</th>
                    <th className="px-3 py-1.5 font-medium">Practice</th>
                    <th className="px-3 py-1.5 font-medium">Min</th>
                    <th className="px-3 py-1.5 font-medium">Payoff</th>
                    <th className="px-3 py-1.5 font-medium">K</th>
                    <th className="px-3 py-1.5 font-medium">E</th>
                    <th className="px-3 py-1.5 font-medium">Att</th>
                    <th className="px-3 py-1.5 font-medium">Hit%</th>
                    <th className="px-3 py-1.5 font-medium">Asst</th>
                    <th className="px-3 py-1.5 font-medium">SR avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byPractice.map(({ practice, line, log }) => (
                    <tr key={practice.id} className="text-gray-800">
                      <td className="px-3 py-1.5">{practice.date}</td>
                      <td className="px-3 py-1.5">{practice.label}</td>
                      <td className="px-3 py-1.5">{log?.durationMinutes ?? '—'}</td>
                      <td className="px-3 py-1.5">{log?.payoff ? PAYOFF_LABELS[log.payoff] : '—'}</td>
                      <td className="px-3 py-1.5">{line.kills}</td>
                      <td className="px-3 py-1.5">{line.attackErrors}</td>
                      <td className="px-3 py-1.5">{line.attackAttempts}</td>
                      <td className="px-3 py-1.5">{line.hittingPct != null ? `${(line.hittingPct * 100).toFixed(0)}%` : '—'}</td>
                      <td className="px-3 py-1.5">{line.assists}</td>
                      <td className="px-3 py-1.5">{line.serveReceiveAvg != null ? line.serveReceiveAvg.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {notedPractices.length > 0 && (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900 text-sm">Coach notes</div>
              <ul className="divide-y divide-gray-100">
                {notedPractices.map(({ practice, log }) => (
                  <li key={practice.id} className="px-3 py-2 text-sm">
                    <span className="text-xs text-gray-500 mr-2">{practice.date}</span>
                    <span className="text-gray-700 italic">{log?.notes}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
