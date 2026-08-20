import { useState } from 'react';
import { GameDayScreen } from './features/games/GameDayScreen';
import { PracticeScreen } from './features/practice/PracticeScreen';
import { PlayerInsightsScreen } from './features/insights/PlayerInsightsScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { LoginScreen } from './features/auth/LoginScreen';
import { clearStoredTeam, getStoredTeam, setStoredTeam } from './lib/auth';
import { applySiteTheme, applyStatTheme, readStoredSiteTheme, readStoredStatTheme } from './lib/uiTheme';
import type { Team } from './types';

// Applied once at module load (before first paint) rather than in a
// useEffect, so a returning coach doesn't see a flash of the default theme
// before their saved preference kicks in.
applySiteTheme(readStoredSiteTheme());
applyStatTheme(readStoredStatTheme());

// Game Day is the day-to-day screen, so it's the default/main tab now.
// Roster / Tryouts / Roster Builder are occasional admin/setup work —
// tucked behind the gear icon (SettingsScreen) instead of competing for
// space in the main nav.
type Tab = 'game_day' | 'practice' | 'player_insights' | 'settings';

function App() {
  const [team, setTeam] = useState<Team | null>(() => getStoredTeam());
  const [tab, setTab] = useState<Tab>('game_day');

  if (!team) {
    return (
      <LoginScreen
        onLogin={(t) => {
          setStoredTeam(t);
          setTeam(t);
          setTab('game_day');
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
          onClick={() => setTab('game_day')}
          className={`flex-1 min-h-11 text-sm font-medium ${
            tab === 'game_day' ? 'text-brand-indigo border-b-2 border-brand-indigo' : 'text-gray-500'
          }`}
        >
          🏐 Game Day
        </button>
        <button
          onClick={() => setTab('practice')}
          className={`flex-1 min-h-11 text-sm font-medium ${
            tab === 'practice' ? 'text-brand-indigo border-b-2 border-brand-indigo' : 'text-gray-500'
          }`}
        >
          🏃 Practice
        </button>
        <button
          onClick={() => setTab('player_insights')}
          className={`flex-1 min-h-11 text-sm font-medium ${
            tab === 'player_insights' ? 'text-brand-indigo border-b-2 border-brand-indigo' : 'text-gray-500'
          }`}
        >
          📊 Player Insights
        </button>
        <button
          onClick={() => setTab('settings')}
          title="Settings"
          aria-label="Settings"
          className={`min-h-11 px-4 text-lg ${tab === 'settings' ? 'text-brand-indigo' : 'text-gray-500'}`}
        >
          ⚙️
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
        {tab === 'game_day' && <GameDayScreen />}
        {tab === 'practice' && <PracticeScreen />}
        {tab === 'player_insights' && <PlayerInsightsScreen />}
        {tab === 'settings' && <SettingsScreen initialTeam={team} />}
      </main>
    </div>
  );
}

export default App;
