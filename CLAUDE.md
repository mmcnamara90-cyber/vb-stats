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
for upsert-on-reimport.

## Things NOT done (known gaps / possible follow-ups)

- No real per-user auth — see Auth section above.
- Team roster size (12) isn't per-team configurable, just displayed.
- A pre-existing off-by-one date bug (session date shows one day early in
  timezones behind UTC) was flagged as a separate task chip; not fixed as
  part of this work — check if it was ever addressed before assuming it's
  fixed.
- `Note`/`Lineup`/`StatEvent`/`Drill`/`PracticePlan` types exist for a future
  phase (in-game stat tracking, practice planning) but have no UI or DB
  tables yet.
