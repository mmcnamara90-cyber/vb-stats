import type { Player, Position } from '../../types';

// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
// embedded newlines, and doubled-quote escaping (Airtable exports use all of these).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, ''); // strip BOM

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function parseCsvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const [header, ...rest] = rows;
  return rest.map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((key, i) => {
      obj[key] = r[i] ?? '';
    });
    return obj;
  });
}

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

// 12th grade graduates in the spring of the *next* calendar year relative to
// the school year's start (Jul-Dec = same year, Jan-Jun = previous year).
function gradeToGradYear(gradeRaw: string, today = new Date()): number | null {
  const match = gradeRaw.match(/(\d+)/);
  if (!match) return null;
  const gradeNum = Number(match[1]);
  if (gradeNum < 1 || gradeNum > 12) return null;
  const schoolYearStartYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const twelfthGradYear = schoolYearStartYear + 1;
  return twelfthGradYear + (12 - gradeNum);
}

export interface ImportRow {
  firstName: string;
  lastName: string;
  gradYear: number | null;
  positions: Position[];
  contactPhone?: string;
  contactEmail?: string;
  skippedReason?: string;
}

export function buildImportRows(records: Record<string, string>[]): ImportRow[] {
  const result: ImportRow[] = [];
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
      gradYear: gradeToGradYear(grade),
      positions: mapPositions(rec['Position'] ?? ''),
      contactPhone: (rec['Player Phone #'] ?? '').trim() || undefined,
      contactEmail: (rec['Player Email'] ?? '').trim() || undefined,
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
