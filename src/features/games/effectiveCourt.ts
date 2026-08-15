import type { CourtZone, GameLineup } from '../../types';
import { zoneAssignmentsForRotation } from '../tryouts/lineupRotation';

// Fixed zone list to iterate over — deliberately not Object.keys() on a zone
// map. JSON round-trips (and JS objects generally) always come back with
// string keys ("5"), so comparing those against this numeric CourtZone list
// with .includes()/=== would silently never match. Iterating this array and
// indexing into the map (JS coerces numeric-vs-string keys on property
// access) sidesteps that trap everywhere below.
const ALL_ZONES: CourtZone[] = [1, 2, 3, 4, 5, 6];
const BACK_ROW_ZONES: CourtZone[] = [1, 5, 6];
const ALL_ROTATIONS = [1, 2, 3, 4, 5, 6] as const;
type Rotation = (typeof ALL_ROTATIONS)[number];

function mechanicalZones(
  zoneAssignments: Partial<Record<CourtZone, string>>,
  rotation: Rotation,
): Partial<Record<CourtZone, string>> {
  return rotation === 1 ? zoneAssignments : zoneAssignmentsForRotation(zoneAssignments, rotation);
}

function findZoneOf(zones: Partial<Record<CourtZone, string>>, playerId: string): CourtZone | undefined {
  return ALL_ZONES.find((zone) => zones[zone] === playerId);
}

export interface EffectiveCourt {
  // Final zone -> playerId after planned subs and the libero swap are
  // layered on top of the raw Rotation-1 lineup's mechanical rotation.
  zoneAssignments: Partial<Record<CourtZone, string>>;
  // Which subs (from lineup.subs) are actually in effect at this rotation.
  activeSubs: GameLineup['subs'];
  liberoZone?: CourtZone; // where the libero is currently lined up, if at all
  liberoServing: boolean; // true when the libero occupies Zone 1 (the server spot)
}

// Layers, in order:
//   1. Mechanical rotation of the raw Rotation-1 starting six.
//   2. Planned subs (cumulative, ascending effectiveRotation, chained —
//      e.g. a later sub can bring the original starter back in).
//   3. Libero swap — tracks the ORIGINAL starter's slot (from the raw,
//      un-substituted Rotation-1 map) and takes over that zone whenever
//      it's back row, regardless of what a planned sub did to that zone.
//      This matches how the libero rule actually works: she shadows a
//      specific teammate's rotational position, not "whoever's sub'd in."
export function computeEffectiveCourt(
  lineup: Pick<GameLineup, 'zoneAssignments' | 'subs' | 'liberoPlayerId' | 'liberoForPlayerId'>,
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

  let liberoZone: CourtZone | undefined;
  if (lineup.liberoPlayerId && lineup.liberoForPlayerId) {
    const targetZone = findZoneOf(base, lineup.liberoForPlayerId);
    if (targetZone && BACK_ROW_ZONES.includes(targetZone)) {
      zones[targetZone] = lineup.liberoPlayerId;
      liberoZone = targetZone;
    }
  }

  return { zoneAssignments: zones, activeSubs, liberoZone, liberoServing: liberoZone === 1 };
}

export interface LiberoRotationStop {
  rotation: Rotation;
  zone: CourtZone;
  backRow: boolean;
}

// Where the libero's shadowed teammate falls across all 6 rotations, based
// on the raw (un-substituted) Rotation-1 map — used to show the coach the
// full plan ("in for Olivia at Rotations 2, 5, 6 — serves at Rotation 6")
// rather than just the currently-viewed rotation. A player only visits
// each zone once per full cycle, so if the libero shadows a single
// teammate she naturally serves at most once per cycle — whichever back-
// row stop lands in Zone 1 (the NFHS "only one position in the serving
// order" constraint falls out of this automatically, it isn't a separate
// rule to enforce).
export function liberoRotationPlan(
  zoneAssignments: Partial<Record<CourtZone, string>>,
  liberoForPlayerId: string,
): LiberoRotationStop[] {
  return ALL_ROTATIONS.flatMap((rotation) => {
    const zones = mechanicalZones(zoneAssignments, rotation);
    const zone = findZoneOf(zones, liberoForPlayerId);
    if (!zone) return [];
    return [{ rotation, zone, backRow: BACK_ROW_ZONES.includes(zone) }];
  });
}
