import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Player, RosterDecision } from '../../types';
import { computeTryoutComposites } from './composite';
import { currentTryoutCycleId } from './skills';

const CYCLE_ID = currentTryoutCycleId();

export function DecisionsTab() {
  const rows = useLiveQuery(async () => {
    const [{ data: players }, composites, { data: decisions }] = await Promise.all([
      supabase.from('players').select('*').eq('active', true).order('lastName'),
      computeTryoutComposites(),
      supabase.from('rosterDecisions').select('*').eq('tryoutCycleId', CYCLE_ID),
    ]);
    const decisionByPlayer = new Map(
      ((decisions as RosterDecision[]) ?? []).map((d) => [d.playerId, d]),
    );
    return ((players as Player[]) ?? [])
      .map((p) => ({
        player: p,
        composite: composites.get(p.id) ?? null,
        decision: decisionByPlayer.get(p.id) ?? null,
      }))
      .sort((a, b) => (b.composite?.overallAvg ?? -1) - (a.composite?.overallAvg ?? -1));
  }, []);

  async function setDecision(playerId: string, madeTeam: boolean | null, compositeAvg: number | null) {
    const { data: existing } = await supabase
      .from('rosterDecisions')
      .select('*')
      .eq('playerId', playerId)
      .eq('tryoutCycleId', CYCLE_ID)
      .maybeSingle();
    const patch: Partial<RosterDecision> = {
      madeTeam,
      compositeScore: compositeAvg ?? undefined,
      decidedAt: madeTeam === null ? undefined : new Date().toISOString(),
    };
    if (existing) {
      await supabase.from('rosterDecisions').update(patch).eq('id', existing.id);
    } else {
      const row: RosterDecision = {
        id: crypto.randomUUID(),
        playerId,
        tryoutCycleId: CYCLE_ID,
        madeTeam,
        compositeScore: compositeAvg ?? undefined,
        decidedAt: madeTeam === null ? undefined : new Date().toISOString(),
      };
      await supabase.from('rosterDecisions').insert(row);
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">Cycle: {CYCLE_ID}</p>

      {rows !== undefined && rows.length === 0 && <p className="text-gray-500">No active players.</p>}

      <ul className="space-y-2">
        {rows?.map(({ player, composite, decision }) => (
          <li key={player.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-medium text-gray-900">
                {player.firstName} {player.lastName}
                {player.jerseyNumber != null && (
                  <span className="text-gray-400"> #{player.jerseyNumber}</span>
                )}
              </span>
              <span className="text-sm text-gray-500">
                Avg: {composite?.overallAvg != null ? composite.overallAvg.toFixed(1) : '—'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDecision(player.id, false, composite?.overallAvg ?? null)}
                className={`min-h-11 rounded-lg text-sm font-medium border ${
                  decision?.madeTeam === false
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Cut
              </button>
              <button
                type="button"
                onClick={() => setDecision(player.id, null, composite?.overallAvg ?? null)}
                className={`min-h-11 rounded-lg text-sm font-medium border ${
                  !decision || decision.madeTeam === null
                    ? 'bg-gray-600 text-white border-gray-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Undecided
              </button>
              <button
                type="button"
                onClick={() => setDecision(player.id, true, composite?.overallAvg ?? null)}
                className={`min-h-11 rounded-lg text-sm font-medium border ${
                  decision?.madeTeam === true
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Made Team
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
