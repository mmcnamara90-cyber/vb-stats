import { RosterBuilderTab } from './RosterBuilderTab';
import type { Team } from '../../types';

export function RosterBuilderScreen({ initialTeam }: { initialTeam?: Team }) {
  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Roster Builder</h1>
      <RosterBuilderTab initialTeam={initialTeam} />
    </div>
  );
}
