import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Player, Practice, PracticeDrill, PracticeStatEvent } from '../../types';
import { buildPracticeSummary } from './practiceSummary';

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

  const drillIdsUsedToday = [...new Set((todayEvents ?? []).map((e) => e.drillId).filter((id): id is string => !!id))];
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

  if (players === undefined || todayEvents === undefined || drills === undefined || historicalEvents === undefined) {
    return <p className="text-gray-500">Loading…</p>;
  }

  if (todayEvents.length === 0) {
    return <p className="text-sm text-gray-500">Nothing recorded yet — track some stats on the Track tab first.</p>;
  }

  const playersById = new Map(players.map((p) => [p.id, p]));
  const drillsById = new Map(drills.map((d) => [d.id, d]));
  const rosterPlayers = practice.rosterPlayerIds.map((id) => playersById.get(id)).filter((p): p is Player => !!p);
  const historicalByDrillId = new Map<string, PracticeStatEvent[]>();
  for (const drillId of drillIdsUsedToday) {
    historicalByDrillId.set(drillId, historicalEvents.filter((e) => e.drillId === drillId));
  }

  const summary = buildPracticeSummary(todayEvents, historicalByDrillId, drillsById, rosterPlayers);

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        Computed from today's taps — not AI-generated, just the same rule-based thresholds used on Game Day.
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
        {summary.generalEventCount > 0 && <> ({summary.generalEventCount} logged as "General")</>}
      </div>

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
                  <span className="font-medium text-gray-900">{dl.drill.name}</span>
                  <span className="text-xs text-gray-500">
                    {dl.playerCount} player{dl.playerCount === 1 ? '' : 's'} · {dl.eventCount} tap{dl.eventCount === 1 ? '' : 's'}
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
