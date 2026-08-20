import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Practice } from '../../types';
import { PracticePlanTab } from './PracticePlanTab';
import { PracticeTrackTab } from './PracticeTrackTab';
import { PracticeSummaryTab } from './PracticeSummaryTab';

type SubTab = 'plan' | 'track' | 'summary';

export function PracticeDetailScreen({ practiceId, onBack }: { practiceId: string; onBack: () => void }) {
  const [tab, setTab] = useState<SubTab>('plan');

  const practice = useLiveQuery(async () => {
    const { data } = await supabase.from('practices').select('*').eq('id', practiceId).maybeSingle();
    return (data as Practice) ?? null;
  }, [practiceId]);

  if (practice === undefined) return <div className="max-w-2xl mx-auto p-4 text-gray-500">Loading…</div>;
  if (practice === null) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <p className="text-gray-500 mb-3">This practice no longer exists.</p>
        <button type="button" onClick={onBack} className="min-h-11 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700">
          ‹ Back to Practice
        </button>
      </div>
    );
  }

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'plan', label: 'Plan' },
    { key: 'track', label: 'Track' },
    { key: 'summary', label: 'Summary' },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-1">
        <button type="button" onClick={onBack} className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 shrink-0">
          ‹ Practice
        </button>
        <h1 className="text-xl font-bold text-gray-900 truncate">{practice.label}</h1>
      </div>
      <p className="text-xs text-gray-500 mb-4">{practice.date}</p>

      <div className="flex border-b border-gray-200 mb-4">
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

      {tab === 'plan' && <PracticePlanTab practice={practice} />}
      {tab === 'track' && <PracticeTrackTab practice={practice} />}
      {tab === 'summary' && <PracticeSummaryTab practice={practice} />}
    </div>
  );
}
