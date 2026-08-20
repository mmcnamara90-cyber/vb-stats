import { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { CaptainBallot, CaptainVoteRanking, Player } from '../../../types';
import { CAPTAIN_QUALITIES, CAPTAIN_VOTE_REASONS } from '../captainVoting';

const checkboxClass = (checked: boolean) =>
  `h-5 w-5 rounded border flex items-center justify-center shrink-0 text-xs ${
    checked ? 'bg-brand-indigo border-brand-indigo text-white' : 'border-gray-300'
  }`;

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// One rank's picker + its "why did you pick them" reasons — rank1/rank2 are
// required (Rank component always rendered), rank3 only appears once the
// player opts in via "+ Add a 3rd choice" in BallotForm below.
function RankPicker({
  label,
  candidates,
  selectedId,
  onSelect,
  reasons,
  onToggleReason,
}: {
  label: string;
  candidates: Player[];
  selectedId: string;
  onSelect: (id: string) => void;
  reasons: Set<string>;
  onToggleReason: (reason: string) => void;
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-brand-indigo focus:outline-none mb-2"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Select a player…</option>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.firstName} {p.lastName}
          </option>
        ))}
      </select>

      {selectedId && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Why did you select this person? (Check all that apply)</p>
          <div className="flex flex-wrap gap-2">
            {CAPTAIN_VOTE_REASONS.map((reason) => {
              const checked = reasons.has(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => onToggleReason(reason)}
                  className={`min-h-9 px-3 rounded-full border text-sm font-medium flex items-center gap-1.5 ${
                    checked
                      ? 'bg-brand-indigo text-white border-brand-indigo'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {reason}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function BallotForm({
  electionId,
  self,
  candidates,
  onSubmitted,
}: {
  electionId: string;
  self: Player;
  candidates: Player[];
  onSubmitted: () => void;
}) {
  const [qualities, setQualities] = useState<Set<string>>(new Set());
  const [rank1, setRank1] = useState('');
  const [rank2, setRank2] = useState('');
  const [rank3, setRank3] = useState('');
  const [showRank3, setShowRank3] = useState(false);
  const [reasons1, setReasons1] = useState<Set<string>>(new Set());
  const [reasons2, setReasons2] = useState<Set<string>>(new Set());
  const [reasons3, setReasons3] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickedIds = new Set([rank1, rank2, rank3].filter(Boolean));

  function candidatesExcluding(...ids: string[]): Player[] {
    const exclude = new Set(ids.filter(Boolean));
    return candidates.filter((p) => !exclude.has(p.id));
  }

  const canSubmit =
    qualities.size > 0 &&
    !!rank1 &&
    !!rank2 &&
    rank1 !== rank2 &&
    reasons1.size > 0 &&
    reasons2.size > 0 &&
    (!showRank3 || !rank3 || (rank3 !== rank1 && rank3 !== rank2 && reasons3.size > 0));

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    const rankings: CaptainVoteRanking[] = [
      { playerId: rank1, rank: 1, reasons: [...reasons1] },
      { playerId: rank2, rank: 2, reasons: [...reasons2] },
    ];
    if (showRank3 && rank3) rankings.push({ playerId: rank3, rank: 3, reasons: [...reasons3] });

    const ballot: CaptainBallot = {
      id: crypto.randomUUID(),
      electionId,
      voterId: self.id,
      qualities: [...qualities],
      rankings,
      submittedAt: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from('captainBallots').insert(ballot);
    setSubmitting(false);
    if (insertError) {
      // Unique violation on (electionId, voterId) — she already voted, most
      // likely from another tab/device. Treat as success rather than an
      // error the player has to make sense of.
      if (insertError.code === '23505') {
        onSubmitted();
        return;
      }
      setError('Something went wrong submitting your vote. Please try again.');
      return;
    }
    onSubmitted();
  }

  return (
    <div className="max-w-sm mx-auto pt-6 pb-10">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Hey {self.firstName}! 👋</h1>
      <p className="text-sm text-gray-500 mb-5">Your vote is anonymous — your coach only sees the totals.</p>

      <div className="mb-5">
        <p className="text-sm font-medium text-gray-700 mb-1">
          What qualities are most important to you in a team captain? <span className="text-red-500">*</span>
        </p>
        <p className="text-xs text-gray-500 mb-2">Check all that apply.</p>
        <ul className="space-y-1.5">
          {CAPTAIN_QUALITIES.map((q) => {
            const checked = qualities.has(q);
            return (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => setQualities((s) => toggle(s, q))}
                  className="w-full min-h-11 flex items-center gap-3 px-3 py-1.5 text-left rounded-lg border border-gray-200 bg-white"
                >
                  <span className={checkboxClass(checked)}>{checked ? '✓' : ''}</span>
                  <span className="text-sm text-gray-800">{q}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <RankPicker
        label="1st choice for captain *"
        candidates={candidatesExcluding(rank2, rank3)}
        selectedId={rank1}
        onSelect={(id) => {
          setRank1(id);
          setReasons1(new Set());
        }}
        reasons={reasons1}
        onToggleReason={(r) => setReasons1((s) => toggle(s, r))}
      />

      <RankPicker
        label="2nd choice for captain *"
        candidates={candidatesExcluding(rank1, rank3)}
        selectedId={rank2}
        onSelect={(id) => {
          setRank2(id);
          setReasons2(new Set());
        }}
        reasons={reasons2}
        onToggleReason={(r) => setReasons2((s) => toggle(s, r))}
      />

      {showRank3 ? (
        <RankPicker
          label="3rd choice for captain (optional)"
          candidates={candidatesExcluding(rank1, rank2)}
          selectedId={rank3}
          onSelect={(id) => {
            setRank3(id);
            setReasons3(new Set());
          }}
          reasons={reasons3}
          onToggleReason={(r) => setReasons3((s) => toggle(s, r))}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowRank3(true)}
          className="min-h-11 w-full mb-4 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-500"
        >
          + Add a 3rd choice
        </button>
      )}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit || submitting}
        className="min-h-11 w-full rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit Vote'}
      </button>
      {pickedIds.size > 0 && !canSubmit && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Fill in your 1st and 2nd choice (with at least one reason each) to submit.
        </p>
      )}
    </div>
  );
}
