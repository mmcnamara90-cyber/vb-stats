import type { CourtZone } from '../../types';

export const COURT_ZONES: CourtZone[] = [1, 2, 3, 4, 5, 6];

// Per the coach's court sketch — front row (at the net) is zones 4, 3, 2
// left-to-right; back row is zones 5, 6, 1 left-to-right:
//
//         NET
//   [4]  [3]  [2]
//   [5]  [6]  [1]
//
// Standard volleyball rule: when a team wins the serve back, everyone
// rotates clockwise one spot — the player in zone 2 moves to zone 1, zone 1
// moves to zone 6, zone 6 to zone 5, zone 5 to zone 4, zone 4 to zone 3, and
// zone 3 to zone 2. So each player's zone number decreases by one, wrapping
// 1 -> 6.
function nextZoneClockwise(zone: CourtZone): CourtZone {
  return zone === 6 ? 1 : ((zone + 1) as CourtZone);
}

// Rotation `k`'s zone `z` holds whoever was in rotation-1's zone reached by
// applying nextZoneClockwise (k-1) times to `z` — i.e. "who ends up here
// after k-1 rotations forward" is found by looking (k-1) steps further
// around the clockwise cycle from `z`.
export function zoneAssignmentsForRotation(
  rotation1: Partial<Record<CourtZone, string>>,
  rotationNumber: 1 | 2 | 3 | 4 | 5 | 6,
): Partial<Record<CourtZone, string>> {
  const steps = rotationNumber - 1;
  const result: Partial<Record<CourtZone, string>> = {};
  for (const zone of COURT_ZONES) {
    let source: CourtZone = zone;
    for (let i = 0; i < steps; i++) source = nextZoneClockwise(source);
    const playerId = rotation1[source];
    if (playerId) result[zone] = playerId;
  }
  return result;
}
