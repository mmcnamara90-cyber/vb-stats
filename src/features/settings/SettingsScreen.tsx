import { useState } from 'react';
import { RosterScreen } from '../roster/RosterScreen';
import { TryoutsScreen } from '../tryouts/TryoutsScreen';
import { RosterBuilderScreen } from '../tryouts/RosterBuilderScreen';
import { TeamPreferencesTab } from './TeamPreferencesTab';
import { CaptainsTab } from '../captains/CaptainsTab';
import type { Team } from '../../types';

type SubTab = 'roster' | 'tryouts' | 'roster_builder' | 'captains' | 'preferences';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'roster', label: 'Roster' },
  { id: 'tryouts', label: 'Tryouts' },
  { id: 'roster_builder', label: 'Roster Builder' },
  { id: 'captains', label: 'Captains' },
  { id: 'preferences', label: 'Preferences' },
];

// Roster / Tryouts / Roster Builder used to be top-level nav tabs — they're
// admin/setup work a coach does occasionally, not the day-to-day screen
// (that's Game Day, now the main tab in App.tsx). Tucked behind the gear
// icon so the main nav stays down to Game Day + Player Insights.
export function SettingsScreen({ initialTeam }: { initialTeam?: Team }) {
  const [subTab, setSubTab] = useState<SubTab>('roster');

  return (
    <div>
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex overflow-x-auto">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`min-h-11 px-4 text-sm font-medium whitespace-nowrap ${
                subTab === t.id ? 'text-brand-indigo border-b-2 border-brand-indigo' : 'text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'roster' && <RosterScreen />}
      {subTab === 'tryouts' && <TryoutsScreen />}
      {subTab === 'roster_builder' && <RosterBuilderScreen initialTeam={initialTeam} />}
      {subTab === 'captains' && <CaptainsTab />}
      {subTab === 'preferences' && (
        <div className="max-w-2xl mx-auto p-4">
          <TeamPreferencesTab />
        </div>
      )}
    </div>
  );
}
