import { useState } from 'react';
import { useTodaysSession } from '../../lib/dailySession';
import { DrillsTab } from './DrillsTab';
import { GroupsTab } from './GroupsTab';
import { ScoreTab } from './ScoreTab';
import { RankingsTab } from './RankingsTab';
import { DecisionsTab } from './DecisionsTab';

type SubTab = 'drills' | 'groups' | 'score' | 'rankings' | 'decisions';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'drills', label: 'Drills' },
  { id: 'groups', label: 'Groups' },
  { id: 'score', label: 'Score' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'decisions', label: 'Decisions' },
];

export function TryoutsScreen() {
  const [subTab, setSubTab] = useState<SubTab>('score');
  const session = useTodaysSession('tryout');

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Tryouts</h1>
      <p className="text-sm text-gray-500 mb-4">
        {session
          ? new Date(session.date).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })
          : 'Loading…'}
      </p>

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
      {subTab === 'rankings' && <RankingsTab />}
      {subTab === 'decisions' && <DecisionsTab />}
    </div>
  );
}
