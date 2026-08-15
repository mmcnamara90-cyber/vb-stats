import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Game, GameStatEvent, Player } from '../../types';
import { PositionBadges } from '../tryouts/PositionBadges';
import { buildInsights, buildPlayerStatLine, statRolesForPositions, type PlayerGameStatLine } from './gameStats';

export function GameInsightsTab({ game }: { game: Game }) {
  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);
  const events = useLiveQuery(async () => {
    const { data } = await supabase.from('gameStatEvents').select('*').eq('gameId', game.id);
    return (data as GameStatEvent[]) ?? [];
  }, [game.id]);

  if (players === undefined || events === undefined) return <p className="text-gray-500">Loading…</p>;

  const playersById = new Map(players.map((p) => [p.id, p]));
  const rosterPlayers = game.rosterPlayerIds.map((id) => playersById.get(id)).filter((p): p is Player => !!p);
  const lines: PlayerGameStatLine[] = rosterPlayers
    .map((p) => buildPlayerStatLine(p, events))
    .filter((l) => l.attackAttempts + l.serveReceiveCount + l.setAttempts + l.assists > 0)
    .sort((a, b) => a.player.firstName.localeCompare(b.player.firstName));

  const insights = buildInsights(lines);
  const good = insights.filter((i) => i.tone === 'good');
  const watch = insights.filter((i) => i.tone === 'watch');

  if (events.length === 0) {
    return <p className="text-sm text-gray-500">No stats recorded yet — head to the Live tab once the scrimmage starts.</p>;
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Computed automatically from what you've tapped in — not AI-generated. Flags need a few reps first (3+
        attempts/passes) so single plays don't skew the read.
      </p>

      {good.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-3">
          <h3 className="text-sm font-semibold text-emerald-800 mb-2">✅ Working well</h3>
          <ul className="space-y-1.5">
            {good.map((i, idx) => (
              <li key={idx} className="text-sm text-emerald-900">
                {i.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {watch.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">👀 Worth a look</h3>
          <ul className="space-y-1.5">
            {watch.map((i, idx) => (
              <li key={idx} className="text-sm text-amber-900">
                {i.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {good.length === 0 && watch.length === 0 && (
        <p className="text-sm text-gray-500 mb-4">Not enough reps yet on any one player for a confident read — keep tracking.</p>
      )}

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900 text-sm">Box score (all sets)</div>
        <ul className="divide-y divide-gray-100">
          {lines.map((l) => {
            const roles = statRolesForPositions(l.player.positions);
            return (
              <li key={l.player.id} className="px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">
                    {l.player.firstName} {l.player.lastName}
                  </span>
                  <PositionBadges positions={l.player.positions} />
                </div>
                <div className="flex gap-3 flex-wrap text-xs text-gray-600">
                  {roles.hitter && (
                    <span>
                      {l.kills}k / {l.attackErrors}e / {l.attackAttempts} att
                      {l.hittingPct != null && ` (${(l.hittingPct * 100).toFixed(0)}%)`}
                    </span>
                  )}
                  {roles.setter && (
                    <span>
                      {l.assists} kills off {l.setAttempts} sets
                      {l.settingConversionPct != null && ` (${(l.settingConversionPct * 100).toFixed(0)}%)`}
                    </span>
                  )}
                  {(roles.hitter || roles.passer) && l.serveReceiveCount > 0 && (
                    <span>
                      SR {l.serveReceiveAvg?.toFixed(1)} avg ({l.serveReceiveCount})
                    </span>
                  )}
                </div>
              </li>
            );
          })}
          {lines.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No stats yet.</li>}
        </ul>
      </div>
    </div>
  );
}
