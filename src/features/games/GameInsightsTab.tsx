import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Game, GameStatEvent, Player } from '../../types';
import { PositionBadges } from '../tryouts/PositionBadges';
import {
  buildInsights,
  buildPlayerStatLine,
  buildPlayerTrends,
  buildRotationInsights,
  buildRotationOffenseLines,
  buildRotationServeReceiveLines,
  describePlayerTrend,
  statRolesForPositions,
  type PlayerGameStatLine,
} from './gameStats';

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

  const rotationInsights = buildRotationInsights(events);
  const rotationOffense = buildRotationOffenseLines(events);
  const rotationServeReceive = buildRotationServeReceiveLines(events);
  const rotationHasAnyData = rotationOffense.some((r) => r.attempts > 0) || rotationServeReceive.some((r) => r.count > 0);

  const trends = buildPlayerTrends(rosterPlayers, events);

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

      {trends.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 mb-3">
          <h3 className="text-sm font-semibold text-sky-800 mb-2">📈 Trending</h3>
          <p className="text-xs text-sky-700 mb-2">
            Second half of tonight's taps vs. the first half — not a multi-game trend, just how each player's
            numbers are moving within this game.
          </p>
          <ul className="space-y-1.5">
            {trends.map((t, idx) => (
              <li key={idx} className="text-sm text-sky-900">
                {describePlayerTrend(t)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rotationInsights.length > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 mb-3">
          <h3 className="text-sm font-semibold text-indigo-800 mb-2">🔁 By rotation</h3>
          <ul className="space-y-1.5">
            {rotationInsights.map((i, idx) => (
              <li key={idx} className="text-sm text-indigo-900">
                {i.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rotationHasAnyData && (
        <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
          <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900 text-sm">Rotation breakdown (all sets)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="px-3 py-1.5 font-medium">Rot</th>
                  <th className="px-3 py-1.5 font-medium">Att</th>
                  <th className="px-3 py-1.5 font-medium">K</th>
                  <th className="px-3 py-1.5 font-medium">E</th>
                  <th className="px-3 py-1.5 font-medium">Hit%</th>
                  <th className="px-3 py-1.5 font-medium">SR avg</th>
                  <th className="px-3 py-1.5 font-medium">SR reps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rotationOffense.map((o, i) => {
                  const sr = rotationServeReceive[i];
                  return (
                    <tr key={o.rotation} className="text-gray-800">
                      <td className="px-3 py-1.5 font-semibold">{o.rotation}</td>
                      <td className="px-3 py-1.5">{o.attempts}</td>
                      <td className="px-3 py-1.5">{o.kills}</td>
                      <td className="px-3 py-1.5">{o.errors}</td>
                      <td className="px-3 py-1.5">{o.hittingPct != null ? `${(o.hittingPct * 100).toFixed(0)}%` : '—'}</td>
                      <td className="px-3 py-1.5">{sr.avg != null ? sr.avg.toFixed(1) : '—'}</td>
                      <td className="px-3 py-1.5">{sr.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
