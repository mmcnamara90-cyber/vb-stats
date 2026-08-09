import { useState } from 'react';
import { RosterScreen } from './features/roster/RosterScreen';
import { TryoutsScreen } from './features/tryouts/TryoutsScreen';
import { RosterBuilderScreen } from './features/tryouts/RosterBuilderScreen';

type Tab = 'roster' | 'tryouts' | 'roster_builder';

function App() {
  const [tab, setTab] = useState<Tab>('roster');

  return (
    <div className="min-h-svh flex flex-col bg-gray-50">
      <nav className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
        <button
          onClick={() => setTab('roster')}
          className={`flex-1 min-h-11 text-base font-medium ${
            tab === 'roster' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
          }`}
        >
          Roster
        </button>
        <button
          onClick={() => setTab('tryouts')}
          className={`flex-1 min-h-11 text-base font-medium ${
            tab === 'tryouts' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
          }`}
        >
          Tryouts
        </button>
        <button
          onClick={() => setTab('roster_builder')}
          className={`flex-1 min-h-11 text-base font-medium ${
            tab === 'roster_builder' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
          }`}
        >
          Roster Builder
        </button>
      </nav>

      <main className="flex-1">
        {tab === 'roster' && <RosterScreen />}
        {tab === 'tryouts' && <TryoutsScreen />}
        {tab === 'roster_builder' && <RosterBuilderScreen />}
      </main>
    </div>
  );
}

export default App;
