import { supabase } from '../../lib/supabaseClient';
import type { Team, TeamSettings } from '../../types';

export function defaultTeamSettings(team: Team): TeamSettings {
  return {
    team,
    offenseSystem: '6-2',
    liberoCount: 1,
    defaultCallUpPlayerIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchTeamSettings(team: Team): Promise<TeamSettings> {
  const { data } = await supabase.from('teamSettings').select('*').eq('team', team).maybeSingle();
  return (data as TeamSettings | null) ?? defaultTeamSettings(team);
}

export async function saveTeamSettings(patch: Partial<TeamSettings> & { team: Team }): Promise<void> {
  const current = await fetchTeamSettings(patch.team);
  const updated: TeamSettings = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await supabase.from('teamSettings').upsert(updated);
}
