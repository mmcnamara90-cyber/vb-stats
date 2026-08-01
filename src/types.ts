// ===== Core entities =====

export type Position = 'OH' | 'MB' | 'S' | 'OPP' | 'DS_L'; // outside, middle, setter, opposite, defensive specialist/libero

// Which tryout pool a session belongs to. Upper -> varsity/JV, Lower -> freshman/level 3.
// Benchmarks are scoped per level since the two pools score very differently.
export type TryoutLevel = 'upper' | 'lower';

export interface Player {
  id: string;              // uuid
  firstName: string;
  lastName: string;
  gradYear: number;
  positions: Position[];   // players can be tried out for more than one position
  jerseyNumber?: number;
  contactPhone?: string;
  contactEmail?: string;
  tags: string[];          // e.g. ["returner", "club-outside", "jv-callup"]
  active: boolean;          // false once cut or graduated, keep for history
  createdAt: string;        // ISO date
}

export type SessionType = 'open_gym' | 'tryout' | 'practice' | 'game';

export interface Session {
  id: string;
  type: SessionType;
  date: string;             // ISO date
  level?: TryoutLevel;      // for tryout sessions: which pool (upper/lower) this day is scoring
  label?: string;           // e.g. "Tryout Day 2" or "vs. Lakewood"
  notes?: string;           // session-level freeform
}

// The skill taxonomy — USE THE SAME LIST everywhere (tryouts + growth tracking)
export type Skill =
  | 'serve'
  | 'serve_receive'
  | 'free_ball'
  | 'down_ball'
  | 'setting'
  | 'hitting'
  | 'blocking'
  | 'digging'
  | 'athleticism'
  | 'volleyball_iq'
  | 'coachability';

// A coach-set (or system-suggested) target score for a position+skill within a
// tryout level. Manual values always win in the UI — the computed top-10%
// suggestion is shown alongside but never silently overwrites this row.
export interface Benchmark {
  id: string;
  position: Position;
  skill: Skill;
  level: TryoutLevel;
  manualValue: number;      // 0-3 scale, coach-set target
  updatedAt: string;        // ISO datetime
}

// A specific rateable activity within a skill category, e.g. "Line Passing"
// under serve_receive. Coaches tally 0-3 taps per player per drill; those
// taps average into a drill score, drill scores average into a skill score.
export interface TryoutDrill {
  id: string;
  name: string;
  description?: string;
  skill: Skill;
  createdAt: string;        // ISO date
}

export interface SkillScore {
  id: string;
  playerId: string;
  sessionId: string;
  drillId: string;
  runId?: string;            // which DrillRun this tap was recorded during
  skill: Skill;              // denormalized from the drill for fast grouping
  score: 0 | 1 | 2 | 3;
  notes?: string;
  scoredAt: string;         // ISO datetime
}

// A saved, reusable set of players, e.g. "Juniors" or "Back Row Candidates".
export interface PlayerGroup {
  id: string;
  name: string;
  playerIds: string[];
  createdAt: string;        // ISO date
}

// A single timed instance of running a drill with a specific set of players.
// Taps recorded while a run is active still roll up into the player's
// all-time drill/skill averages (see composite.ts) — the run just scopes
// who's being evaluated and gives the workflow a clear start/stop.
export interface DrillRun {
  id: string;
  drillId: string;
  sessionId: string;
  playerIds: string[];
  startedAt: string;         // ISO datetime
  endedAt?: string;          // ISO datetime; undefined while still active
}

export interface Note {
  id: string;
  playerId: string;
  sessionId: string;
  text: string;
  createdAt: string;        // ISO datetime
}

export interface RosterDecision {
  id: string;
  playerId: string;
  tryoutCycleId: string;    // groups a set of tryout sessions, e.g. "2026-fall"
  madeTeam: boolean | null; // null = undecided
  compositeScore?: number;  // computed, cached for fast sorting
  decisionNotes?: string;
  decidedAt?: string;
}

// ===== Lineup / rotation =====

export type CourtZone = 1 | 2 | 3 | 4 | 5 | 6; // standard volleyball rotation zones

export interface Lineup {
  id: string;
  gameId: string;           // = a Session with type 'game'
  setNumber: number;        // 1-5
  startingRotation: 1;      // rotation 1 is what you configure; 2-6 are derived
  zoneAssignments: Record<CourtZone, string>; // zone -> playerId
  liberoPlayerId?: string;
  liberoReplacesPlayerId?: string; // who the libero swaps for
}

// ===== Live stats =====

export type StatType =
  | 'kill' | 'attack_error' | 'attack_attempt'
  | 'ace' | 'serve_error'
  | 'dig'
  | 'block_solo' | 'block_assist' | 'block_error'
  | 'assist' | 'set_error'
  | 'reception_error';

export interface StatEvent {
  id: string;
  gameId: string;
  setNumber: number;
  playerId: string;
  statType: StatType;
  rotationAtTime?: number;  // 1-6, useful for later analysis
  timestamp: string;        // ISO datetime
}

// ===== Growth tracking =====
// Just reuse SkillScore with sessionType filtered — no separate table needed.
// Growth report = SkillScore[] grouped by playerId + skill, sorted by scoredAt.

// ===== Practice planning (Phase 5, lower priority — define later) =====
export interface Drill {
  id: string;
  name: string;
  focusSkills: Skill[];
  durationMinutes: number;
  description: string;
  minPlayers?: number;
}

export interface PracticePlan {
  id: string;
  sessionId: string;
  drills: { drillId: string; orderIndex: number; durationMinutes: number }[];
}
