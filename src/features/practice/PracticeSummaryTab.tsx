import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Player, Practice, PracticeDrill, PracticeDrillLog, PracticeStatEvent } from '../../types';
import { buildPracticeSummary } from './practiceSummary';

const PAYOFF_LABELS: Record<NonNullable<PracticeDrillLog['payoff']>, string> = {
  high: '🔥 High payoff',
  medium: '🙂 Medium payoff',
  low: '😕 Low payoff',
};

// Post-practice summary — computed (rule-based), not a real AI/LLM call; see
// CLAUDE.md "Practice" for why. Framed explicitly as computed in the UI so
// it isn't mistaken for something it isn't.
export function PracticeSummaryTab({ practice }: { practice: Practice }) {
  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);
  const todayEvents = useLiveQuery(async () => {
    const { data } = await supabase.from('practiceStatEvents').select('*').eq('practiceId', practice.id);
    return (data as PracticeStatEvent[]) ?? [];
  }, [practice.id]);
  const logs = useLiveQuery(async () => {
    const { data } = await supabase.from('practiceDrillLogs').select('*').eq('practiceId', practice.id);
    return (data as PracticeDrillLog[]) ?? [];
  }, [practice.id]);

  const drillIdsUsedToday = [
    ...new Set([...(todayEvents ?? []).map((e) => e.drillId).filter((id): id is string => !!id), ...(logs ?? []).map((l) => l.drillId)]),
  ];
  const drills = useLiveQuery(async () => {
    if (drillIdsUsedToday.length === 0) return [];
    const { data } = await supabase.from('drills').select('*').in('id', drillIdsUsedToday);
    return (data as PracticeDrill[]) ?? [];
  }, [drillIdsUsedToday.join(',')]);
  // This drill's events from every OTHER practice — the comparison baseline.
  const historicalEvents = useLiveQuery(async () => {
    if (drillIdsUsedToday.length === 0) return [];
    const { data } = await supabase
      .from('practiceStatEvents')
      .select('*')
      .in('drillId', drillIdsUsedToday)
      .neq('practiceId', practice.id);
    return (data as PracticeStatEvent[]) ?? [];
  }, [drillIdsUsedToday.join(','), practice.id]);

  if (
    players === undefined ||
    todayEvents === undefined ||
    logs === undefined ||
    drills === undefined ||
    historicalEvents === undefined
  ) {
    return <p className="text-gray-500">Loading…</p>;
  }

  if (todayEvents.length === 0 && logs.length === 0) {
    return <p className="text-sm text-gray-500">Nothing recorded yet — track some stats or log a drill on the Plan/Track tabs first.</p>;
  }

  const playersById = new Map(players.map((p) => [p.id, p]));
  const drillsById = new Map(drills.map((d) => [d.id, d]));
  const logsByDrillId = new Map(logs.map((l) => [l.drillId, l]));
  const rosterPlayers = practice.rosterPlayerIds.map((id) => playersById.get(id)).filter((p): p is Player => !!p);
  const historicalByDrillId = new Map<string, PracticeStatEvent[]>();
  for (const drillId of drillIdsUsedToday) {
    historicalByDrillId.set(drillId, historicalEvents.filter((e) => e.drillId === drillId));
  }

  const summary = buildPracticeSummary(todayEvents, historicalByDrillId, drillsById, rosterPlayers, logsByDrillId);

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        Computed from today's taps and drill logs — not AI-generated, just the same rule-based thresholds used on
        Game Day.
      </p>

      <div className="rounded-lg border border-gray-200 p-3 mb-4 text-sm text-gray-700">
        {summary.totalEvents} stat{summary.totalEvents === 1 ? '' : 's'} logged · {summary.playerCount} player
        {summary.playerCount === 1 ? '' : 's'} involved
        {summary.drillLines.length > 0 && (
          <>
            {' '}
            · {summary.drillLines.length} drill{summary.drillLines.length === 1 ? '' : 's'} tracked
          </>
        )}
        {summary.totalLoggedMinutes != null && <> · {summary.totalLoggedMinutes} min logged</>}
        {summary.generalEventCount > 0 && <> ({summary.generalEventCount} logged as "General")</>}
      </div>

      {summary.practiceInsights.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-3 mb-4 space-y-1.5">
          {summary.practiceInsights.map((i, idx) => (
            <p key={idx} className="text-sm text-amber-800">
              👀 {i.text}
            </p>
          ))}
        </div>
      )}

      {summary.playerInsights.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-3 mb-4 space-y-1.5">
          {summary.playerInsights.map((i, idx) => (
            <p key={idx} className={`text-sm ${i.tone === 'good' ? 'text-emerald-800' : 'text-amber-800'}`}>
              {i.tone === 'good' ? '✅' : '👀'} {i.text}
            </p>
          ))}
        </div>
      )}

      {summary.drillLines.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
          <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900 text-sm">By drill</div>
          <ul className="divide-y divide-gray-100">
            {summary.drillLines.map((dl) => (
              <li key={dl.drill.id} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-gray-900">{dl.drill.name}</span>
                    {dl.followUp && <span className="text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">🚩 follow up</span>}
                  </span>
                  <span className="text-xs text-gray-500">
                    {dl.playerCount} player{dl.playerCount === 1 ? '' : 's'} · {dl.eventCount} tap{dl.eventCount === 1 ? '' : 's'}
                    {dl.durationMinutes != null && <> · {dl.durationMinutes}m</>}
                    {dl.payoff && <> · {PAYOFF_LABELS[dl.payoff]}</>}
                  </span>
                </div>
                <div className="flex gap-3 flex-wrap text-sm text-gray-700 mb-1">
                  {(dl.today.attackAttempts > 0 || dl.today.kills > 0 || dl.today.attackErrors > 0) && (
                    <span>
                      {dl.today.kills}k / {dl.today.attackErrors}e / {dl.today.attackAttempts} att
                      {dl.today.hittingPct != null && ` (${(dl.today.hittingPct * 100).toFixed(0)}%)`}
                    </span>
                  )}
                  {dl.today.assists > 0 && <span>{dl.today.assists} assists</span>}
                  {dl.today.serveReceiveCount > 0 && (
                    <span>
                      SR {dl.today.serveReceiveAvg?.toFixed(1)} avg ({dl.today.serveReceiveCount})
                    </span>
                  )}
                </div>
                {dl.comparisonNotes.map((note, idx) => (
                  <p key={idx} className="text-xs text-gray-500">
                    📊 {note}
                  </p>
                ))}
                {dl.notes && <p className="text-xs text-gray-600 italic mt-1">📝 {dl.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
