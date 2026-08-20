import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { CaptainBallot, CaptainElection, Player, RosterCandidate, Team } from '../../types';
import { computeCaptainResults, computeQualityTallies } from './captainVoting';

// Only JV runs live features this year — same hardcode-no-switcher pattern
// as GameDayScreen.tsx/PracticeScreen.tsx. Reintroduce a switcher here if
// another team starts using this in a future season.
const team: Team = 'jv';

const voteLink = `${window.location.origin}${import.meta.env.BASE_URL}#vote`;

export function CaptainsTab() {
  const [selectedElectionId, setSelectedElectionId] = useState<string | null>(null);

  const elections = useLiveQuery(async () => {
    const { data } = await supabase
      .from('captainElections')
      .select('*')
      .eq('team', team)
      .order('createdAt', { ascending: false });
    return (data as CaptainElection[]) ?? [];
  }, []);

  const selected = elections?.find((e) => e.id === selectedElectionId) ?? elections?.[0];

  async function startNewElection() {
    const { data: candidates } = await supabase
      .from('rosterCandidates')
      .select('*')
      .eq('team', team)
      .eq('status', 'confirmed');
    const candidatePlayerIds = [...new Set(((candidates as RosterCandidate[]) ?? []).map((c) => c.playerId))];
    const election: CaptainElection = {
      id: crypto.randomUUID(),
      team,
      title: `Captain Vote — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
      candidatePlayerIds,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    await supabase.from('captainElections').insert(election);
    setSelectedElectionId(election.id);
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">Captain Vote</h1>
      <p className="text-sm text-gray-500 mb-4">
        Players vote separately at their own login — not through this coach view.
      </p>

      <div className="rounded-lg border border-gray-200 bg-white p-3 mb-4">
        <p className="text-sm font-medium text-gray-700 mb-1">Share with players</p>
        <p className="text-sm text-gray-500 mb-2">
          Send this link — it opens a separate login (not the coach password) where each player picks herself and
          votes.
        </p>
        <code className="block text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 break-all text-gray-700">
          {voteLink}
        </code>
      </div>

      {elections === undefined && <p className="text-gray-500">Loading…</p>}

      {elections !== undefined && elections.length === 0 && (
        <div className="text-center py-6">
          <p className="text-gray-500 mb-3">No captain vote yet.</p>
          <button
            type="button"
            onClick={startNewElection}
            className="min-h-11 px-4 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark"
          >
            + Start a Vote
          </button>
        </div>
      )}

      {elections !== undefined && elections.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3 gap-2">
            <select
              className="min-h-11 flex-1 rounded-lg border border-gray-300 px-3 text-base focus:border-brand-indigo focus:outline-none"
              value={selected?.id ?? ''}
              onChange={(e) => setSelectedElectionId(e.target.value)}
            >
              {elections.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title ?? 'Captain Vote'} · {e.status === 'open' ? 'Open' : 'Closed'}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={startNewElection}
              className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 shrink-0"
            >
              + New
            </button>
          </div>

          {selected && <ElectionDetail election={selected} />}
        </>
      )}
    </div>
  );
}

function ElectionDetail({ election }: { election: CaptainElection }) {
  const players = useLiveQuery(async () => {
    if (election.candidatePlayerIds.length === 0) return [];
    const { data } = await supabase.from('players').select('*').in('id', election.candidatePlayerIds);
    return (data as Player[]) ?? [];
  }, [election.id, election.candidatePlayerIds.join(',')]);
  const playersById = new Map((players ?? []).map((p) => [p.id, p]));

  const ballots = useLiveQuery(async () => {
    const { data } = await supabase.from('captainBallots').select('*').eq('electionId', election.id);
    return (data as CaptainBallot[]) ?? [];
  }, [election.id]);

  async function toggleStatus() {
    const next = election.status === 'open' ? 'closed' : 'open';
    await supabase
      .from('captainElections')
      .update({ status: next, closedAt: next === 'closed' ? new Date().toISOString() : null })
      .eq('id', election.id);
  }

  if (players === undefined || ballots === undefined) return <p className="text-gray-500">Loading…</p>;

  const votedIds = new Set(ballots.map((b) => b.voterId));
  const notVoted = election.candidatePlayerIds
    .filter((id) => !votedIds.has(id))
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p);

  const results = computeCaptainResults(ballots);
  const qualityTallies = computeQualityTallies(ballots);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-gray-900">{election.title ?? 'Captain Vote'}</p>
          <p className="text-sm text-gray-500">
            {ballots.length} of {election.candidatePlayerIds.length} voted ·{' '}
            <span className={election.status === 'open' ? 'text-emerald-600 font-medium' : 'text-gray-500'}>
              {election.status === 'open' ? 'Open' : 'Closed'}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={toggleStatus}
          className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 shrink-0"
        >
          {election.status === 'open' ? 'Close Voting' : 'Reopen'}
        </button>
      </div>

      {election.status === 'open' && (
        <p className="text-xs text-amber-600 mb-3">Voting is still open — results below may change.</p>
      )}

      {notVoted.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 mb-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Still waiting on ({notVoted.length})</p>
          <p className="text-sm text-gray-600">
            {notVoted.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
          </p>
        </div>
      )}

      {ballots.length === 0 ? (
        <p className="text-gray-500">No ballots submitted yet.</p>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Results <span className="font-normal text-gray-400">(anonymous — tallies only)</span>
          </p>
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden mb-4">
            {results.map((r, i) => {
              const player = playersById.get(r.playerId);
              const topReasons = Object.entries(r.reasonCounts).sort((a, b) => b[1] - a[1]);
              return (
                <li key={r.playerId} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      {i === 0 && '🏐 '}
                      {player ? `${player.firstName} ${player.lastName}` : 'Unknown player'}
                    </span>
                    <span className="text-sm text-gray-500 shrink-0">
                      {r.points} pts · {r.firstPlaceVotes} 1st-place
                    </span>
                  </div>
                  {topReasons.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {topReasons.map(([reason, count]) => `${reason} ×${count}`).join(' · ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {qualityTallies.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-sm font-medium text-gray-700 mb-2">What the team values in a captain</p>
              <ul className="space-y-1">
                {qualityTallies.map(({ quality, count }) => (
                  <li key={quality} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{quality}</span>
                    <span className="text-gray-500">
                      {count}/{ballots.length}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
