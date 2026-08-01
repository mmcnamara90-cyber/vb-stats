import { useState } from 'react';
import { RosterScreen } from './features/roster/RosterScreen';
import { OpenGymScreen } from './features/open-gym/OpenGymScreen';
import { TryoutsScreen } from './features/tryouts/TryoutsScreen';

type Tab = 'roster' | 'tryouts' | 'open_gym';

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
          onClick={() => setTab('open_gym')}
          className={`flex-1 min-h-11 text-base font-medium ${
            tab === 'open_gym' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
          }`}
        >
          Open Gym
        </button>
      </nav>

      <main className="flex-1">
        {tab === 'roster' && <RosterScreen />}
        {tab === 'tryouts' && <TryoutsScreen />}
        {tab === 'open_gym' && <OpenGymScreen />}
      </main>
    </div>
  );
}

export default App;
