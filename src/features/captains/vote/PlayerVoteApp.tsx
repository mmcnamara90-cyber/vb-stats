import { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../../lib/useSupabaseQuery';
import type { CaptainBallot, CaptainElection, Player } from '../../../types';
import { VoteLoginScreen } from './VoteLoginScreen';
import { SelectSelfScreen } from './SelectSelfScreen';
import { BallotForm } from './BallotForm';
import { clearSelfPlayerId, clearVoteAuthed, getSelfPlayerId, isVoteAuthed } from './voteAuth';

const TEAM = 'jv'; // only JV runs a captain vote this year — same as Game Day/Practice

// Entry point for the player-facing captain vote, reached only via the
// `#vote` hash route (see main.tsx) — a completely separate login/flow from
// the coach's LoginScreen/App.tsx. Steps: password gate -> pick yourself
// from the roster -> ballot (or "already voted" / "no vote open" states).
export function PlayerVoteApp() {
  const [authed, setAuthed] = useState(isVoteAuthed());
  const [selfId, setSelfId] = useState<string | null>(() => getSelfPlayerId());
  const [justSubmitted, setJustSubmitted] = useState(false);

  const election = useLiveQuery(async () => {
    const { data } = await supabase
      .from('captainElections')
      .select('*')
      .eq('team', TEAM)
      .eq('status', 'open')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as CaptainElection) ?? null;
  }, []);

  const playerIdsKey = election?.candidatePlayerIds.join(',') ?? '';
  const players = useLiveQuery(async () => {
    if (!election || election.candidatePlayerIds.length === 0) return [];
    const { data } = await supabase.from('players').select('*').in('id', election.candidatePlayerIds);
    return (data as Player[]) ?? [];
  }, [election?.id, playerIdsKey]);

  const self = players?.find((p) => p.id === selfId);

  const existingBallot = useLiveQuery(async () => {
    if (!election || !self) return undefined;
    const { data } = await supabase
      .from('captainBallots')
      .select('*')
      .eq('electionId', election.id)
      .eq('voterId', self.id)
      .maybeSingle();
    return (data as CaptainBallot | null) ?? null;
  }, [election?.id, self?.id]);

  function switchPlayer() {
    clearSelfPlayerId();
    setSelfId(null);
    setJustSubmitted(false);
  }

  function logOut() {
    clearVoteAuthed();
    setAuthed(false);
    setSelfId(null);
  }

  if (!authed) {
    return <VoteLoginScreen onLogin={() => setAuthed(true)} />;
  }

  if (election === undefined || players === undefined) {
    return <CenteredMessage title="Loading…" />;
  }

  if (!election) {
    return (
      <CenteredMessage title="No vote is open right now">
        <p className="text-sm text-gray-500">Check back once your coach opens a captain vote.</p>
        <FooterLinks onLogOut={logOut} />
      </CenteredMessage>
    );
  }

  // Selected id came from localStorage or a past visit — validate against
  // this election's actual roster before trusting it (see voteAuth.ts).
  if (!self) {
    return <SelectSelfScreen players={players} onSelect={setSelfId} />;
  }

  if (existingBallot === undefined) {
    return <CenteredMessage title="Loading…" />;
  }

  if (existingBallot || justSubmitted) {
    return (
      <CenteredMessage title="Thanks for voting! 🏐">
        <p className="text-sm text-gray-500">Your ballot has been submitted, {self.firstName}.</p>
        <FooterLinks onSwitchPlayer={switchPlayer} onLogOut={logOut} />
      </CenteredMessage>
    );
  }

  return (
    <div className="min-h-svh bg-gray-50 px-4">
      <BallotForm
        electionId={election.id}
        self={self}
        candidates={players.filter((p) => p.id !== self.id)}
        onSubmitted={() => setJustSubmitted(true)}
      />
      <div className="max-w-sm mx-auto pb-6">
        <FooterLinks onSwitchPlayer={switchPlayer} onLogOut={logOut} />
      </div>
    </div>
  );
}

function CenteredMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-svh flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function FooterLinks({
  onSwitchPlayer,
  onLogOut,
}: {
  onSwitchPlayer?: () => void;
  onLogOut: () => void;
}) {
  return (
    <p className="text-xs text-gray-400 mt-4 space-x-3">
      {onSwitchPlayer && (
        <button type="button" onClick={onSwitchPlayer} className="underline">
          Not you? Switch player
        </button>
      )}
      <button type="button" onClick={onLogOut} className="underline">
        Log out
      </button>
    </p>
  );
}
