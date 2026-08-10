# Volleyball Domain Knowledge Brief

**Purpose:** Project context for building the tryouts/roster/lineup app. Ruleset: **NFHS (US high school), 2026-27 rules year.** If you later add club/USAV matches, every rule below needs a `ruleset` flag on the match record — do not assume NFHS applies everywhere.

**Scope discipline:** Sections 1-3 are stable domain facts — encode them as validation logic and schema, not as freeform text fed to a model. Section 5 (AI insights) is explicitly out of scope for the current build. Do not let the data model absorb speculative "AI insights" fields; get rotation/lineup/stat capture right first, generalize later.

**Status as of this writing:** the app currently implements Section 1.2's rotation math (`src/features/tryouts/lineupRotation.ts`) and a starting-6 lineup simulator (`src/features/tryouts/LineupSimulatorTab.tsx`) — confirmed consistent with this brief. `Match`, `Set`, `Substitution`, `StatEvent`, `RotationState`, and `ServeReceiveFormation` (Section 2) have no DB tables yet; `src/types.ts` has placeholder types for some of these (`Lineup`, `StatEvent`) left over from an early scaffold, not wired to any UI — see `CLAUDE.md`'s "Things NOT done" section. Treat this doc as the design reference for when that phase starts, not a description of what's built today.

---

## 1. Rules & Constraints (encode as validation logic, not prose)

### 1.1 Match / set structure
- **Varsity: best of 5 sets.** This is the NFHS core rule.
- **JV and below (freshman, sub-varsity): best of 3 sets** is the common convention, but this is generally set by state association or league policy rather than mandated in the core NFHS rulebook — confirmed as widespread practice, not a single universal NFHS clause. **Model `level` (Varsity/JV/Freshman/etc.) as a field on Match that drives set count, not a hardcoded constant** — some leagues run JV as best-of-5 too, and your own league's policy should be confirmed rather than assumed.
- Sets 1-4 (or 1-2 in a best-of-3 match): rally scoring to 25 points, win by 2, no cap.
- Deciding set (set 5 in a 5-set match, set 3 in a 3-set match): rally scoring to 15 points, win by 2, no cap.
- Rally scoring means either team can score on any rally regardless of who served.

### 1.2 Court positions and rotation
- Six zones, numbered 1-6, counterclockwise: Zone 1 = right back (server position), Zone 2 = right front, Zone 3 = middle front, Zone 4 = left front, Zone 5 = left back, Zone 6 = middle back.
- On side-out (team gains serve), all six players rotate one position clockwise through the zone sequence: 2→1, 3→2, 4→3, 5→4, 6→5, 1→6.
- Zone numbers describe **court location at a moment in time**, not a player's role. Don't conflate "position 3" (a zone) with "middle blocker" (a role) in your schema — a player's zone changes every rotation, their role doesn't.
- Common systems: 5-1 (one setter runs offense every rotation, opposite lines up directly across from setter) and 6-2 (two setters, both hit when in front row). If you want to support lineup templates, model the system as an attribute of a lineup, not a hardcoded constant.
- **Rotational fault / illegal alignment**: a player out of the correct relative order (front-row/back-row overlap violations) at the moment of serve is a fault resulting in loss of rally. If you build a lineup/rotation entry tool, this is the validation rule worth enforcing — front-row players must be positioned "in front of" their corresponding back-row players at serve contact, left-to-right order must hold within a row.

