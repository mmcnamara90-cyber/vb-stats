import { useState } from 'react';
import { RosterBuilderTab } from './RosterBuilderTab';
import { LineupSimulatorTab } from './LineupSimulatorTab';
import { TEAM_LABELS, TEAMS } from './teams';
import type { Team } from '../../types';

type View = 'roster' | 'lineups';

export function RosterBuilderScreen({ initialTeam }: { initialTeam?: Team }) {
  const [team, setTeam] = useState<Team>(initialTeam ?? 'varsity');
  const [view, setView] = useState<View>('roster');

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Roster Builder</h1>

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {TEAMS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTeam(t)}
              className={`min-h-11 px-4 rounded-lg text-sm font-medium border ${
                team === t ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              {TEAM_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView('roster')}
            className={`min-h-11 px-3 rounded-lg text-sm font-medium border ${
              view === 'roster' ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            Roster
          </button>
          <button
            type="button"
            onClick={() => setView('lineups')}
            className={`min-h-11 px-3 rounded-lg text-sm font-medium border ${
              view === 'lineups' ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            🏐 Lineups
          </button>
        </div>
      </div>

      {view === 'roster' && <RosterBuilderTab team={team} />}
      {view === 'lineups' && <LineupSimulatorTab team={team} />}
    </div>
  );
}
