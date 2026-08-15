# VB Stats — Project Reference

Volleyball tryout stats tracker for a high school program. React + TypeScript +
Vite + Tailwind, deployed as a static site on GitHub Pages, backed by a shared
Supabase Postgres database (not local-only storage — every device reads/writes
the same data).

## Deployment

- **Repo**: https://github.com/mmcnamara90-cyber/vb-stats (branch `main`)
- **Live site**: https://mmcnamara90-cyber.github.io/vb-stats/
- Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds and
  deploys to Pages automatically (~1 min). Vite `base` is `/vb-stats/`
  (`vite.config.ts`) since it's a project page, not a user/org page.
- No local dev data — `npm run dev` talks to the **same live Supabase project**
  as production. There's no separate local/staging database. Be careful with
  destructive SQL; real roster data lives there (87 players as of this
  writing). When testing, insert throwaway rows with obviously-fake IDs
  (e.g. `t1`, `pd1`) and delete them again — don't touch existing rows blindly.

## Supabase backend

- Project: **vb-stats**, ref `hqstbpygfzhtrzxurnpr`, org "Michelle's Personal
  Org" (`yuhxhznmkvhydvfufyyv`), region us-west-1.
- The org's other project, **WC2026 Bracket Pool**, was paused to free a
  free-tier project slot — unrelated app, unpause from the Supabase dashboard
  if it's ever needed again.
- Client config: `src/lib/supabaseClient.ts` (URL + publishable key hardcoded —
  that's intentional, publishable keys are meant to ship in client code; real
  access control is RLS policies, not key secrecy).
- **RLS**: every app table has an "allow all" policy for `anon` — there's no
  per-user Supabase Auth, so this mirrors the old "one shared local database"
  model. `login_codes` is the one exception: RLS enabled with **zero**
  policies, so neither `anon` nor `authenticated` can read it directly at all.
- **Realtime** is enabled on all app tables (`supabase_realtime` publication) —
  see "Data layer" below for how the frontend uses it.

### Tables (all camelCase columns, quoted in SQL)

`players`, `sessions`, `tryoutDrills`, `playerGroups`, `drillRuns`,
`skillScores`, `rosterDecisions`, `benchmarks`, `positionTargets`,
`rosterCandidates` — one-to-one with the TS interfaces in `src/types.ts`.
Plus `login_codes` (role → bcrypt password hash, see Auth below).

Tables that exist in `src/types.ts` (`Note`, `Lineup`, `StatEvent`, `Drill`,
`PracticePlan`) but were never wired to any UI (leftover from an early
scaffold, Open Gym feature was removed) do **not** have Postgres tables —
don't build against them without adding the migration first.

## Auth

Lightweight app-level gate, not real per-user security:

- Login screen (`src/features/auth/LoginScreen.tsx`): 4 role buttons
  (Varsity/JV/Freshman/Level 3) + one password field. All four currently
  share password **`vb123`**.
- Password check: `supabase.rpc('verify_login', { p_role, p_password })` — a
  Postgres `SECURITY DEFINER` function (`verify_login`) that reads
  `login_codes` with elevated privileges and returns only `true`/`false`. The
  actual password value never reaches the client, and `login_codes` can't be
  queried directly via the anon key. To change a password, update the row's
  `password_hash` with `crypt('newpassword', gen_salt('bf'))` via SQL — no
  redeploy needed.
- Session: `src/lib/auth.ts` stores `{team}` in `localStorage` under
  `vb-stats-auth` on success. No expiry, no server-side session — clearing
  browser storage logs you out.
- **Ceiling on this security model**: a static site's Supabase anon key is
  necessarily public, so this is a "keep casual visitors out" gate, not
  protection against a determined actor reading data directly via the API.
  Real protection would require Supabase Auth (real accounts) + RLS keyed to
  `auth.uid()` — a bigger change, not done here.
- Logging in with a role sets that as the default/home `team` for Roster
  Builder, but nav to Roster/Tryouts/other teams is unrestricted — all roles
  see all data.

