import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Benchmark, Position, Skill, TryoutLevel } from '../../types';
import { benchmarkKey, computeBenchmarkSuggestions } from './composite';
import { POSITIONS, POSITION_LABELS, SKILLS, SKILL_SHORT_LABELS, TRYOUT_LEVELS, TRYOUT_LEVEL_LABELS } from './skills';

export function BenchmarksTab() {
  const [level, setLevel] = useState<TryoutLevel>('upper');

  const benchmarks = useLiveQuery(async () => {
    const { data } = await supabase.from('benchmarks').select('*').eq('level', level);
    return (data as Benchmark[]) ?? [];
  }, [level]);
  const suggestions = useLiveQuery(() => computeBenchmarkSuggestions(), []);

  const manualByKey = new Map((benchmarks ?? []).map((b) => [benchmarkKey(b.level, b.position, b.skill), b]));

  async function setManual(position: Position, skill: Skill, value: number | null) {
    const existing = manualByKey.get(benchmarkKey(level, position, skill));
    if (value == null) {
      if (existing) await supabase.from('benchmarks').delete().eq('id', existing.id);
      return;
    }
    if (existing) {
      await supabase
        .from('benchmarks')
        .update({ manualValue: value, updatedAt: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      const row: Benchmark = {
        id: crypto.randomUUID(),
        position,
        skill,
        level,
        manualValue: value,
        updatedAt: new Date().toISOString(),
      };
      await supabase.from('benchmarks').insert(row);
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        Target score per position and skill. Manual values are what coaches see everywhere else in the
        app — the "sugg." line is a computed top-10%-of-players suggestion you can apply with one tap.
      </p>

      <div className="flex gap-2 mb-4">
        {TRYOUT_LEVELS.map((lvl) => (
          <button
            key={lvl}
            type="button"
            onClick={() => setLevel(lvl)}
            className={`min-h-11 px-3 rounded-lg text-sm font-medium border ${
              level === lvl
                ? 'bg-brand-indigo text-white border-brand-indigo'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {TRYOUT_LEVEL_LABELS[lvl]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-3 sticky left-0 bg-gray-50">Position</th>
              {SKILLS.map((skill) => (
                <th key={skill} className="py-2 px-2 text-center whitespace-nowrap">
                  {SKILL_SHORT_LABELS[skill]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((position) => (
              <tr key={position} className="border-b border-gray-100">
                <td className="py-2 pr-3 font-medium text-gray-900 sticky left-0 bg-white whitespace-nowrap">
                  {POSITION_LABELS[position]}
                </td>
                {SKILLS.map((skill) => {
                  const manual = manualByKey.get(benchmarkKey(level, position, skill));
                  const suggestion = suggestions?.get(benchmarkKey(level, position, skill));
                  return (
                    <td key={skill} className="py-2 px-1 text-center">
                      <input
                        type="number"
                        min={0}
                        max={3}
                        step={0.1}
                        value={manual?.manualValue ?? ''}
                        placeholder="—"
                        onChange={(e) =>
                          setManual(position, skill, e.target.value === '' ? null : Number(e.target.value))
                        }
                        className="w-14 min-h-9 rounded border border-gray-300 text-center text-sm focus:border-brand-indigo focus:outline-none"
                      />
                      {suggestion && (
                        <button
                          type="button"
                          onClick={() => setManual(position, skill, Number(suggestion.suggestedValue.toFixed(1)))}
                          title={`Apply computed suggestion (n=${suggestion.sampleSize})`}
                          className="block w-full text-[11px] text-brand-indigo mt-0.5"
                        >
                          sugg. {suggestion.suggestedValue.toFixed(1)}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
