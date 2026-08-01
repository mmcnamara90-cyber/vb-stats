import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { computeTryoutComposites } from './composite';
import { SKILLS, SKILL_SHORT_LABELS } from './skills';

export function RankingsTab() {
  const rows = useLiveQuery(async () => {
    const [players, composites] = await Promise.all([
      db.players.orderBy('lastName').toArray(),
      computeTryoutComposites(),
    ]);
    return players
      .filter((p) => p.active && composites.has(p.id))
      .map((p) => ({ player: p, composite: composites.get(p.id)! }))
      .sort((a, b) => (b.composite.overallAvg ?? 0) - (a.composite.overallAvg ?? 0));
  }, []);

  if (rows !== undefined && rows.length === 0) {
    return <p className="text-gray-500">No tryout scores yet. Score players in the Score tab first.</p>;
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2 pr-3 sticky left-0 bg-gray-50">Player</th>
            <th className="py-2 px-2 text-center">Avg</th>
            <th className="py-2 px-2 text-center">#</th>
            {SKILLS.map((skill) => (
              <th key={skill} className="py-2 px-2 text-center whitespace-nowrap">
                {SKILL_SHORT_LABELS[skill]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows?.map(({ player, composite }) => (
            <tr key={player.id} className="border-b border-gray-100">
              <td className="py-2 pr-3 font-medium text-gray-900 sticky left-0 bg-white whitespace-nowrap">
                {player.firstName} {player.lastName}
                {player.jerseyNumber != null ? (
                  <span className="text-gray-400"> #{player.jerseyNumber}</span>
                ) : null}
              </td>
              <td className="py-2 px-2 text-center font-semibold text-gray-900">
                {composite.overallAvg != null ? composite.overallAvg.toFixed(1) : '—'}
              </td>
              <td className="py-2 px-2 text-center text-gray-500">{composite.tapCount}</td>
              {SKILLS.map((skill) => (
                <td key={skill} className="py-2 px-2 text-center text-gray-700">
                  {composite.bySkill[skill] != null ? composite.bySkill[skill]!.toFixed(1) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
