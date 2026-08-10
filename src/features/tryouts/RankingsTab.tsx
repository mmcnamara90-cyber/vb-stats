import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Player, Skill } from '../../types';
import { computeTryoutComposites, type CompositeResult } from './composite';
import { POSITION_SHORT_LABELS, SKILLS, SKILL_SHORT_LABELS } from './skills';
import { matchesPlayerQuery, playerGradeLabel } from '../../lib/playerSearch';
import { PlayerSearchInput } from '../roster/PlayerSearchInput';

type SortKey = 'name' | 'grade' | 'avg' | 'tapCount' | Skill;
type Row = { player: Player; composite: CompositeResult };

function sortValue(row: Row, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return `${row.player.lastName} ${row.player.firstName}`.toLowerCase();
    case 'grade':
      return row.player.gradYear;
    case 'avg':
      return row.composite.overallAvg ?? -Infinity;
    case 'tapCount':
      return row.composite.tapCount;
    default:
      return row.composite.bySkill[key] ?? -Infinity;
  }
}

export function RankingsTab() {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('avg');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc'); // names read naturally A-Z; scores read naturally highest-first
    }
  }

  const allRows = useLiveQuery(async () => {
    const [{ data: players }, composites] = await Promise.all([
      supabase.from('players').select('*').eq('active', true).order('lastName'),
      computeTryoutComposites(),
    ]);
    return ((players as Player[]) ?? [])
      .filter((p) => composites.has(p.id))
      .map((p) => ({ player: p, composite: composites.get(p.id)! }));
  }, []);

  const sortedRows = allRows
    ? [...allRows].sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        const cmp = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv);
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : undefined;

  const rows = sortedRows?.filter(({ player }) => matchesPlayerQuery(player, search));

  if (allRows !== undefined && allRows.length === 0) {
    return <p className="text-gray-500">No tryout scores yet. Score players in the Score tab first.</p>;
  }

  function SortHeader({
    label,
    sortKeyValue,
    align = 'center',
  }: {
    label: string;
    sortKeyValue: SortKey;
    align?: 'center' | 'left';
  }) {
    const active = sortKey === sortKeyValue;
    return (
      <th className={`py-2 px-2 whitespace-nowrap ${align === 'center' ? 'text-center' : 'text-left'}`}>
        <button
          type="button"
          onClick={() => toggleSort(sortKeyValue)}
          className={`min-h-9 px-1 font-medium ${active ? 'text-blue-600' : 'text-gray-500'}`}
        >
          {label}
          {active && <span className="ml-0.5">{sortDir === 'asc' ? '▲' : '▼'}</span>}
        </button>
      </th>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <PlayerSearchInput value={search} onChange={setSearch} />
      </div>
      {rows !== undefined && rows.length === 0 && (
        <p className="text-gray-500">No players match "{search}".</p>
      )}
      <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2 pr-3 sticky left-0 bg-gray-50 text-left">
              <button
                type="button"
                onClick={() => toggleSort('name')}
                className={`min-h-9 px-1 font-medium ${sortKey === 'name' ? 'text-blue-600' : 'text-gray-500'}`}
              >
                Player
                {sortKey === 'name' && <span className="ml-0.5">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </button>
            </th>
            <SortHeader label="Grade" sortKeyValue="grade" align="left" />
            <th className="py-2 px-2 text-left whitespace-nowrap">Positions</th>
            <SortHeader label="Avg" sortKeyValue="avg" />
            <SortHeader label="#" sortKeyValue="tapCount" />
            {SKILLS.map((skill) => (
              <SortHeader key={skill} label={SKILL_SHORT_LABELS[skill]} sortKeyValue={skill} />
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
              <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{playerGradeLabel(player)}</td>
              <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                {player.positions.map((p) => POSITION_SHORT_LABELS[p]).join(', ') || '—'}
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
    </div>
  );
}
