import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useTodaysSession } from '../../lib/dailySession';
import type { TryoutLevel } from '../../types';
import { DrillsTab } from './DrillsTab';
import { GroupsTab } from './GroupsTab';
import { ScoreTab } from './ScoreTab';
import { RankingsTab } from './RankingsTab';
import { DecisionsTab } from './DecisionsTab';
import { BenchmarksTab } from './BenchmarksTab';
import { ImportScoresTab } from './ImportScoresTab';
import { TRYOUT_LEVELS, TRYOUT_LEVEL_LABELS } from './skills';

type SubTab = 'drills' | 'groups' | 'score' | 'import' | 'rankings' | 'benchmarks' | 'decisions';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'drills', label: 'Drills' },
  { id: 'groups', label: 'Groups' },
  { id: 'score', label: 'Score' },
  { id: 'import', label: 'Import' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'decisions', label: 'Decisions' },
];

export function TryoutsScreen() {
  const [subTab, setSubTab] = useState<SubTab>('score');
  const session = useTodaysSession('tryout');

  async function setLevel(level: TryoutLevel) {
    if (!session) return;
    await supabase.from('sessions').update({ level }).eq('id', session.id);
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Tryouts</h1>
      <p className="text-sm text-gray-500 mb-2">
        {session
          ? new Date(session.date).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })
          : 'Loading…'}
      </p>

      {session && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Today's tryout pool</label>
          <div className="flex gap-2">
            {TRYOUT_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevel(lvl)}
                className={`min-h-11 px-3 rounded-lg text-sm font-medium border ${
                  session.level === lvl
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {TRYOUT_LEVEL_LABELS[lvl]}
              </button>
            ))}
          </div>
          {!session.level && (
            <p className="text-sm text-amber-600 mt-1">
              Pick a pool before scoring — it scopes which benchmarks players are compared against.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`min-h-11 px-4 rounded-lg text-base font-medium border ${
              subTab === t.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'drills' && <DrillsTab />}
      {subTab === 'groups' && <GroupsTab />}
      {subTab === 'score' && <ScoreTab session={session} />}
      {subTab === 'import' && <ImportScoresTab />}
      {subTab === 'rankings' && <RankingsTab />}
      {subTab === 'benchmarks' && <BenchmarksTab />}
      {subTab === 'decisions' && <DecisionsTab />}
    </div>
  );
}
