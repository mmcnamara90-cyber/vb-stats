import type { Player, Position } from '../../types';
import { gradeToGradYear } from '../../lib/grade';
import { parseCsv, parseCsvObjects } from '../../lib/csv';

// Re-exported for existing callers (ImportRosterModal) — actual parsing now
// lives in src/lib/csv.ts, shared with the tryout score importer.
export { parseCsv, parseCsvObjects };

// Airtable position labels -> our Position enum. "Unsure" is dropped (not a
// real position); DS/Lib collapses to the single combined DS_L tag.
const POSITION_MAP: Record<string, Position | undefined> = {
  OH: 'OH',
  MB: 'MB',
  Setter: 'S',
  OPP: 'OPP',
  'DS/Lib': 'DS_L',
  Unsure: undefined,
};

function mapPositions(raw: string): Position[] {
  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const positions: Position[] = [];
  for (const t of tokens) {
    const mapped = POSITION_MAP[t];
    if (mapped && !positions.includes(mapped)) positions.push(mapped);
  }
  return positions;
}

function parseGradeToGradYear(gradeRaw: string): number | null {
  const match = gradeRaw.match(/(\d+)/);
  if (!match) return null;
  const gradeNum = Number(match[1]);
  if (gradeNum < 1 || gradeNum > 12) return null;
  return gradeToGradYear(gradeNum);
}

export interface ImportRow {
  firstName: string;
  lastName: string;
  gradYear: number | null;
  positions: Position[];
  contactPhone?: string;
  contactEmail?: string;
  skippedReason?: string;
  // Airtable's "Registered" column is a checkbox — exports as a non-empty
  // value (e.g. "checked") when checked, blank when not. Not every export
  // has this column at all, so a CSV without it leaves everyone registered
  // (no forced deactivation) rather than deactivating the whole roster.
  registered: boolean;
}

export function buildImportRows(records: Record<string, string>[]): ImportRow[] {
  const result: ImportRow[] = [];
  const hasRegisteredColumn = records.some((rec) => 'Registered' in rec);
  for (const rec of records) {
    const firstName = (rec['First'] ?? '').trim();
    const lastName = (rec['Last'] ?? '').trim();
    const grade = (rec['Grade'] ?? '').trim();

    if (!firstName || !lastName) continue; // blank/placeholder row (Airtable's unset-select placeholder has no Last)
    if (firstName.startsWith('(') || lastName.startsWith('(')) continue; // Airtable placeholder text, e.g. "(select name)"
    if (grade.toLowerCase() === 'coach') continue; // not a tryout participant

    result.push({
      firstName,
      lastName,
      gradYear: parseGradeToGradYear(grade),
      positions: mapPositions(rec['Position'] ?? ''),
      contactPhone: (rec['Player Phone #'] ?? '').trim() || undefined,
      contactEmail: (rec['Player Email'] ?? '').trim() || undefined,
      registered: !hasRegisteredColumn || (rec['Registered'] ?? '').trim() !== '',
    });
  }
  return result;
}

export interface ImportPlan {
  toCreate: ImportRow[];
  toUpdate: { row: ImportRow; existing: Player }[];
}

export function planImport(rows: ImportRow[], existingPlayers: Player[]): ImportPlan {
  const byName = new Map(
    existingPlayers.map((p) => [`${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}`, p]),
  );
  const toCreate: ImportRow[] = [];
  const toUpdate: { row: ImportRow; existing: Player }[] = [];
  for (const row of rows) {
    const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`;
    const existing = byName.get(key);
    if (existing) {
      toUpdate.push({ row, existing });
    } else {
      toCreate.push(row);
    }
  }
  return { toCreate, toUpdate };
}
