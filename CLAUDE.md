# VB Stats — Project Reference

Volleyball tryout stats tracker for a high school program. React + TypeScript +
Vite + Tailwind, deployed as a static site on GitHub Pages, backed by a shared
Supabase Postgres database (not local-only storage — every device reads/writes
the same data).

## Brand palette

Defined as Tailwind v4 `@theme` tokens in `src/index.css` (no `tailwind.config` —
this project uses CSS-based Tailwind v4 config): `brand-indigo` (#222e50),
`brand-indigo-dark` (#19233d, hover/active shade), `brand-lime` (#e0ff4f),
`brand-cyan` (#9cfffa), `brand-rose` (#ff70a6), `brand-tomato` (#f55d3e).
`brand-indigo` replaced the old `blue-600`/`blue-700`/`blue-500` and the
`bg-gray-900` "selected pill" pattern everywhere across the app (nav active
tab, primary buttons, selected pills/rotation-set selectors) — one unified
primary color instead of two different ones. The lighter tint classes
(`blue-50` through `blue-400`, used for hover/selected-cell backgrounds in
Roster Builder, the Lineup Simulator, GameLineupTab, etc.) were deliberately
**left alone** — that's a much larger, lower-value surface to touch and lower
risk to leave as-is. The other four palette colors are used sparingly as
accents (e.g. the login screen's title underline stripe) — **not** applied to
the Game Day Live tab's stat-quality color coding (kill/error green/red, the
serve-receive/serve 0-3 gradient, amber warnings), which is tuned for fast
scanning during live play and is a functional/semantic system, not branding.

### Runtime-swappable themes

Both the brand palette above and the stat-quality color coding are now
swappable at runtime, toggled from Settings → Preferences ("Site look" /
"Stat colors") and stored per-device in `localStorage` (not synced to
Supabase — this is a look preference, not shared coaching data). See
`src/lib/uiTheme.ts` for the read/apply helpers and constants
(`SITE_THEMES`, `STAT_THEMES`).

- **Mechanism**: each `--color-brand-*` / `--color-stat-*` token in
  `@theme` (`src/index.css`) is defined as `var(--brand-*)` /
  `var(--stat-*)` indirection rather than a literal hex — Tailwind only
  needs the token to exist at build time to compile e.g. `bg-brand-indigo`
  into `background-color: var(--color-brand-indigo)`, and that keeps
  resolving live as the underlying custom property changes. The actual
  color values live in `:root` (defaults) and in `[data-site-theme='ocean']`
  / `[data-stat-theme='colorblind']` override blocks. `applySiteTheme`/
  `applyStatTheme` just set `document.documentElement.dataset.siteTheme` /
  `.statTheme`, which is what selects the override block. **Don't flatten
  any of these back to a literal hex value** in a component or in `@theme`
  — that silently breaks the toggle for that one spot. Applied once at
  `App.tsx` module load (not inside a `useEffect`) so a returning coach
  doesn't see a flash of the default theme before their saved preference
  applies.
- **Site look**: `default` (the palette above) or `ocean` (`#1b4965`
  primary / `#14374d` dark, with lime/cyan/rose/tomato repointed to mint/
  sand/coral/seafoam respectively — same four "accent" roles, different
  hues). Only these two exist right now; the mechanism supports adding
  more `[data-site-theme='…']` blocks later.
- **Stat colors**: `classic` (the red→orange→amber→green stoplight live
  today) or `colorblind` (blue/orange scale — sky blue = good, burnt
  orange = bad — chosen to stay distinguishable for red-green
  colorblindness). Scoped specifically to `src/features/games/
  statButtons.tsx`'s `SR_RATING_COLOR_CLASSES` and `StatButton`'s
  green/red — i.e. the serve-receive/serve 0-3 squares and Kill/Error
  buttons on both Game Day Live and Practice (they already shared this one
  file). Deliberately does **not** touch the separate amber
  warning/conflict banners (sub/libero conflict, GameInsightsTab's
  good/watch panels) or the Tryouts `ScoreTab`'s 0-3 buttons
  (`RosterBuilderTab.tsx`) — different convention, out of scope unless
  asked.

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

Also (added after the list above was written, not yet folded in): `games`,
`gameLineups`, `gameStatEvents` (see "Game Day" below) and `teamSettings`
(see "Settings" below) — same allow-all RLS + realtime pattern as everything
else.

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

## Navigation

`App.tsx` top nav is deliberately small: **🏐 Game Day** (default/home tab —
the day-to-day screen), **🏃 Practice** (see "Practice" below), and
**📊 Player Insights**, plus a **⚙️** gear button that opens `SettingsScreen`.
Roster / Tryouts / Roster Builder used to be
top-level tabs; they're occasional admin/setup work, not what the coach
opens every day, so they're now sub-tabs inside Settings alongside a new
Preferences sub-tab. Each of those three screens is otherwise unchanged —
`SettingsScreen` just renders the existing `RosterScreen`/`TryoutsScreen`/
`RosterBuilderScreen` components under its own sub-nav (`RosterBuilderScreen`
still takes `initialTeam`, threaded through from the logged-in role; the
other two never took team props). `RosterScreen`/`TryoutsScreen` already had
their own `max-w-2xl mx-auto p-4` wrapper internally — don't add a second one
around them in `SettingsScreen` or the layout doubles up.

**Only JV runs Game Day/Practice/Preferences this year** — `GameDayScreen.tsx`,
`PracticeScreen.tsx`, and `TeamPreferencesTab.tsx` each hardcode a
module-level `const team: Team = 'jv'` and have no team-switcher UI anymore
(they did originally — removed on request once it was clear only one team
would use live tracking this season). **Roster Builder and Tryouts still
have their full 4-team switchers** and were deliberately left alone — they
need every team for the tryout pool and the "push down a level"/Varsity
call-up workflows, which only make sense with cross-team visibility. If
another team starts using Game Day/Practice in a future season, reintroduce
a switcher there rather than assuming the whole app should be JV-only again.

## Settings

`src/features/settings/` — per-team coach defaults, meant to remove
re-entering the same choices every game.

- **`teamSettings` table**: one row per `Team`, upserted via
  `fetchTeamSettings`/`saveTeamSettings` (`teamSettings.ts`) —
  `fetchTeamSettings` returns `defaultTeamSettings(team)` (offenseSystem
  `'6-2'`, liberoCount `1`, no call-ups) when no row exists yet, so callers
  never have to null-check.
- **Preferences tab** (`TeamPreferencesTab.tsx` — JV-only, no team switcher;
  see the Navigation section above):
  - **Default offense** (5-1 / 6-2): stored/shown only — nothing currently
    branches on it. The assist auto-crediting (Game Day) is already
    rotation-based, not system-based, so it works the same either way. Flag
    this to the coach if they ask for offense-specific behavior; nothing's
    wired yet.
  - **Liberos you typically run** (1 or 2): pre-fills that many blank
    libero slots when a new game's lineup is first created — see
    `blankLiberoSlots()`/`emptyLineup()` in `GameLineupTab.tsx`.
  - **Default call-ups**: player IDs merged into `rosterPlayerIds` when a
    new game is created (`NewGameForm` in `GameDayScreen.tsx`), alongside
    the team's confirmed `rosterCandidates` — e.g. the 1-5 Varsity players
    who regularly play up, so they don't need re-adding every game. Still
    editable per-game afterward from the Roster tab as before. This same
    union (confirmed roster + default call-ups) is also "the 15" that
    Player Insights' roster grid shows (see that section).
  - **Site look / Stat colors**: device-local theme toggles, not part of
    `teamSettings` (not synced/shared) — see "Runtime-swappable themes"
    under Brand palette above.
  - **Gotcha already hit once, worth knowing**: `GameLineupTab.tsx`'s
    `workingLineup` used to lazily build its initial phantom lineup (and
    therefore its pre-filled libero slots) synchronously at mount, in the
    same `useState` initializer — but `teamSettings` is always still
    `undefined` on that very first render (the fetch is async), so a brand
    new Set 1 would silently get only 1 libero slot regardless of the
    coach's actual setting, every single time. Fixed by starting
    `workingLineup` at `null` and creating the phantom in a `useEffect`
    gated on `teamSettings !== undefined` instead — costs one extra
    "Loading…" beat on first visit to a new lineup, but the pre-fill count
    is then always correct. Don't move that phantom-creation back into a
    `useState` lazy initializer.

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
  court at once (desktop view only — hidden in mobile view, see below). A
  player playing libero this rotation never gets attack buttons (libero
  can't attack) regardless of her tagged position — see `showAttack` in
  `LiveStatsTab.tsx`. Each player's stat buttons are otherwise driven by
  `statRolesForPositions()` (`gameStats.ts`) off their tagged `Position`s,
  unioned if a player has more than one:
  - Hitter (OH/MB/OPP) **or Setter** (S): Attempt / Kill / Error + serve
    receive 0-3 rating. Setters get full attack options now (they attack
    too, e.g. a setter dump) — there's no separate "Set Attempt" button
    anymore (see Assist below). `set_attempt` still exists as a
    `GameStatType` and DB value purely so old games' data reads back
    correctly; no UI writes it anymore.
  - Passer (DS_L): serve receive 0-3 rating only.
  - **Assist — every on-court player except the current back-row setter,
    not role-gated otherwise.** A kill's assist is *assumed*, not tapped,
    by default: `computeAssistCredits()` (`gameStats.ts`) credits any kill
    in a (set, rotation) bucket that nobody explicitly tapped Assist for to
    that rotation's sole back-row Setter (`backRowSetterId()` in
    `effectiveCourt.ts` — only fires when exactly one Setter is back row;
    otherwise no default, coach must tap explicitly). The Assist button is
    for the override case — a dig-and-set, a broken play, a non-setter
    covering — tap the player who actually set it and that kill's credit
    goes to them instead of the default. This means the live tap flow needs
    zero extra taps for the common case (the on-court setter ran the
    offense) and one tap to redirect credit when it wasn't them. The
    back-row setter's own card has no Assist button — she's credited
    automatically, so showing her one would just invite a redundant tap
    (`isBackRowSetter` in `LiveStatsTab.tsx`, computed the same way per
    rotation and passed to both the desktop card and the mobile Assist
    category's row filter). `assist` `gameStatEvent` rows only exist for
    explicit taps — the default case is computed at read time (Insights,
    box score), never written.
  - **Serve** — a 0-3 quality rating (`ServeScoreBar` in `LiveStatsTab.tsx`,
    same red→green convention as serve receive) shown as its own bar at
    the top of the tracking area, above the player cards. Tied to whoever
    occupies Zone 1 (the server) in the *effective* court for the current
    rotation — the coach doesn't pick who's serving, rotation determines
    it. Hidden if Zone 1 is empty (lineup not fully set for this rotation).
  Every tap inserts a `gameStatEvent` row (serve/serve receive store their
  0-3 as `value`, like `SkillScore` taps); a one-tap "Undo last" button
  above the roster undoes the single most recent tap (names what it'll
  undo before you commit), and a "Recent" log below with per-row tap-to-undo
  (hard delete) handles corrections further back — hidden in mobile view
  along with the sub/libero banner, to keep that view pared down. Stat
  counts shown per player are cumulative for the whole set, not just the
  current rotation — `rotation` is stored on each event for later
  analysis, not used to filter the tally.
  - **Two layouts, one component**: `LiveStatsTab.tsx` renders either a
    **desktop/iPad layout** (assumes a bigger screen, no toggle needed) —
    on-court cards in a `grid-cols-2` two-column grid so all 6 fit without
    scrolling, each card laid out left→right as: serve-receive 0-3 buttons
    as a 2x2 square (0/1 over 2/3) pinned to the card's left edge → one
    Assist button in the middle → Attempt/Kill/Error stacked vertically
    (wider than the SR square) on the right — or a **mobile layout**,
    toggled on with the "📱 Mobile view" button (state persisted in
    `localStorage`, keys `vb-stats-mobile-view`/`vb-stats-mobile-category`,
    so it survives a phone reload mid-game). Mobile view picks one of
    three categories (Serve Receive / Attack / Assist, default Serve
    Receive since that's the most common one-handed live-tracking use
    case) and shows only the on-court players that category applies to
    (Assist: everyone), one per row, with large (`min-h-14`+) touch
    targets — everyone else and every other stat block is hidden. Both
    layouts share the same `StatButton`/`SR_RATING_COLOR_CLASSES` building
    blocks (`StatButton` takes a `large` prop for mobile size, `stack` for
    the desktop vertical Attempt/Kill/Error column).
  - **Gotcha already hit once, worth knowing**: `effectiveCourt.ts`
    deliberately never does `Object.keys(zoneMap) as CourtZone[]` — a
    zone map's keys come back as strings ("5") even though `CourtZone` is
    numeric, so comparing a key against a numeric zone list with
    `.includes()`/`===` silently never matches. It iterates a fixed
    `[1,2,3,4,5,6]` array and indexes into the map instead (safe, since
    JS coerces numeric-vs-string keys on property *access*, just not on
    equality checks). Don't reintroduce the `Object.keys` pattern here.
- **Insights tab**: computed client-side from `gameStatEvents`, all in
  `gameStats.ts` — no AI/LLM call, documented in-app as computed. Also
  loads `gameLineups` now (needed for `computeAssistCredits`'s
  back-row-setter lookup). Four sections, in order:
  - ✅/👀 Per-player working-well/worth-a-look flags: `buildPlayerStatLine`/
    `buildInsights` — hitting % ((kills−errors)/attempts), serve-receive
    average, assist volume (credit-adjusted, not raw taps), threshold-based.
    `PlayerGameStatLine.assists` from `buildPlayerStatLine` alone is the
    *raw explicit-tap* count — callers that want the credit-adjusted total
    (GameInsightsTab does) must override it with `computeAssistCredits()`'s
    result, matching by player id.
  - 📈 Trending: `buildPlayerTrends`/`describePlayerTrend` — splits each
    player's *own* chronological taps (by `createdAt`) in half and compares
    early vs. late on whichever metric applies to their role (hitting/SR),
    flagging rising/falling past a fixed delta threshold. This is a
    **within-game** trend only (first half of tonight's taps vs. second
    half) — there's no cross-game history plumbed into this tab, so don't
    read it as a multi-game trajectory. (The old `setting` trend metric —
    set_attempt/assist ratio — still exists in code but won't fire for new
    games since nothing writes `set_attempt` anymore; harmless dead path,
    not removed since it'd still work if that data ever existed.)
  - 🔁 By rotation + a full 6-row breakdown table: `buildRotationOffenseLines`/
    `buildRotationServeReceiveLines`/`buildRotationInsights` — groups the
    same taps by the `rotation` field already stored on every
    `gameStatEvent` instead of by player, and calls out the best/worst
    rotation for hitting% and for serve-receive average (only when there's
    more than one rotation with enough reps to compare). **This is a proxy
    for offensive production, not actual points/rally outcomes** — the app
    doesn't track score, so "which rotation scores more" reads as "which
    rotation's recorded kills/hitting% look best," not a real side-out or
    point-scoring rate off a scoreboard. Worth being explicit about this
    with the coach if it ever comes up — flagged here so it isn't
    mistaken for real point-differential-by-rotation.
  - Box score: shows a hitting line whenever attempts/kills/errors > 0
    (not gated by tagged position — a kill tapped with no matching
    Attempt still shows), an assists line (credit-adjusted) whenever > 0,
    SR and Serve average lines whenever their counts are > 0. Nothing here
    is role-gated anymore, since setters attack and anyone can assist.
  Real LLM-generated insights would need a Supabase Edge Function +
  Anthropic API key (secret can't live in this static site) — a possible
  future upgrade, not built yet; everything above is rule-based.

## Practice

Top-level tab (`src/features/practice/`) — a deliberately lighter sibling of
Game Day for practice-day stat tracking, not a scaled-down copy of the whole
Game/GameLineup/Live/Insights stack. Two tables, `practices` and
`practiceStatEvents`, mirror `games`/`gameStatEvents` structurally but drop
everything rotation-specific:

- **No opponent, no call-up flow**: `NewPracticeForm` (`PracticeScreen.tsx`)
  only asks for a label (defaults to "Practice", editable — e.g. "Scrimmage")
  and a date. `rosterPlayerIds` is seeded from the team's confirmed
  `rosterCandidates` only, same snapshot-at-creation pattern as `games` minus
  the call-up merge — there's no "+ Add a player" search, matching the ask
  that practice shouldn't need pulling in Varsity players.
- **No Lineup tab, no rotation, no libero/subs, no serve tracking**: a
  practice isn't run as a fixed 6-on-court rotation, so there's no zone
  concept to key any of that off of. `PracticeStatEvent` has no `rotation`/
  `setNumber`/`gameId` — just `practiceId`/`playerId`/`statType`/`value`.
  `PracticeStatType` is `GameStatType` minus `set_attempt` and `serve`
  (serve quality needs a Zone-1 server to attribute to; practice has none).
- **`PracticeTrackTab.tsx` mimics the Live tab's card layout on purpose**
  (SR square left / Assist middle / Attack-Kill-Error stacked right, same
  mobile-view toggle with 3 categories, same filled high-contrast buttons)
  but every roster player gets a card at once — no "6 on court" gating,
  since there's no rotation to determine who's "in." `StatButton`/
  `SR_RATINGS`/`SR_RATING_COLOR_CLASSES` were pulled out of `LiveStatsTab.tsx`
  into `games/statButtons.tsx` so both tabs share the same building blocks
  instead of duplicating them.
- **Assist has no auto-credit default here** (unlike Game Day's
  back-row-setter inference) — with no rotation there's no back-row setter
  to infer from, so every Assist tap is always an explicit, direct credit.
  `gameStats.ts`'s `countEvents`/`serveReceiveAverage`/`serveAverage`/
  `buildPlayerStatLine` were relaxed to accept a `MinimalStatEvent` shape
  (`playerId`/`statType`/`value`/`createdAt`, no `gameId`/`setNumber`/
  `rotation`) so `PracticeTrackTab` reuses them as-is; the rotation-aware
  functions (`computeAssistCredits`, `buildRotation*`) stayed
  `GameStatEvent`-only since they're meaningless without a lineup.
- **No dedicated per-practice Insights tab** — not built, since it wasn't
  asked for and the live running counts on every stat button already cover
  the in-the-moment need. Cross-session insights for one player over time
  *are* covered, though — see "Player Insights" below, which now includes
  practice data alongside games with a source filter.

## Player Insights

Top-level tab (`src/features/insights/PlayerInsightsScreen.tsx`) — a
**cross-game (and cross-practice)** view of one player, distinct from Game
Day's `GameInsightsTab` (scoped to a single `gameId`).

- **Default view is a roster grid**, not a search box: a responsive
  `grid-cols-3 sm:grid-cols-5` grid (3-wide on phone, 5x3 on desktop) of
  `PlayerGridCard`s for "the 15" — JV's confirmed `rosterCandidates` union
  Settings → Preferences' `defaultCallUpPlayerIds` (the known Varsity
  push-downs), deduped. Each card does its own small `fetchPlayerAggregate`
  call (all-time, both sources) and shows session count + whichever of
  hit%/SR avg/assists apply — tap a card to open that player's full profile
  (same source-filter + date-range + by-session view as before). A
  "Looking for someone else? Search all players" link below the grid reveals
  the old global `PlayerSearchInput`/`matchesPlayerQuery` search (prefix-
  per-name, not full-name match — "Ellie Thompson" as one string won't
  match, search "Ellie" or "Thompson") for anyone outside that group, e.g. a
  one-off call-up from another team.
- **`src/features/insights/playerAggregate.ts`** — `fetchPlayerAggregate(player,
  playersById, opts?)` holds the actual games+practices+events fetch, the
  per-game `computeAssistCredits` loop, and the combined aggregate line;
  pulled out of the screen so both the grid cards (all-time, both sources,
  no options) and the profile view (opts = `{fromDate, toDate, includeGames,
  includePractices}`) share one implementation instead of drifting apart.
- **Profile view**: pick a **Games + Practice / Games only / Practice only**
  source filter (defaults to combined), then optionally narrow to a date
  range (two plain `<input type="date">`s, filtered against
  `games.date`/`practices.date`; blank on either side = no bound, so no
  range picked = all-time).

- Finds every game **and practice** the player's `rosterPlayerIds` includes
  (across all teams — a Varsity call-up's JV appearances show up here too),
  filters by date, then pulls the matching `gameStatEvents`/`gameLineups`
  and `practiceStatEvents`.
- Reuses the same `gameStats.ts` building blocks as the per-game Insights
  tab (`buildPlayerStatLine`, `buildInsights`) rather than duplicating
  logic — just fed a wider, pre-filtered event set. `buildPlayerStatLine`
  accepts `MinimalStatEvent[]` (see "Practice" below), so game and practice
  events can be concatenated into one array for the combined aggregate line
  without any special-casing.
- **`computeAssistCredits` gotcha**: it buckets by `${setNumber}:${rotation}`
  with no `gameId` in the key, which only makes sense within one game's own
  lineups — passing multiple games' events/lineups into one call would
  collide e.g. Game A's Set 1/Rotation 1 with Game B's. `PlayerInsightsScreen`
  runs it once per game in the range and sums this player's share, rather
  than calling it once across everything. Don't "simplify" that into a
  single combined call. Practice assists have no such crediting layer (no
  rotation to infer from — see "Practice" below), so they're just summed
  as raw explicit taps and added to the game-credited total.
- Shows: aggregate totals + the same good/watch flags as the per-game tab
  (computed off the aggregate line), then a unified **by-session** breakdown
  table (date/type 🏐 or 🏃/opponent-or-label/kills/errors/attempts/hit%/
  assists/SR avg/serve avg) sorted chronologically across both games and
  practices together, so the coach can eyeball a trend across the whole
  season — there's no separate cross-session trend algorithm, unlike the
  within-game early/late split in `GameInsightsTab`.

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