### 1.3 Libero — rule changed for 2026-27, this matters for your data model
- **New for 2026-27 (Rule 6-4-2):** a team may designate **zero, one, or two liberos** per set on the lineup sheet. Only one libero may be on the court at a time.
- The libero replaces a back-row player; libero-for-player replacements are unlimited and are **not** counted against the team's substitution limit — but they must be tracked separately (entry/exit through the libero replacement zone, between the attack line and end line).
- Libero may serve, but only in one position in the serving order per rotation.
- Libero cannot attack the ball above net height on the front row, cannot block, and (with narrow exceptions) cannot set a front-row attacker on an overhand finger set in front of the attack line.
- Injury/disqualification handling (10-4-3a, 10-4-3d): if a libero is injured, they may be replaced by the player they originally replaced or by the second designated libero, or the team may re-designate a new libero. If a libero is disqualified and a second libero was designated, the team continues with one libero (the second) rather than defaulting to zero.
- **Design implication:** your roster/lineup schema needs a per-set libero designation that supports 0, 1, or 2 designated liberos, with a separate "currently in libero role" pointer distinct from "designated libero" — those are not the same field. (Note: the current unused `Lineup` type in `src/types.ts` only has a single `liberoPlayerId`/`liberoReplacesPlayerId` pair — will need to change when this phase is built.)

### 1.4 Substitutions
- 18 substitutions per team per set (not per match — resets each set).
- Libero replacements do not count toward this limit and are tracked on a separate log.
- Scorer/second referee tracks and announces the 15th-18th substitution to the head coach as a warning that the limit is near.

### 1.5 Other current-rules-year items worth knowing (2026-27 changes)
- A non-playing teammate (bench player) entering the court while the ball is in play is now scored as illegal alignment (loss of rally/point) rather than only a conduct issue — relevant if you ever track live substitution timing errors.
- Servers may not raise hands above their head during service until the ball crosses the net (screening-adjacent rule) — not something you'd model in software, but worth knowing if you build any "was this a legal serve" logic.
- Second-referee timing cue between sets moved from 2:45 to 2:30 — irrelevant to your data model, flagged only so you don't rely on stale timing references from older scoring handbooks.

### 1.6 Where this ruleset diverges from club/USAV (flag, don't assume)
NFHS and USAV/FIVB differ meaningfully on libero mechanics, substitution counts, timeout counts, and in some cases scoring format for non-varsity or exhibition formats. If any of your input data will come from club play, do not reuse the NFHS validation rules unmodified — you will silently mis-validate legal club lineups. This is a decision point for you, not something resolved by picking NFHS as the default.

### 1.7 Serve-receive groupings (coach-supplied tactical knowledge, not an NFHS rule)

This is not a rulebook constraint — it's a tactical convention, and it belongs in the simulation/lineup-planning logic, not the rules-validation layer. Encode it as a distinct concept from Section 1.2's rotation-fault validation.

**The mechanic, generalized beyond a single example:**

