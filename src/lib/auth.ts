import { supabase } from './supabaseClient';
import type { Team } from '../types';

const STORAGE_KEY = 'vb-stats-auth';

export function getStoredTeam(): Team | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw).team as Team) : null;
}

export function setStoredTeam(team: Team) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ team }));
}

export function clearStoredTeam() {
  localStorage.removeItem(STORAGE_KEY);
}

// Checks the password against a hash stored in Postgres via a
// SECURITY DEFINER function — the actual password value never leaves the
// database, so this is safe to call with the public anon key.
export async function verifyLogin(team: Team, password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_login', { p_role: team, p_password: password });
  if (error) return false;
  return data === true;
}
