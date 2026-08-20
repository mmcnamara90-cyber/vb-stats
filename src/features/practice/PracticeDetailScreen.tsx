import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Practice } from '../../types';
import { PracticeTrackTab } from './PracticeTrackTab';

export function PracticeDetailScreen({ practiceId, onBack }: { practiceId: string; onBack: () => void }) {
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

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-1">
        <button type="button" onClick={onBack} className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 shrink-0">
          ‹ Practice
        </button>
        <h1 className="text-xl font-bold text-gray-900 truncate">{practice.label}</h1>
      </div>
      <p className="text-xs text-gray-500 mb-4">{practice.date}</p>

      <PracticeTrackTab practice={practice} />
    </div>
  );
}