- Of the 6 players on court, the player currently functioning as the setter for that rotation (call this the **acting setter** — see note below on 6-2) is, by convention, excluded from serve receive so they're free to release to the net immediately.
- **Zone pairing for the "push":** each back-row zone has a front-row zone directly ahead of it — 1↔2, 6↔3, 5↔4. When the acting setter occupies a back-row zone, the front-row player in the paired zone is a natural candidate to be excluded too ("pushed up"). The same pairing logic extends to when the setter is in zone 6 (push zone 3) or zone 5 (push zone 4).
- Beyond that structural pairing, a coach can independently designate **any** on-court player as the excluded "weakest passer" for a given rotation, regardless of whether they're the setter's paired front-row player. Where they end up depends on their row: **front-row → stays up near the net** (they're hitting anyway), **back-row → pushes back to the deep line** (hidden behind the other receivers).
- Net result: of 6 players, 1 is excluded as acting setter, 1 more is excluded as the designated weak passer/push target, leaving **3 players in the serve-receive formation**. (Some systems run 4-person serve receive instead of 3 — make the receiver count configurable, not fixed at 3.)

**Note on "acting setter" in a 6-2:** in a 6-2, two setters sit opposite each other in the rotation order, so exactly one is back-row (and sets) while the other is front-row (and hits) for any given rotation — the front-row setter that rotation is *not* the acting setter and does not get the automatic exclusion. Key it off who is actually setting *this rotation*, which flips between the two setters every three rotations. In a 5-1, there's only one setter, so "acting setter" is trivially that player regardless of row.

**What to build for simulation:** a `ServeReceiveFormation` computed per rotation (see `RotationState` in Section 2) that takes the current zone assignment + system (5-1/6-2) + optional coach override for "weak passer," and outputs which 3 (or N) players are receiving and where the excluded players end up (net/deep). The zone-pairing push is a reasonable rule-based default; the "who's the weakest passer" input is a coach judgment and should be an editable override per player per rotation, not inferred by the system — see Section 4, this is explicitly interpretive.

**A rotation does not reduce to one canonical formation — there are typically at least 2, often 3, legal/sensible serve-receive configurations for any given rotation.** The structural rule (acting setter excluded + zone-paired front-row player pushed) produces *one* candidate, not *the* candidate. Build this as "enumerate the set of valid formation candidates per rotation, one of which is the structural default, and let the coach select or compare among them" — not "compute the one correct formation per rotation." Working hypothesis for what generates the other candidates (flagged as an assumption, not confirmed): (a) the structural-default formation (setter + zone-paired player excluded, 3 receivers), (b) a 4-person variant (only the acting setter excluded, everyone else receives), and (c) a coach-override variant (structural push relaxed, a different/specific weak passer excluded instead). Confirm before encoding as schema fact.

---

## 2. Data Model Requirements (entities and relationships — not a full schema)

Structure future work around these entities so the tryout build doesn't foreclose the roster/lineup/analytics phase later:

- **Player** — roster member; attributes: name, jersey number, primary position/role (S, OH, MB, OPP, L, DS), class year, contact info (minor — see access-control note below). *(Exists today as `Player` in `src/types.ts` / `players` table.)*
- **Team** — your team; holds a roster (set of Players with effective date ranges, since roster membership can change tryout-to-season). *(Today: `Team` is a union type — varsity/jv/freshman/level3 — not its own entity with roster history.)*
- **Opponent / OpponentTeam** — lightweight; you likely won't have full rosters for opponents, so don't force this to have the same shape as Team. *(Not modeled yet.)*
- **Match** — date, opponent, ruleset flag (NFHS/USAV/etc.), **level (Varsity/JV/Freshman — drives set count and cap, see 1.1)**, venue, match result. *(Not modeled yet — `Session` with `type: 'game'` exists but is a single day marker, not a Match/Set structure.)*
- **Set** — belongs to a Match; set number (1-5 for varsity, 1-3 for JV/sub-varsity), final score both sides, winner. *(Not modeled yet.)*
- **Lineup** — belongs to a Set; the starting six players mapped to zones 1-6 at first serve, plus the designated libero(s) for that set (0, 1, or 2). *(A `Lineup` type exists in `src/types.ts` tied to `gameId`/`setNumber` but has no DB table/UI — distinct from the current `SavedLineup`/lineup-simulator feature, which is an evaluation scratchpad, not a live-game record.)*
- **RotationState** — optional but valuable: a snapshot of which player occupies which zone at a given point in the set (needed if you want to reconstruct "who was on the court when X happened" for analytics later). This is the field most tryout-scoped apps skip and then regret when they try to add analytics. *(Not modeled yet.)*
- **ServeReceiveFormation** — **one of several candidates** belonging to a RotationState, not a single derived value (see Section 1.7 — a rotation typically has 2-3 valid formations, not one canonical one). Each candidate's fields: acting setter (player, excluded automatically, always), designated push/weak-passer (player, optional, excluded with a reason — `STRUCTURAL_PUSH` derived from zone pairing, or `COACH_OVERRIDE` for a manual weak-passer call), resulting receivers (ordered list, count configurable — 3 or 4), each excluded player's landing spot (`STAYS_UP` if front row, `PUSHES_BACK` if back row), and an `is_structural_default` flag marking the logically-derived baseline candidate versus coach-entered alternates. This is planning/simulation data, not a record of what actually happened in a match — keep it distinct from RotationState's "what was live on court" purpose, even though it's derived from the same zone assignment. The UI/simulation should let the coach generate and compare the candidate set per rotation, not just view one. *(Not modeled yet.)*
- **Substitution** — event: set, time/rally marker, player out, player in, substitution count-toward-limit flag (false for libero replacements). *(Not modeled yet.)*
- **StatEvent** — belongs to a rally/set; player, event type (kill, error, ace, dig, assist, block, service error, reception error), outcome. This is the atomic unit any future "AI insights" feature will need — the granularity you choose here (rally-level vs. set-level aggregate) determines what's analyzable later. Rally-level costs more to capture (manual entry burden during a live match) but is the only level that supports rotation-specific or matchup-specific insight later. Decide this trade-off deliberately, not by default. *(A `StatEvent` type exists in `src/types.ts` — leftover scaffold, no DB table, not wired to any UI.)*
- **TryoutEvaluation** (tryout-specific, separate from in-season stats) — player, evaluator, date, skill ratings, notes. Keep this a distinct entity from StatEvent — tryout scoring is subjective evaluation, not match statistics, and conflating them will make both harder to query later. *(Exists today as `SkillScore`/`skillScores` table — already separate from any live-match stat concept, consistent with this guidance.)*

**Access control note:** rosters involve minors. Decide early who can see what (coaches vs. players vs. parents), since retrofitting auth scoping onto an existing schema is more painful than designing it in from the start. Not a compliance lecture — just flagging it as a design constraint to nail down before extending the auth layer. *(Today's auth is a single shared-password app gate per role, not per-user — see "Auth" in `CLAUDE.md`. Fine for internal coach use; would need real accounts before opening access to players/parents.)*

---

## 3. Terminology Glossary

| Term | Meaning |
|---|---|
| Zone / Position (1-6) | Court location, rotates clockwise on side-out. Not the same as player role. |
| S | Setter |
| OH | Outside hitter |
| MB | Middle blocker |
| OPP | Opposite hitter (right-side) |
| L | Libero (back-row defensive specialist, restricted role, cannot attack/block per above) |
| DS | Defensive specialist (not a libero — no restrictions, but also no unlimited free substitution) |
| Side-out | Winning a rally while receiving serve, which earns your team the serve and triggers a rotation |
| Kill | Attack that is not returnable and ends the rally in the attacker's favor |
| Dig | Successful defensive play on an opponent's attack, keeping the ball in play |
| Ace | Serve that scores directly, untouched or unreturnable by the receiving team |
| Assist | Set that directly leads to a kill |
| Hitting % (efficiency) | (Kills − Errors) / Total Attack Attempts |
| Side-out % | Rate of winning the rally when receiving serve (numerator/denominator convention varies by program — confirm before hardcoding a formula) |
| 5-1 / 6-2 | Offensive system naming, based on number of setters used |
| Acting setter | Whichever player is setting for the current rotation. Fixed player in a 5-1; alternates between two setters every 3 rotations in a 6-2 (see 1.7). |
| Push up | Excluding a front-row player from serve receive, leaving them near the net since they'll be attacking anyway |
| Push back | Excluding a back-row player from serve receive by dropping them to the deep back line, hidden behind the active receivers |
| Serve-receive formation | The subset of on-court players (commonly 3, sometimes 4) designated to receive serve in a given rotation; see 1.7 |

---

## 4. Predictable vs. Interpretive (what to encode as rules vs. leave to a human/AI layer)

**Predictable — encode as deterministic validation logic:**
Legal rotation order, libero eligibility and replacement mechanics, substitution count limits, scoring/set-win conditions, position eligibility to attack/block (libero restrictions), the acting-setter identity per rotation, and the structural zone-pairing "push" default for serve-receive formations (Section 1.7) — this last one is a computable default, not a rule enforced by officials, so treat it as a suggestion the coach can override, not a hard constraint.

**Interpretive — do not hardcode; this is the future AI-insights layer's job, and it should consume StatEvent/RotationState data, not modify how the rules layer works:**
Which lineup is "best" against a given opponent, opponent tendencies (e.g., "they always run a slide out of rotation 4"), momentum/hot-hand judgments, which substitution pattern is working, subjective tryout evaluation scores, and **who counts as the "weakest passer" in a given rotation for serve-receive planning** — that's a coach call to enter and override, never inferred by the app. Keep this logic entirely separate from the rules engine — mixing "the rules say X" with "the coach thinks Y" in the same code path is the fastest way to end up with an app that enforces someone's opinion as if it were a rule.

---

## 5. Open Questions / Decisions Needed (coach's call, not pre-resolved here)

1. NFHS-only, or will club/USAV data ever flow into this app? (Determines whether `ruleset` needs to be a first-class field now or can be added later.)
2. Stat-capture granularity: rally-by-rally (supports future rotation/matchup analytics, higher live-entry burden) vs. set-level aggregates only (cheap to enter, forecloses granular analytics later)?
3. Who has access to tryout evaluations and roster data — coaches only, or also players/parents? Any players under 13 (COPPA-relevant) or is this strictly high-school-age (typically 14-18, FERPA/state-student-privacy-law relevant instead)?
4. Is the AI-insights phase meant to analyze your own team only, or opponent scouting too? (Changes how much opponent-side data structure you need now vs. later.)
5. Does your league run JV as best-of-3, or does it follow varsity's best-of-5? Confirm against your specific league/state policy rather than the general convention noted in 1.1.
6. ~~For serve-receive formations (1.7): is the "push" always a coach's skill-based call, or a separate structural rule?~~ **Resolved — structural default is logically computable.**
7. For serve-receive formations: confirm what actually generates the 2nd/3rd valid configuration per rotation — is it (a) a 3-vs-4-receiver toggle, (b) alternate choice of which player gets the optional "extra" exclusion, (c) both, or (d) something else entirely? Section 1.7 currently documents a best-guess hypothesis, flagged explicitly as unconfirmed.

---

## Sources

- [NFHS — Libero Rules Adjusted in High School Volleyball (Feb 5, 2026)](https://nfhs.org/stories/libero-rules-adjusted-in-high-school-volleyball)
- [TSSAA — 2026 NFHS Volleyball Rules Changes](https://tssaa.org/2026-nfhs-volleyball-rules-changes)
- [NFHS — Volleyball Points of Emphasis 2025-26](https://nfhs.org/resources/sports/volleyball-points-of-emphasis-2025-26)
- [Allowing the Libero to Serve — NFHS Rule 6-4-2e and 10-4-5 (PDF)](https://cdn1.sportngin.com/attachments/document/0080/2063/NFHS_Volleyball_Rule_-_Allowing_the_Libero_to_serve.pdf)
- [Scoring Handbook for NFHS Volleyball Matches (Wildfire Sports / VolleyWrite, PDF)](https://volleywrite.com/wp-content/uploads/2020/08/NFHS-Paper-Scoring-Handbook.pdf)
- [Rotate123 — Volleyball Court Positions Explained](https://www.rotate123.com/volleyball-court-positions)
- [Rotate123 — Volleyball Rotations Explained](https://www.rotate123.com/volleyball-positions-and-rotations.html)
- [SoloStats — Volleyball Stat Glossary: Definitions, Abbreviations & Formulas](https://www.solostatslive.com/definitions/volleyball-stat-glossary)
- [Volleyball Substitution Rules Explained (FIVB, USAV, NFHS, NCAA) — VolleyRef.App](https://volleyref.app/volleyball-substitution-rules.html)
- [NCVA — Summary Comparison: NCAA/USA Volleyball/NFHS Rule Differences (PDF)](https://ncva.com/downloads/Referee%20Rules%20Comparisons%20NCAA-NFHS-USAV.pdf)

*Note: the NCAA/USAV/NFHS comparison PDF above is dated 2021 — treat it as directional for club-vs-NFHS differences, not authoritative for the current rules year. If club data is ever in scope (see Open Question 1), get a current USAV rulebook comparison before encoding those rules.*
