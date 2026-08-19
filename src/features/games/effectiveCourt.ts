import type { CourtZone, GameLineup, LiberoAssignment, Player } from '../../types';
import { zoneAssignmentsForRotation } from '../tryouts/lineupRotation';

// Fixed zone list to iterate over — deliberately not Object.keys() on a zone
// map. JSON round-trips (and JS objects generally) always come back with
// string keys ("5"), so comparing those against this numeric CourtZone list
// with .includes()/=== would silently never match. Iterating this array and
// indexing into the map (JS coerces numeric-vs-string keys on property
// access) sidesteps that trap everywhere below.
const ALL_ZONES: CourtZone[] = [1, 2, 3, 4, 5, 6];
export const BACK_ROW_ZONES: CourtZone[] = [1, 5, 6];
const ALL_ROTATIONS = [1, 2, 3, 4, 5, 6] as const;
type Rotation = (typeof ALL_ROTATIONS)[number];

function mechanicalZones(
  zoneAssignments: Partial<Record<CourtZone, string>>,
  rotation: Rotation,
): Partial<Record<CourtZone, string>> {
  return rotation === 1 ? zoneAssignments : zoneAssignmentsForRotation(zoneAssignments, rotation);
}

export interface ActiveLibero {
  liberoAssignmentId: string;
  liberoPlayerId: string;
  zone: CourtZone;
  shadowedPlayerId: string; // which of the assignment's shadowed players this zone belongs to right now
  serving: boolean;
}

export interface EffectiveCourt {
  // Final zone -> playerId after planned subs and libero swaps are
  // layered on top of the raw Rotation-1 lineup's mechanical rotation.
  zoneAssignments: Partial<Record<CourtZone, string>>;
  // Which subs (from lineup.subs) are actually in effect at this rotation.
  activeSubs: GameLineup['subs'];
  liberosOnCourt: ActiveLibero[];
  // True if 2 different liberos would both be on court this rotation —
  // NFHS allows only one at a time. Flagged, not blocked.
  liberoConflict: boolean;
}

// Layers, in order:
//   1. Mechanical rotation of the raw Rotation-1 starting six.
//   2. Planned subs (cumulative, ascending effectiveRotation, chained —
//      e.g. a later sub can bring the original starter back in).
//   3. Libero swaps — each tracks its shadowed starters' ORIGINAL slots
//      (from the raw, un-substituted Rotation-1 map) and takes over
//      whichever of those slots is back row, regardless of what a
//      planned sub did to that zone. This matches how the libero rule
//      actually works: she shadows specific teammates' rotational
//      positions, not "whoever's sub'd in."
export function computeEffectiveCourt(
  lineup: Pick<GameLineup, 'zoneAssignments' | 'subs' | 'liberos'>,
  rotation: Rotation,
): EffectiveCourt {
  const base = mechanicalZones(lineup.zoneAssignments, rotation);
  const zones: Partial<Record<CourtZone, string>> = { ...base };

  const activeSubs = [...(lineup.subs ?? [])]
    .filter((s) => s.effectiveRotation <= rotation)
    .sort((a, b) => a.effectiveRotation - b.effectiveRotation);
  for (const sub of activeSubs) {
    for (const zone of ALL_ZONES) {
      if (zones[zone] === sub.outPlayerId) zones[zone] = sub.inPlayerId;
    }
  }

  const liberosOnCourt: ActiveLibero[] = [];
  for (const assignment of lineup.liberos ?? []) {
    if (!assignment.liberoPlayerId || assignment.shadowedPlayerIds.length === 0) continue;
    const servesFor = assignment.servesForPlayerId ?? assignment.shadowedPlayerIds[0];
    // A libero shadows 1-2 teammates; structurally at most one of them is
    // ever back row at the same time (they're offset in the rotation
    // order), but scan in a fixed order and take the first match either way.
    for (const zone of ALL_ZONES) {
      if (!BACK_ROW_ZONES.includes(zone)) continue;
      const shadowedOccupant = base[zone];
      if (shadowedOccupant && assignment.shadowedPlayerIds.includes(shadowedOccupant)) {
        zones[zone] = assignment.liberoPlayerId;
        liberosOnCourt.push({
          liberoAssignmentId: assignment.id,
          liberoPlayerId: assignment.liberoPlayerId,
          zone,
          shadowedPlayerId: shadowedOccupant,
          serving: zone === 1 && shadowedOccupant === servesFor,
        });
        break;
      }
    }
  }

  const liberoConflict = new Set(liberosOnCourt.map((l) => l.liberoPlayerId)).size > 1;

  return { zoneAssignments: zones, activeSubs, liberosOnCourt, liberoConflict };
}

export interface LiberoRotationStop {
  rotation: Rotation;
  zone: CourtZone;
  shadowedPlayerId: string;
  serving: boolean;
}

// Where a libero assignment's shadowed teammates fall across all 6
// rotations, based on the raw (un-substituted) Rotation-1 map — used to
// show the coach the full plan ("in for MB1 at Rotations 1,2,3 — in for
// MB2 at Rotations 4,5,6 — serves at Rotation 2") rather than just the
// currently-viewed rotation.
export function liberoRotationPlan(
  zoneAssignments: Partial<Record<CourtZone, string>>,
  assignment: Pick<LiberoAssignment, 'shadowedPlayerIds' | 'servesForPlayerId'>,
): LiberoRotationStop[] {
  const servesFor = assignment.servesForPlayerId ?? assignment.shadowedPlayerIds[0];
  return ALL_ROTATIONS.flatMap((rotation) => {
    const zones = mechanicalZones(zoneAssignments, rotation);
    for (const zone of ALL_ZONES) {
      if (!BACK_ROW_ZONES.includes(zone)) continue;
      const occupant = zones[zone];
      if (occupant && assignment.shadowedPlayerIds.includes(occupant)) {
        return [{ rotation, zone, shadowedPlayerId: occupant, serving: zone === 1 && occupant === servesFor }];
      }
    }
    return [];
  });
}

// Which on-court player is "the" back-row setter this rotation — the
// default assumption for who set a hitter's swing when the coach hasn't
// explicitly tapped someone else's Assist button (see gameStats.ts
// computeAssistCredits). Only returns a player when exactly one Setter is
// back row; if none or more than one qualify, there's no safe default and
// the coach must attribute assists explicitly for that rotation.
export function backRowSetterId(
  effectiveZones: Partial<Record<CourtZone, string>>,
  playersById: Map<string, Player>,
): string | undefined {
  const candidates = BACK_ROW_ZONES.map((z) => effectiveZones[z])
    .filter((id): id is string => !!id)
    .filter((id) => playersById.get(id)?.positions.includes('S'));
  return candidates.length === 1 ? candidates[0] : undefined;
}
