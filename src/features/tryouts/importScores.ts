import type { Player, Skill, SkillScore, TryoutDrill } from '../../types';

// ===== Column mapping =====

export type ScoreColumnMapping =
  | { kind: 'ignore' }
  | { kind: 'drill'; drillId: string }
  | { kind: 'newDrill'; name: string; skill: Skill };

// Header guess for the name column — used to pre-select a default in the UI,
// never trusted blindly (coach still confirms/changes it).
export function guessNameColumn(headers: string[]): string | undefined {
  return headers.find((h) => /player|name/i.test(h) && !/last/i.test(h));
}

export function guessLastNameColumn(headers: string[]): string | undefined {
  return headers.find((h) => /last/i.test(h));
}

// Rows SoloStats (and similar tools) tack on that aren't real players.
function isJunkNameValue(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === '' || n === 'total' || n === 'totals';
}

// ===== Player name matching =====
// Matching key is first name (per coach: SoloStats exports first-name-only).
// A mapped last-name column narrows ambiguous matches automatically;
// otherwise ambiguous/no-match rows are left for the coach to resolve by hand.

export type NameMatchStatus = 'auto' | 'ambiguous' | 'none';

export interface NameMatchResult {
  rawName: string;
  firstNameKey: string;
  status: NameMatchStatus;
  candidates: Player[]; // all first-name matches, for the manual picker
  matchedPlayerId: string | undefined; // auto-resolved (or manually chosen later) player
}

function firstToken(value: string): string {
  return value.trim().split(/\s+/)[0] ?? '';
}

export function matchPlayerByName(
  rawName: string,
  rawLastName: string | undefined,
  players: Player[],
): NameMatchResult {
  const firstNameKey = firstToken(rawName).toLowerCase();
  let candidates = players.filter((p) => p.firstName.toLowerCase() === firstNameKey);

  if (candidates.length > 1 && rawLastName?.trim()) {
    const lastKey = rawLastName.trim().toLowerCase();
    const narrowed = candidates.filter((p) => p.lastName.toLowerCase() === lastKey);
    if (narrowed.length > 0) candidates = narrowed;
  }

  const status: NameMatchStatus = candidates.length === 1 ? 'auto' : candidates.length === 0 ? 'none' : 'ambiguous';
  return {
    rawName,
    firstNameKey,
    status,
    candidates,
    matchedPlayerId: status === 'auto' ? candidates[0].id : undefined,
  };
}

// ===== Rows -> matches =====

export interface ScoreImportRow {
  index: number; // original CSV row index, for stable keys
  raw: Record<string, string>;
  nameMatch: NameMatchResult;
}

export function buildScoreImportRows(
  records: Record<string, string>[],
  nameColumn: string,
  lastNameColumn: string | undefined,
  players: Player[],
): ScoreImportRow[] {
  const rows: ScoreImportRow[] = [];
  records.forEach((raw, index) => {
    const rawName = raw[nameColumn] ?? '';
    if (isJunkNameValue(rawName)) return;
    const rawLastName = lastNameColumn ? raw[lastNameColumn] : undefined;
    rows.push({ index, raw, nameMatch: matchPlayerByName(rawName, rawLastName, players) });
  });
  return rows;
}

// ===== Building SkillScore rows to insert =====

export interface ColumnMappingEntry {
  column: string;
  mapping: ScoreColumnMapping;
}

export interface PendingNewDrill {
  column: string;
  name: string;
  skill: Skill;
}

// Columns mapped to `{ kind: 'newDrill' }` need a real TryoutDrill row
// created first — this collects the distinct ones to create.
export function collectNewDrills(columnMappings: ColumnMappingEntry[]): PendingNewDrill[] {
  return columnMappings
    .filter((c): c is { column: string; mapping: { kind: 'newDrill'; name: string; skill: Skill } } =>
      c.mapping.kind === 'newDrill',
    )
    .map((c) => ({ column: c.column, name: c.mapping.name, skill: c.mapping.skill }));
}

function parseScoreValue(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

// Builds the final SkillScore[] to insert: one per (matched player) x
// (mapped column with a parseable numeric value). `drillIdByColumn` resolves
// both existing-drill mappings and newly-created drills (post-insert ids).
export function buildScoreRows(
  rows: ScoreImportRow[],
  columnMappings: ColumnMappingEntry[],
  drillIdByColumn: Map<string, string>,
  drillsById: Map<string, TryoutDrill>,
  sessionId: string,
  sessionDate: string,
): SkillScore[] {
  const scoredAt = `${sessionDate}T12:00:00.000Z`; // noon UTC — avoids date-shifting near midnight in western timezones
  const result: SkillScore[] = [];

  for (const row of rows) {
    const playerId = row.nameMatch.matchedPlayerId;
    if (!playerId) continue;

    for (const { column, mapping } of columnMappings) {
      if (mapping.kind === 'ignore') continue;
      const drillId = drillIdByColumn.get(column);
      const drill = drillId ? drillsById.get(drillId) : undefined;
      if (!drillId || !drill) continue;

      const value = parseScoreValue(row.raw[column] ?? '');
      if (value === undefined) continue;

      result.push({
        id: crypto.randomUUID(),
        playerId,
        sessionId,
        drillId,
        skill: drill.skill,
        score: value,
        scoredAt,
      });
    }
  }
  return result;
}