## Data layer pattern

Originally Dexie/IndexedDB (local-only) — fully replaced. The migration
pattern, if you're extending this further:

- `src/lib/supabaseClient.ts` — the `supabase` client.
- `src/lib/useSupabaseQuery.ts` — drop-in-ish replacement for
  dexie-react-hooks' `useLiveQuery`: same signature
  (`useSupabaseQuery(queryFn, deps)`), returns `undefined` while loading.
- `src/lib/realtimeVersion.ts` — one global realtime subscription across the
  whole `public` schema; any table change bumps a version counter that
  `useSupabaseQuery` depends on, so all live queries refetch on any change.
  Coarse (refetches more than strictly necessary) but simple and correct at
  this app's data volume. Known dev-only noise: React StrictMode's double
  effect invocation can cause a harmless 409 in the console when two
  `ensurePositionTargets` upserts race — doesn't happen in production builds,
  doesn't corrupt data (confirmed via direct testing).
- Every component calls `supabase.from('table').select/insert/update/delete`
  directly (no repository/service layer) — matches the original Dexie-direct
  style, just swap the API surface.

## Roster Builder — business rules

`src/features/tryouts/RosterBuilderTab.tsx` is the biggest/most bespoke file.
Top-level screen (not nested under Tryouts) — `src/App.tsx` routes to
`RosterBuilderScreen`, which wraps `RosterBuilderTab`.

- **Teams**: `varsity`, `jv`, `level3`, `freshman` (`src/types.ts` `Team`).
  Ordered most→least selective in `TEAM_ORDER` (`teams.ts`) — drives both the
  "push down a level" action and cascade eligibility below.
- **Position targets**: per (team, position) min/target counts, editable
  inline, seeded from `DEFAULT_POSITION_TARGETS` on first view of a team
  (idempotent upsert with `ignoreDuplicates`, deterministic id
  `` `${team}:${position}` ``).
