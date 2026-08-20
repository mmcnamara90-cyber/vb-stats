// Device-local session for the player vote flow — deliberately separate
// storage keys from the coach's `vb-stats-auth` (lib/auth.ts) so logging in
// as a player never touches (or is touched by) the coach's session, even on
// the same device/browser.

const AUTHED_KEY = 'vb-stats-vote-auth';
const SELF_KEY = 'vb-stats-vote-self';

export const CAPTAIN_VOTE_ROLE = 'jv_captain_vote';

export function isVoteAuthed(): boolean {
  return localStorage.getItem(AUTHED_KEY) === 'true';
}

export function setVoteAuthed() {
  localStorage.setItem(AUTHED_KEY, 'true');
}

export function clearVoteAuthed() {
  localStorage.removeItem(AUTHED_KEY);
  localStorage.removeItem(SELF_KEY);
}

// Remembers which roster player this device last identified as — just a
// convenience so reloading mid-flow (or coming back after voting) doesn't
// force re-picking a name from the list every time. Always re-verified
// against the live roster/ballot data before being trusted (see
// PlayerVoteApp.tsx), so a stale/wrong id here is harmless, not a security
// boundary — any player on the shared device can tap "Not you? Switch
// player" at any point.
export function getSelfPlayerId(): string | null {
  return localStorage.getItem(SELF_KEY);
}

export function setSelfPlayerId(playerId: string) {
  localStorage.setItem(SELF_KEY, playerId);
}

export function clearSelfPlayerId() {
  localStorage.removeItem(SELF_KEY);
}
