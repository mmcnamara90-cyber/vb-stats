import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Game } from '../../types';
import { GameRosterTab } from './GameRosterTab';
import { GameLineupTab } from './GameLineupTab';
import { GameLineupSheetTab } from './GameLineupSheetTab';
import { LiveStatsTab } from './LiveStatsTab';
import { GameInsightsTab } from './GameInsightsTab';

type SubTab = 'roster' | 'lineup' | 'sheet' | 'live' | 'insights';

export function GameDetailScreen({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const [tab, setTab] = useState<SubTab>('roster');

  const game = useLiveQuery(async () => {
    const { data } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();
    return (data as Game) ?? null;
  }, [gameId]);

  if (game === undefined) return <div className="max-w-2xl mx-auto p-4 text-gray-500">Loading…</div>;
  if (game === null) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <p className="text-gray-500 mb-3">This game no longer exists.</p>
        <button type="button" onClick={onBack} className="min-h-11 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700">
          ‹ Back to Games
        </button>
      </div>
    );
  }

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'roster', label: 'Roster' },
    { key: 'lineup', label: 'Lineup' },
    { key: 'sheet', label: 'Sheet' },
    { key: 'live', label: 'Live' },
    { key: 'insights', label: 'Insights' },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-1 print:hidden">
        <button type="button" onClick={onBack} className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 shrink-0">
          ‹ Games
        </button>
        <h1 className="text-xl font-bold text-gray-900 truncate">vs. {game.opponent}</h1>
      </div>
      <p className="text-xs text-gray-500 mb-4 print:hidden">{game.date}</p>
      <h1 className="hidden print:block text-xl font-bold text-gray-900 mb-1">
        vs. {game.opponent} — {game.date}
      </h1>

      <div className="flex border-b border-gray-200 mb-4 print:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 min-h-11 text-sm font-medium ${
              tab === t.key ? 'text-brand-indigo border-b-2 border-brand-indigo' : 'text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'roster' && <GameRosterTab game={game} />}
      {tab === 'lineup' && <GameLineupTab game={game} />}
      {tab === 'sheet' && <GameLineupSheetTab game={game} />}
      {tab === 'live' && <LiveStatsTab game={game} />}
      {tab === 'insights' && <GameInsightsTab game={game} />}
    </div>
  );
}
