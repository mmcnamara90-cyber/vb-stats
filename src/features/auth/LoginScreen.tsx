import { useState } from 'react';
import { verifyLogin } from '../../lib/auth';
import type { Team } from '../../types';
import { TEAM_LABELS, TEAMS } from '../tryouts/teams';

export function LoginScreen({ onLogin }: { onLogin: (team: Team) => void }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !password) return;
    setChecking(true);
    setError(null);
    const ok = await verifyLogin(team, password);
    setChecking(false);
    if (ok) {
      onLogin(team);
    } else {
      setError('Incorrect password.');
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-1 text-brand-indigo">VB Stats</h1>
        <div className="flex h-1 rounded-full overflow-hidden mb-3 w-24">
          <div className="flex-1 bg-brand-tomato" />
          <div className="flex-1 bg-brand-rose" />
          <div className="flex-1 bg-brand-cyan" />
          <div className="flex-1 bg-brand-lime" />
        </div>
        <p className="text-sm text-gray-500 mb-5">Select your team and enter the password.</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {TEAMS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTeam(t)}
              className={`min-h-11 rounded-lg text-base font-medium border ${
                team === t ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              {TEAM_LABELS[t]}
            </button>
          ))}
        </div>

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
          disabled={!team || !password || checking}
          className="min-h-11 w-full mt-2 rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
