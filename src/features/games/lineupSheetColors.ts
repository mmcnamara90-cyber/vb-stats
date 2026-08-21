import type { CourtZone, GameLineup, Player } from '../../types';

// Color-codes the Lineup Sheet (GameLineupSheetTab.tsx) by ROTATIONAL
// PARTNERSHIP, not by raw zone number or by player identity alone.
//
// The volleyball fact this leans on: two players who start 3 zones apart
// (1&4, 2&5, 3&6) stay exactly 3 zones apart at every rotation, since the
// mechanical rotation shifts every player by the same amount each time —
// so they always occupy *some* pair of opposite zones together, just not
// the same raw zone-pair every rotation. In a standard lineup this
// partnership lines up with real roles: Setter↔Opposite, the two
// Middles (and whichever Libero is covering one of them), and the two
// Outsides (or Outside↔DS). Getting this right took two corrections from
// the coach: first pass colored per-player (wrong — a player's zone, and
// so her color, changes every rotation); second pass colored by literal
// zone number staying fixed (also wrong — the raw zone-pair a given
// partnership occupies shifts rotation to rotation, e.g. the Rotation-1
// {1,4} pair is at {3,6} by Rotation 2). What's actually constant is the
// *pairing between two specific players*, derived once from Rotation 1.
export const PAIR_GROUP_COLOR_CLASSES = [
  'text-blue-700 bg-blue-50 border-blue-300',
  'text-rose-700 bg-rose-50 border-rose-300',
  'text-emerald-700 bg-emerald-50 border-emerald-300',
] as const;

const ROTATION_1_ZONE_PAIRS: [CourtZone, CourtZone][] = [
  [1, 4],
  [2, 5],
  [3, 6],
];

// playerId -> which of the 3 rotational-partner pairs she belongs to,
// derived once from this set's raw Rotation 1 zoneAssignments. Subs
// inherit the group of whoever they replaced (they're stepping into that
// same rotational slot); each libero inherits the group of the starter
// she's shadowing (servesForPlayerId, or the first shadowed player if
// unset — same default `computeEffectiveCourt` uses), since she's
// covering that player's slot, not adding a new one.
export function computeRotationPairGroups(lineup: GameLineup): Map<string, number> {
  const groups = new Map<string, number>();

  ROTATION_1_ZONE_PAIRS.forEach(([zoneA, zoneB], groupIndex) => {
    const a = lineup.zoneAssignments[zoneA];
    const b = lineup.zoneAssignments[zoneB];
    if (a) groups.set(a, groupIndex);
    if (b) groups.set(b, groupIndex);
  });

  for (const sub of lineup.subs) {
    const group = groups.get(sub.outPlayerId);
    if (group !== undefined) groups.set(sub.inPlayerId, group);
  }

  for (const libero of lineup.liberos) {
    if (!libero.liberoPlayerId) continue;
    const shadowedId = libero.servesForPlayerId ?? libero.shadowedPlayerIds[0];
    const group = shadowedId ? groups.get(shadowedId) : undefined;
    if (group !== undefined) groups.set(libero.liberoPlayerId, group);
  }

  return groups;
}

const FALLBACK_COLOR_CLASS = 'text-gray-700 bg-gray-50 border-gray-300';

export function pairGroupColorClass(playerId: string, groups: Map<string, number>): string {
  const group = groups.get(playerId);
  return group === undefined ? FALLBACK_COLOR_CLASS : PAIR_GROUP_COLOR_CLASSES[group];
}

// First names of the two Rotation-1 starters in each of the 3 partner
// groups (not subs/libero — just the "core" pairing identity), for a
// legend the coach can check against — e.g. "Kenley & Natalie" — so the
// color-coding is self-explanatory instead of an unexplained pattern.
export function rotationPairLabels(lineup: GameLineup, playersById: Map<string, Player>): string[][] {
  return ROTATION_1_ZONE_PAIRS.map(([zoneA, zoneB]) =>
    [lineup.zoneAssignments[zoneA], lineup.zoneAssignments[zoneB]]
      .filter((id): id is string => !!id)
      .map((id) => playersById.get(id)?.firstName ?? '?')
  );
}
