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
  // 0-3 for manually-tapped scores (ScoreTab); imported scores (CSV import)
  // may be a decimal average (e.g. 1.82) — the DB column is `numeric`.
  score: number;
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

// ===== Roster building (during tryouts, before final cut decisions) =====

// Upper pool feeds Varsity/JV; Lower pool feeds Freshman/Level 3. Each team
// gets its own depth chart even though two teams share a tryout pool.
export type Team = 'varsity' | 'jv' | 'freshman' | 'level3';

// Coach-set defaults for a team, used to pre-fill Game Day rather than
// re-entering the same choices every game. offenseSystem is stored/shown
// for reference only right now — no behavior currently branches on it (the
// back-row-setter assist default already works the same way under 5-1 or
// 6-2, since it's rotation-based, not system-based). liberoCount pre-fills
// that many blank libero slots when a new game lineup is created (see
// emptyLineup in GameLineupTab.tsx). defaultCallUpPlayerIds are merged into
// rosterPlayerIds when a new game is created (see NewGameForm in
// GameDayScreen.tsx) — e.g. the 1-5 Varsity players who regularly play up.
export interface TeamSettings {
  team: Team;
  offenseSystem: '5-1' | '6-2';
  liberoCount: 1 | 2;
  defaultCallUpPlayerIds: string[];
  updatedAt: string;
}

// How many of a position a team needs. Editable per team — these are targets,
// not hard caps.
export interface PositionTarget {
  id: string;
  team: Team;
  position: Position;
  minCount: number;
  targetCount: number;
}