- **RosterCandidate**: a player being considered/confirmed for a
  (team, position). Confirming demotes any other confirmed slot the same
  player holds *on the same team* (one slot per team). No such demotion
  across teams — a player can be confirmed on multiple teams simultaneously
  (e.g. still being confirmed on JV while also confirmed on Varsity is
  possible; it's on the coach to resolve, not enforced by the app).
- **Available Players widget**: per team, cascade-eligible players not yet
  assigned to *this* team, with one-tap "+position" buttons (using the
  player's tagged position(s)). Untagged players (common for new Freshman
  signups) get a "Tag position…" dropdown that both saves the tag to the
  player record and adds the candidacy in one action.
  - Cascade eligibility (`cascadeEligiblePlayers` in RosterBuilderTab.tsx):
    Varsity = manual, everyone. JV = grade ≤ 11, not on Varsity. Level 3 =
    grade ≤ 10, not on Varsity/JV. Freshman = grade 9, always (no exclusion).
  - **Symmetric grey-out**: being a candidate (any status) on *any other*
    team greys a player out (italic, uncountable, un-addable) everywhere
    else — not just "higher team locks lower," fully symmetric.
  - Cut players (`rosterDecisions.madeTeam = false` for the current
    cycle, see `currentTryoutCycleId()` in `skills.ts`) are excluded from
    every team's pool entirely.
- **Push down a level**: each candidate row has a "↓ [next team]" button
  (hidden on Freshman, the bottom tier) that deletes the candidacy on the
  current team and re-adds it as "considering" on the next-lower team, same
  position — so declining someone for Varsity lands them straight on JV's
  list.
- **Roster size**: `TEAM_ROSTER_SIZE = 12` (teams.ts) — a badge next to the
  team switcher shows total confirmed (summed across all positions) vs. 12.
  Hardcoded, not per-team-editable (only asked for the display, not a
  configurable cap).
- **Search**: every player list in the app (not just Roster Builder) uses
  `matchesPlayerQuery` (`src/lib/playerSearch.ts`) — prefix match on
  first/last name, substring match on grade label or position label/code.
  Shared `PlayerSearchInput` component in `src/features/roster/`.
- **Grade display**: `playerGradeLabel()` (`playerSearch.ts`, wraps
  `gradYearToGrade`/`gradeLabel` from `src/lib/grade.ts`) — shown on every
  player row app-wide. `Player.gradYear` is the stored fact (never changes);
  grade level is always computed relative to *today's date*, so it advances
  each fall automatically.

## Skill scoring model (pre-dates the Supabase migration, unchanged)

- Drills tagged with one `Skill` (serve, serve_receive, free_ball, down_ball,
  setting, hitting, blocking, digging, athleticism, volleyball_iq,
  coachability). Taps are 0–3. Composite = tap avg → drill avg → skill avg →
  overall avg (`src/features/tryouts/composite.ts`).
- Tryout `Session`s carry a `level` (`upper`/`lower`) — Upper feeds
  Varsity/JV, Lower feeds Freshman/Level 3 (`TEAM_LEVEL` in `teams.ts`).
  Benchmarks and the radar chart are scoped per level.
- **Benchmarks** (`BenchmarksTab.tsx`): coach-set target score per
  (position, skill, level), with a computed top-10%-of-players suggestion
  shown alongside (never auto-overwrites the manual value).
- **Radar chart** (`RadarChart.tsx`, plain SVG, no chart library): 5 axes
  defined in `radar.ts` — Ball Handling (serve_receive+free_ball+down_ball+
  digging+setting), Attacking (hitting), Serving (serve), Blocking
  (blocking), Intangibles (athleticism+volleyball_iq+coachability). Used in
  `CandidateComparisonModal.tsx` when comparing 2+ "considering" candidates
  for one position.

## Roster CSV import

`src/features/roster/importRoster.ts` + `ImportRosterModal.tsx` — parses the
Airtable "Table 1-Grid view.csv" export format specifically (First/Last/
Grade/Position/Player Phone #/Player Email columns). Position mapping:
`OH`/`MB`/`Setter→S`/`OPP`/`DS/Lib→DS_L`, `Unsure` dropped. Skips rows where
Grade is "Coach" or First/Last starts with `(` (Airtable's unset-select
placeholder). Matches existing players by case-insensitive first+last name
for upsert-on-reimport. `src/lib/csv.ts` holds the shared CSV parser
(`parseCsv`/`parseCsvObjects`/`parseCsvHeader`) — also used by the score
importer below.

## Tryout score CSV import (SoloStats or similar)

Tryouts tab → **Import** sub-tab (`ImportScoresTab.tsx` + `importScores.ts`).
Generic column-mapper, not hardcoded to one export format, since real
exports vary by report type (passing, serving, hitting, ...):

- Wizard: upload → pick session date + tryout level (creates/reuses that
  day's `Session` via `getOrCreateSessionForDate` in `dailySession.ts`,
  which import can target a past date, not just "today") → map each CSV
  column to Ignore / an existing `TryoutDrill` / a new drill (created on
  commit) → review every player match → insert `SkillScore` rows.
- **Player matching**: first-name keyed (`matchPlayerByName` in
  `importScores.ts`), first whitespace token of the mapped name column.
  A mapped last-name column narrows ambiguous first-name matches (the
  roster has real duplicate first names, e.g. two "Taylor"s) automatically;
  otherwise the coach resolves ambiguous/no-match rows by hand before
  committing — no silent guessing.
- Rows whose mapped name is blank or `"Total"` (case-insensitive) are
  auto-skipped — matches SoloStats' trailing summary/blank rows.
- `skillScores.score` was widened from Postgres `integer` to `numeric` (and
  `SkillScore.score` from `0 | 1 | 2 | 3` to `number` in `types.ts`) so
  imported pre-averaged ratings (e.g. `1.82`) store exactly; manual taps via
  `ScoreTab` still only ever write 0-3.
- Imported `scoredAt` is set to noon UTC on the chosen session date (not
  "now"), to avoid the timezone off-by-one noted below.
- Last-used column mapping is cached in `localStorage`, keyed by the sorted
  CSV header signature, so re-importing the same report shape next week
  pre-fills.

## Lineup Simulator

Roster Builder screen → **🏐 Lineups** toggle (next to the Roster/team
switcher in `RosterBuilderScreen.tsx`) → `LineupSimulatorTab.tsx`. An
evaluation scratchpad distinct from the legacy `Lineup` type (see below) —
not tied to a live game/set.

- **Data**: `lineups` table (`SavedLineup`/`LineupSub` in `types.ts`) — one
  row per named, saved lineup per team: `zoneAssignments` (zone 1-6 →
  playerId, Rotation 1 only) + `subs` (explicit "Player A subs for Player
  B" list, separate from live swapping). Allow-all RLS + realtime, same
  pattern as every other table.
- **Court grid** matches the coach's sketch exactly: front row (at the net)
  is zones 4, 3, 2 left-to-right; back row is zones 5, 6, 1 left-to-right.
- **Placement**: tap-to-place, not drag-and-drop (mobile-first, touch-drag
  is unreliable) — tap a bench player, then a court cell to place them
  (bumping any occupant back to the bench); tap a filled cell with nothing
  selected to clear it. Bench pool is that team's `rosterCandidates`
  (considering + confirmed), not every active player.
- **Rotations 2-6 are derived, not independently editable** —
  `zoneAssignmentsForRotation` in `lineupRotation.ts` applies the standard
  clockwise rotation rule (verified against `docs/volleyball-domain-knowledge.md`
  §1.2: player in zone *p* moves to zone *p−1*, wrapping 1→6). Only
  Rotation 1 is the source of truth; switching to 2-6 shows a read-only
  computed grid.
- **Radar popover** (`PlayerRadarPopover.tsx`): a small 📊 icon + modal
  reusing `RadarChart`/`radar.ts`, on every bench/court/sub row — lets a
  coach check a player's 5-axis profile without navigating away.

## Game Day — live roster/lineup/stat tracking

Top-level nav tab (`src/features/games/GameDayScreen.tsx`, routed from
`App.tsx`) — separate from the Roster Builder's Lineup Simulator (that's a
pre-game evaluation scratchpad; this is the live-game record). Team switcher
+ game list → `GameDetailScreen.tsx` (Roster / Lineup / Live / Insights
sub-tabs) once a game is selected.

- **Data**: `games`, `gameLineups`, `gameStatEvents` tables (`Game`/
  `GameLineup`/`GameStatEvent`/`GameStatType` in `types.ts`) — allow-all RLS
  + realtime, same pattern as every other table. Distinct from the legacy
  unused `Lineup`/`StatEvent` scaffold types that predate this feature (see
  "Things NOT done" below) — those were never wired up; these are the real
  implementation.
- **Roster tab**: `games.rosterPlayerIds` is seeded on creation from the
  chosen team's confirmed `rosterCandidates`, then freely editable — the
  main use case is adding call-up players from another team (e.g. a few
  Varsity players playing up in a JV scrimmage) via a cross-team player
  search; call-ups get a "Call-up · [team]" badge on the roster list.
- **Lineup tab**: same tap-to-place zone-assignment UI as the Lineup
  Simulator (`zoneAssignmentsForRotation` from `lineupRotation.ts`, Rotation
  1 is source of truth, 2-6 derived), but scoped per `(gameId, setNumber)`
  in `gameLineups` instead of the Roster Builder's per-team `lineups` table.
  Bench pool is the game's roster, not `rosterCandidates`. "+ Set" adds
  additional sets (no best-of-3/5 enforcement — just an incrementing
  number the coach controls). Also hosts **Planned Substitutions** and
  **Libero(s)** config (see below) — both scoped to the same `gameLineups`
  row (per set), since either can differ set to set. Uses a local
  optimistic-state pattern (`workingLineup` in `GameLineupTab.tsx`, synced
  from the query but advanced synchronously on every edit) rather than
  reading `persist()`'s base straight from the live query result — **two
  real bugs were caught in testing here, worth knowing if extending this
  further**: (1) building each patch from the query result directly meant
  a burst of rapid edits (e.g. tapping both libero "shadow" toggles back to
  back) would race the Supabase upsert + realtime refetch round-trip and
  silently drop the earlier edit; (2) the naive fix — a local placeholder
  stamped with `new Date().toISOString()` before any row exists — backfired
  because that "now" timestamp is *newer* than whatever real row
  eventually loads, so the "adopt the server row once it's at least as
  fresh" check never fired and a previously-saved lineup would render
  empty until edited. Fixed by stamping the not-yet-loaded placeholder
  (`phantomLineup()`) with `updatedAt: ''` instead, which sorts before any
  real ISO timestamp.
- **Planned substitutions**: `GameLineup.subs` (`PlannedSub[]` in
  `types.ts`) — **scheduled by tapping the court, not a separate form**:
  on the Rotation 2-6 preview, tap the player leaving, then pick who's
  coming in from the list that appears (mirrors the same tap-driven feel
  as Rotation 1's bench-then-cell placement, which coaches already know).
  Effective from the tapped rotation onward. Applied cumulatively in
  ascending `effectiveRotation` order (chainable — a later sub can bring
  the original starter back in) for every rotation from there on, **1→6
  linearly, not wrapping** — the app doesn't track how many times the team
  has cycled through the rotation order in a set, so a sub declared "from
  Rotation 2" stays in effect through 3,4,5,6,1 without re-evaluating;
  this is a deliberate simplification, not a rules model. A read-only list
  below the grid (`SubsList`) shows everything planned so far with a
  per-row Remove — the only way to delete a sub.
- **Libero(s)**: `GameLineup.liberos` (`LiberoAssignment[]` in
  `types.ts`) — up to 2 per set (NFHS 2026-27 Rule 6-4-2), each shadowing
  1-2 Rotation-1 starters (commonly both middles) via `shadowedPlayerIds`.
  She takes over whichever shadowed starter's zone is currently back row,
  computed off the *raw* Rotation-1 map so she keeps tracking those
  teammates regardless of what a planned sub did elsewhere; if her two
  shadowed starters are ever back row at the same time (not expected with
  standard opposite-middle placement, but not assumed), whichever zone is
  scanned first (fixed `[1,5,6]` order) wins. With 2+ shadowed players,
  `servesForPlayerId` disambiguates which one's Zone-1 turn is actually
  hers to serve (defaults to the first shadowed player if unset) — the
  NFHS "only one position in the serving order" constraint stops being
  automatic once a libero covers more than one player, so it's an
  explicit field rather than always-computed. `computeEffectiveCourt()`
  also flags (never blocks) `liberoConflict`: true when both designated
  liberos would be on court in the same rotation, which the rule doesn't
  allow but the app doesn't enforce — shown as an amber warning on both
  the Lineup and Live tabs.
- **Live tab**: shows the 6 players on court for the selected set +
  rotation (rotation is a manual toggle — the coach advances it, there's no
  automatic side-out detection), computed via `computeEffectiveCourt()`
  (`effectiveCourt.ts`) which layers mechanical rotation → planned subs →
  libero swap(s), in that order, on every rotation including Rotation 1 (so
  a libero who starts the set already on the court shows correctly). A
  violet banner above the roster names any subs/libero(s) active for the
  current rotation, plus the conflict warning if both liberos would be on
  court at once. A player playing libero this rotation never gets attack
  buttons (libero can't attack) regardless of her tagged position — see
  `showAttack` in `LiveStatsTab.tsx`. Each player's stat buttons are
  otherwise driven by `statRolesForPositions()` (`gameStats.ts`) off their
  tagged `Position`s, unioned if a player has more than one:
  - Hitter (OH/MB/OPP): Attempt / Kill / Error + serve receive 0-3 rating.
  - Passer (DS_L): serve receive 0-3 rating only.
  - Setter (S): Set Attempt / "Kill Off Set" (i.e. assist — a set that
    converted to a kill).
  Every tap inserts a `gameStatEvent` row (serve receive stores its 0-3 as
  `value`, like `SkillScore` taps); a one-tap "Undo last" button above the
  roster undoes the single most recent tap (names what it'll undo before
  you commit), and a "Recent" log below with per-row tap-to-undo (hard
  delete) handles corrections further back. Stat counts shown per player
  are cumulative for the whole set, not just the current rotation —
  `rotation` is stored on each event for later analysis, not used to
  filter the tally.
  - **Gotcha already hit once, worth knowing**: `effectiveCourt.ts`
    deliberately never does `Object.keys(zoneMap) as CourtZone[]` — a
    zone map's keys come back as strings ("5") even though `CourtZone` is
    numeric, so comparing a key against a numeric zone list with
    `.includes()`/`===` silently never matches. It iterates a fixed
    `[1,2,3,4,5,6]` array and indexes into the map instead (safe, since
    JS coerces numeric-vs-string keys on property *access*, just not on
    equality checks). Don't reintroduce the `Object.keys` pattern here.
- **Insights tab**: computed client-side from `gameStatEvents` via
  `buildPlayerStatLine`/`buildInsights` in `gameStats.ts` — hitting %
  ((kills−errors)/attempts), serve-receive average, setting conversion %
  (assists/set attempts), plus simple threshold-based "working well"/"worth
  a look" flags (documented in-app as computed, not AI-generated). Chosen
  over a real LLM-generated summary because that needs a Supabase Edge
  Function + Anthropic API key (secret can't live in this static site) —
  a possible future upgrade, not built yet.

## Volleyball domain knowledge

`docs/volleyball-domain-knowledge.md` — a coach-authored reference brief on
NFHS (US high school) rules, court/rotation mechanics, libero rules (which
changed for 2026-27), substitution limits, and terminology, plus a forward-
looking data-model sketch (Match/Set/RotationState/StatEvent/
ServeReceiveFormation/TryoutEvaluation) for the in-game stat tracking and
serve-receive planning phases that don't exist yet (see "Things NOT done"
below). Read it before building anything in that direction — it also flags
several open decisions (ruleset scope beyond NFHS, stat-capture granularity,
access control for minors' data) that are the coach's call, not assumed.

## Things NOT done (known gaps / possible follow-ups)

- No real per-user auth — see Auth section above.
- Team roster size (12) isn't per-team configurable, just displayed.
- A pre-existing off-by-one date bug (session date shows one day early in
  timezones behind UTC) was flagged as a separate task chip; not fixed as
  part of this work — check if it was ever addressed before assuming it's
  fixed.
- `Note`/`Lineup`/`StatEvent`/`Drill`/`PracticePlan` types are an early
  scaffold, still unused (no UI or DB tables) — superseded, not replaced,
  by the actual Game Day feature above (`Game`/`GameLineup`/`GameStatEvent`
  types, `games`/`gameLineups`/`gameStatEvents` tables). Don't confuse
  either of these with `SavedLineup`/`lineups` (the Lineup Simulator's
  separate pre-game scratchpad).
- Game Day is a deliberately simplified slice of `docs/volleyball-domain-
  knowledge.md`'s full design brief, built fast to pilot at a scrimmage —
  it does NOT implement: best-of-3/5 set/match structure or win
  conditions, libero designation/tracking, substitution-limit tracking,
  rotational-fault validation, or serve-receive formation
  planning/candidates (Section 1.7). Rotation advancement in the Live tab
  is a manual coach toggle, not derived from serve/side-out state. If any
  of that becomes a real need, read the domain doc's Section 2 data model
  (Match/Set/RotationState/ServeReceiveFormation) before extending — the
  current schema doesn't have the shape for it yet.
