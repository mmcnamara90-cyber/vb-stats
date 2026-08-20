import { useState } from 'react';
import { verifyRoleLogin } from '../../../lib/auth';
import { CAPTAIN_VOTE_ROLE, setVoteAuthed } from './voteAuth';

// Mirrors the visual shape of the coach LoginScreen (same card, same brand
// stripe) but is a completely separate login — different shared password
// (login_codes role `jv_captain_vote`, not any team's role), reached only
// via the #vote hash route, never the coach's team-picker screen.
export function VoteLoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setChecking(true);
    setError(null);
    const ok = await verifyRoleLogin(CAPTAIN_VOTE_ROLE, password);
    setChecking(false);
    if (ok) {
      setVoteAuthed();
      onLogin();
    } else {
      setError('Incorrect password.');
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-1 text-brand-indigo">🏐 Captain Vote</h1>
        <div className="flex h-1 rounded-full overflow-hidden mb-3 w-24">
          <div className="flex-1 bg-brand-tomato" />
          <div className="flex-1 bg-brand-rose" />
          <div className="flex-1 bg-brand-cyan" />
          <div className="flex-1 bg-brand-lime" />
        </div>
        <p className="text-sm text-gray-500 mb-5">Enter the team password your coach shared to vote.</p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-gray-300 px-3 mb-2 text-base focus:border-brand-indigo focus:outline-none"
          autoFocus
        />
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

        <button
          type="submit"
          disabled={!password || checking}
          className="min-h-11 w-full mt-2 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