// A player being weighed for (or locked into) a specific team+position slot.
// A player can be "considering" for several team/position combos at once
// (e.g. both JV and Varsity setter) but should only be "confirmed" for one —
// confirming fills that one quota; other tagged positions are just shown as
// bonus context, not double-counted.
export interface RosterCandidate {
  id: string;
  team: Team;
  position: Position;
  playerId: string;
  status: 'considering' | 'confirmed';
  createdAt: string;
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

// ===== Lineup Simulator (Roster Builder sub-view, evaluation tool) =====
// Distinct from `Lineup` above: this isn't tied to a live game/set, just a
// coach's saved "what would this starting 6 look like" experiment per team.

export interface LineupSub {
  id: string;
  inPlayerId: string;
  outPlayerId: string;
  note?: string;
}

export interface SavedLineup {
  id: string;
  team: Team;
  name: string;
  zoneAssignments: Partial<Record<CourtZone, string>>; // zone -> playerId, rotation 1 only; 2-6 are derived
  subs: LineupSub[];
  createdAt: string;        // ISO datetime
  updatedAt: string;        // ISO datetime
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

// ===== Game Day (live scrimmage/match roster, lineup, and stat tracking) =====
// Distinct from the legacy `Lineup`/`StatEvent` scaffold above (never wired
// to a DB table) and from `SavedLineup` (the Roster Builder's "what would
// this starting 6 look like" evaluation scratchpad) — these are the actual
// live-game records: a real roster for a specific game (which can pull up
// players from another team, e.g. Varsity call-ups playing with JV), a
// per-set starting lineup, and per-player stat taps during play.

export interface Game {
  id: string;
  team: Team;              // whose game this is, e.g. 'jv'
  opponent: string;
  date: string;             // ISO date
  notes?: string;
  rosterPlayerIds: string[]; // this game's full roster: home team + any call-ups
  createdAt: string;        // ISO datetime
}

export interface GameLineup {
  id: string;
  gameId: string;
  setNumber: number;
  zoneAssignments: Partial<Record<CourtZone, string>>; // zone -> playerId, rotation 1 only; 2-6 derived
  subs: PlannedSub[];        // rotation-triggered player swaps planned ahead of time
  liberos: LiberoAssignment[]; // 0-2 designated liberos for this set (NFHS 2026-27 Rule 6-4-2)
  createdAt: string;        // ISO datetime
  updatedAt: string;        // ISO datetime
}

// A substitution the coach knows is coming at a specific point in the
// rotation order — e.g. "Leila comes in for Olivia once we reach Rotation
// 2." Takes effect for that rotation and every rotation after it (in
// ascending numeric order, 1→6, not wrapping back around) until reversed
// by another PlannedSub — e.g. subbing the original starter back in later.
// Distinct from the libero swap below: this is a one-time, coach-declared
// swap, not a recurring back-row/front-row pattern.
export interface PlannedSub {
  id: string;
  outPlayerId: string;
  inPlayerId: string;
  effectiveRotation: number; // 1-6
}

// A designated libero and who she shadows. shadowedPlayerIds is usually
// both middles (a common real scheme — libero replaces whichever middle
// is currently back row) but can be just one. servesForPlayerId picks
// which ONE shadowed player's Zone-1 (server) turn is actually hers to
// serve — required to disambiguate once there's more than one shadowed
// player, since NFHS only allows a libero to serve in one position in
// the serving order. Up to 2 of these per set (0, 1, or 2 designated
// liberos) — only one is ever supposed to be on court at a time; the
// app flags (doesn't block) a rotation where both would be.
export interface LiberoAssignment {
  id: string;
  liberoPlayerId: string;
  shadowedPlayerIds: string[]; // 1-2 Rotation-1 starters
  servesForPlayerId?: string;  // must be one of shadowedPlayerIds; defaults to the first if unset
}

// Kept intentionally small relative to the full StatType/StatEvent scaffold
// above — this covers exactly what's tracked live by role (see
// gameStats.ts): hitters/setters (attack_attempt/kill/attack_error +
// serve_receive), passers (serve_receive only), anyone on court (assist),
// whoever's in Zone 1 this rotation (serve). `set_attempt` is historical —
// no UI writes it anymore (see gameStats.ts), kept so old games' data still
// reads back correctly.
export type GameStatType =
  | 'attack_attempt'
  | 'kill'
  | 'attack_error'
  | 'serve_receive'
  | 'set_attempt'
  | 'assist'
  | 'serve';

export interface GameStatEvent {
  id: string;
  gameId: string;
  setNumber: number;
  playerId: string;
  statType: GameStatType;
  value?: number;           // 0-3 rating, serve_receive only
  rotation?: number;        // 1-6, which rotation was live when this was recorded
  createdAt: string;        // ISO datetime
}

// ===== Practice stat tracking =====
// A lighter-weight sibling of Game/GameStatEvent — no rotation/lineup/subs/
// libero (practices aren't run as a fixed 6-on-court rotation) and no
// opponent/call-up flow, just the team's own confirmed roster. See
// PracticeTrackTab.tsx and gameStats.ts's MinimalStatEvent for how this
// shares the same stat-card UI and box-score math as Game Day without
// needing gameId/setNumber/rotation.
export interface Practice {
  id: string;
  team: Team;
  date: string;             // ISO date
  label: string;            // e.g. "Practice", "Scrimmage" — free text, defaults to "Practice"
  rosterPlayerIds: string[]; // snapshotted from confirmed rosterCandidates at creation
  drillIds: string[];        // this practice's plan — ordered PracticeDrill ids, see "Plan" tab
  createdAt: string;        // ISO datetime
}

// Deliberately excludes set_attempt/serve — no setter-conversion tracking
// and no server to track serve quality against without a rotation.
export type PracticeStatType = 'attack_attempt' | 'kill' | 'attack_error' | 'serve_receive' | 'assist';

export interface PracticeStatEvent {
  id: string;
  practiceId: string;
  playerId: string;
  statType: PracticeStatType;
  value?: number;           // 0-3 rating, serve_receive only
  drillId?: string;          // which PracticeDrill this tap happened during; undefined = "General" (no drill selected)
  createdAt: string;        // ISO datetime
}

// A reusable, named drill in the practice catalog — e.g. "Line Passing" or
// "Queens of the Court". Global, not team-scoped (mirrors TryoutDrill).
// Distinct from the legacy `Drill`/`PracticePlan` scaffold below: those
// predate any real practice-tracking feature and were never wired to a DB
// table; this is the actual implementation, built against `Practice.drillIds`
// (the day's plan) and `PracticeStatEvent.drillId` (which drill a tap
// happened during) instead of `sessionId`/`focusSkills[]`/`durationMinutes`.
export interface PracticeDrill {
  id: string;
  name: string;
  description?: string;
  focusSkill?: Skill;        // optional — reuses the tryout Skill taxonomy, shown as a badge
  createdAt: string;        // ISO datetime
}

export type DrillPayoff = 'high' | 'medium' | 'low';

// How one specific drill went in one specific practice — separate from
// PracticeDrill (the reusable catalog entry) the same way GameLineup is
// separate from Game: PracticeDrill describes the drill in general,
// PracticeDrillLog describes today's run of it. One row per
// (practiceId, drillId) pair, id deterministically `${practiceId}:${drillId}`
// (same pattern as PositionTarget's `${team}:${position}`) so saving is a
// plain upsert-by-id, no separate unique constraint needed. All three
// fields are optional and independently editable from the Plan tab at any
// point before/during/after the drill — durationMinutes and payoff are also
// exactly what a future real-AI summary would want as structured input
// alongside the raw stat taps (see PracticeSummaryTab/practiceSummary.ts).
export interface PracticeDrillLog {
  id: string;
  practiceId: string;
  drillId: string;
  durationMinutes?: number;
  payoff?: DrillPayoff;
  notes?: string;
  followUp: boolean;         // "flag this drill for next practice" checkbox
  updatedAt: string;         // ISO datetime
}

// ===== Growth tracking =====
// Just reuse SkillScore with sessionType filtered — no separate table needed.
// Growth report = SkillScore[] grouped by playerId + skill, sorted by scoredAt.

// ===== Early scaffold, still unused — superseded by PracticeDrill above =====
// Never wired to a DB table (sessionId refers to the old Session type, which
// also has no table). Kept only so nothing that referenced it historically
// breaks; don't build against this — use PracticeDrill/Practice.drillIds.
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
