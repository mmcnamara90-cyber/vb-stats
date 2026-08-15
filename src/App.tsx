import { useState } from 'react';
import { RosterScreen } from './features/roster/RosterScreen';
import { TryoutsScreen } from './features/tryouts/TryoutsScreen';
import { RosterBuilderScreen } from './features/tryouts/RosterBuilderScreen';
import { GameDayScreen } from './features/games/GameDayScreen';
import { LoginScreen } from './features/auth/LoginScreen';
import { clearStoredTeam, getStoredTeam, setStoredTeam } from './lib/auth';
import type { Team } from './types';

type Tab = 'roster' | 'tryouts' | 'roster_builder' | 'game_day';

function App() {
  const [team, setTeam] = useState<Team | null>(() => getStoredTeam());
  const [tab, setTab] = useState<Tab>('roster_builder');

  if (!team) {
    return (
      <LoginScreen
        onLogin={(t) => {
          setStoredTeam(t);
          setTeam(t);
          setTab('roster_builder');
        }}
      />
    );
  }

  function handleLogout() {
    clearStoredTeam();
    setTeam(null);
  }

  return (
    <div className="min-h-svh flex flex-col bg-gray-50">
      <nav className="flex items-center border-b border-gray-200 bg-white sticky top-0 z-10">
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
        <button
          onClick={() => setTab('game_day')}
          className={`flex-1 min-h-11 text-base font-medium ${
            tab === 'game_day' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
          }`}
        >
          🏐 Game Day
        </button>
        <button
          onClick={handleLogout}
          title="Log out"
          className="min-h-11 px-3 text-sm font-medium text-gray-400"
        >
          Log out
        </button>
      </nav>

      <main className="flex-1">
        {tab === 'roster' && <RosterScreen />}
        {tab === 'tryouts' && <TryoutsScreen />}
        {tab === 'roster_builder' && <RosterBuilderScreen initialTeam={team} />}
        {tab === 'game_day' && <GameDayScreen initialTeam={team} />}
      </main>
    </div>
  );
}

export default App;
