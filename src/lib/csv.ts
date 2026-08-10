// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
// embedded newlines, and doubled-quote escaping. Shared by every CSV
// importer in the app (roster import, score import) — no importer-specific
// logic lives here.
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

export function parseCsvHeader(text: string): string[] {
  const [header] = parseCsv(text);
  return (header ?? []).map((h) => h.trim());
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
