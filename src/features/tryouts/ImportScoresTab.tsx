import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import { parseCsvHeader, parseCsvObjects } from '../../lib/csv';
import { getOrCreateSessionForDate, todayIso } from '../../lib/dailySession';
import type { Player, Session, Skill, SkillScore, TryoutDrill, TryoutLevel } from '../../types';
import { SKILLS, SKILL_LABELS, TRYOUT_LEVELS, TRYOUT_LEVEL_LABELS } from './skills';
import { playerGradeLabel } from '../../lib/playerSearch';
import {
  buildScoreImportRows,
  buildScoreRows,
  collectNewDrills,
  guessLastNameColumn,
  guessNameColumn,
  type ColumnMappingEntry,
  type ScoreColumnMapping,
  type ScoreImportRow,
} from './importScores';

type Step = 'upload' | 'session' | 'map' | 'validate' | 'done';

const inputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const NEW_DRILL_SENTINEL = '__new_drill__';
const IGNORE_SENTINEL = '__ignore__';

interface CachedMapping {
  nameColumn: string;
  lastNameColumn: string | null;
  columns: Record<string, { kind: 'ignore' } | { kind: 'drill'; drillId: string }>;
}

function mappingCacheKey(headers: string[]): string {
  return `vb-stats-score-import-mapping:${[...headers].sort().join('|')}`;
}

export function ImportScoresTab() {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);

  const [sessionDate, setSessionDate] = useState(todayIso());
  const [level, setLevel] = useState<TryoutLevel>('upper');
  const [session, setSession] = useState<Session | null>(null);

  const [nameColumn, setNameColumn] = useState('');
  const [lastNameColumn, setLastNameColumn] = useState<string>('');
  const [columnMappings, setColumnMappings] = useState<Map<string, ScoreColumnMapping>>(new Map());
  const [newDrillDrafts, setNewDrillDrafts] = useState<Map<string, { name: string; skill: Skill }>>(new Map());

  const [overrides, setOverrides] = useState<Map<number, string>>(new Map()); // rowIndex -> playerId | 'skip'
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [resultCounts, setResultCounts] = useState<{ scores: number; players: number; drillsCreated: number } | null>(
    null,
  );

  const drills = useLiveQuery(async () => {
    const { data } = await supabase.from('tryoutDrills').select('*').order('name');
    return (data as TryoutDrill[]) ?? [];
  }, []);
  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true).order('firstName');
    return (data as Player[]) ?? [];
  }, []);

  function reset() {
    setStep('upload');
    setFileName(null);
    setParseError(null);
    setHeaders([]);
    setRecords([]);
    setSession(null);
    setNameColumn('');
    setLastNameColumn('');
    setColumnMappings(new Map());
    setNewDrillDrafts(new Map());
    setOverrides(new Map());
    setImportError(null);
    setResultCounts(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const header = parseCsvHeader(text);
      const recs = parseCsvObjects(text);
      if (header.length === 0 || recs.length === 0) throw new Error('empty');
      setHeaders(header);
      setRecords(recs);
      const guessedName = guessNameColumn(header) ?? header[0];
      const guessedLast = guessLastNameColumn(header) ?? '';
      setNameColumn(guessedName);
      setLastNameColumn(guessedLast);
    } catch {
      setParseError('Could not read that file as CSV.');
      setHeaders([]);
      setRecords([]);
    }
  }

  async function handleSessionContinue() {
    const s = await getOrCreateSessionForDate('tryout', sessionDate, level);
    setSession(s);

    // Pre-fill column mappings from a previous import of the same report shape.
    const cached = localStorage.getItem(mappingCacheKey(headers));
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as CachedMapping;
        if (headers.includes(parsed.nameColumn)) setNameColumn(parsed.nameColumn);
        if (parsed.lastNameColumn && headers.includes(parsed.lastNameColumn)) setLastNameColumn(parsed.lastNameColumn);
        const nextMappings = new Map<string, ScoreColumnMapping>();
        for (const [column, mapping] of Object.entries(parsed.columns)) {
          if (headers.includes(column)) nextMappings.set(column, mapping);
        }
        setColumnMappings(nextMappings);
      } catch {
        // ignore malformed cache
      }
    }
    setStep('map');
  }

  const mappableColumns = headers.filter((h) => h !== nameColumn && h !== lastNameColumn);

  function setColumnMapping(column: string, mapping: ScoreColumnMapping) {
    setColumnMappings((m) => new Map(m).set(column, mapping));
  }

  function handleMapContinue() {
    setStep('validate');
  }

  const rows = useMemo<ScoreImportRow[]>(() => {
    if (!players || !nameColumn) return [];
    return buildScoreImportRows(records, nameColumn, lastNameColumn || undefined, players);
  }, [records, nameColumn, lastNameColumn, players]);

  const skippedJunkCount = records.length - rows.length;

  function resolvedPlayerId(row: ScoreImportRow): string | undefined {
    const override = overrides.get(row.index);
    if (override === 'skip') return undefined;
    if (override) return override;
    return row.nameMatch.matchedPlayerId;
  }

  const unresolvedCount = rows.filter((r) => {
    const override = overrides.get(r.index);
    if (override) return false; // explicit choice or skip made
    return r.nameMatch.status !== 'auto';
  }).length;

  const activeColumnMappings: ColumnMappingEntry[] = mappableColumns
    .map((column) => {
      const mapping = columnMappings.get(column);
      if (!mapping) return null;
      if (mapping.kind === 'newDrill') {
        const draft = newDrillDrafts.get(column);
        if (!draft || !draft.name.trim()) return null;
        return { column, mapping: { kind: 'newDrill', name: draft.name.trim(), skill: draft.skill } as ScoreColumnMapping };
      }
      return { column, mapping };
    })
    .filter((c): c is ColumnMappingEntry => c !== null && c.mapping.kind !== 'ignore');

  async function handleImport() {
    if (!session || !players || !drills) return;
    setImporting(true);
    setImportError(null);
    try {
      // 1. Create any "+ New drill" columns first.
      const toCreate = collectNewDrills(activeColumnMappings);
      const drillIdByColumn = new Map<string, string>();
      const drillsById = new Map(drills.map((d) => [d.id, d]));

      if (toCreate.length > 0) {
        const newRows: TryoutDrill[] = toCreate.map((c) => ({
          id: crypto.randomUUID(),
          name: c.name,
          skill: c.skill,
          createdAt: new Date().toISOString(),
        }));
        const { error } = await supabase.from('tryoutDrills').insert(newRows);
        if (error) throw error;
        newRows.forEach((d, i) => {
          drillIdByColumn.set(toCreate[i].column, d.id);
          drillsById.set(d.id, d);
        });
      }
      for (const { column, mapping } of activeColumnMappings) {
        if (mapping.kind === 'drill') drillIdByColumn.set(column, mapping.drillId);
      }

      // 2. Apply manual match overrides/skips before building rows.
      const finalRows: ScoreImportRow[] = rows.map((r) => {
        const resolved = resolvedPlayerId(r);
        return { ...r, nameMatch: { ...r.nameMatch, matchedPlayerId: resolved } };
      });

      const scoreRows = buildScoreRows(
        finalRows,
        activeColumnMappings,
        drillIdByColumn,
        drillsById,
        session.id,
        session.date,
      );

      if (scoreRows.length > 0) {
        const { error } = await supabase.from('skillScores').insert(scoreRows as SkillScore[]);
        if (error) throw error;
      }

      // 3. Cache the mapping (new drills resolved to real ids) for next time.
      const cacheable: CachedMapping = {
        nameColumn,
        lastNameColumn: lastNameColumn || null,
        columns: Object.fromEntries(
          activeColumnMappings.map(({ column }) => {
            const drillId = drillIdByColumn.get(column);
            return [column, drillId ? { kind: 'drill' as const, drillId } : { kind: 'ignore' as const }];
          }),
        ),
      };
      localStorage.setItem(mappingCacheKey(headers), JSON.stringify(cacheable));

      const playerCount = new Set(scoreRows.map((r) => r.playerId)).size;
      setResultCounts({ scores: scoreRows.length, players: playerCount, drillsCreated: toCreate.length });
      setStep('done');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Import a CSV score export (e.g. from SoloStats) and map its columns to drills. Player matching is by first
        name, with manual verification for anyone ambiguous or unmatched.
      </p>

      {step === 'upload' && (
        <div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="block w-full text-sm text-gray-700"
          />
          {fileName && <p className="text-xs text-gray-500 mt-1">{fileName}</p>}
          {parseError && <p className="text-sm text-red-600 mt-1">{parseError}</p>}
          {headers.length > 0 && (
            <button
              type="button"
              onClick={() => setStep('session')}
              className="min-h-11 w-full mt-4 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700"
            >
              Continue ({records.length} rows found)
            </button>
          )}
        </div>
      )}

      {step === 'session' && (
        <div>
          <div className="mb-3">
            <label className={labelClass}>Date these scores are from</label>
            <input
              type="date"
              className={inputClass}
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className={labelClass}>Tryout pool</label>
            <div className="flex gap-2">
              {TRYOUT_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`min-h-11 px-3 rounded-lg text-sm font-medium border ${
                    level === lvl ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {TRYOUT_LEVEL_LABELS[lvl]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep('upload')}
              className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSessionContinue}
              className="min-h-11 flex-1 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div>
          <div className="mb-3">
            <label className={labelClass}>Name column</label>
            <select className={inputClass} value={nameColumn} onChange={(e) => setNameColumn(e.target.value)}>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className={labelClass}>Last name column (optional — helps disambiguate)</label>
            <select className={inputClass} value={lastNameColumn} onChange={(e) => setLastNameColumn(e.target.value)}>
              <option value="">None</option>
              {headers
                .filter((h) => h !== nameColumn)
                .map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
            </select>
          </div>

          <p className="text-sm font-medium text-gray-700 mb-2">Map each remaining column</p>
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden mb-4">
            {mappableColumns.map((column) => {
              const mapping = columnMappings.get(column) ?? { kind: 'ignore' as const };
              const draft = newDrillDrafts.get(column) ?? { name: '', skill: 'serve' as Skill };
              const selectValue =
                mapping.kind === 'ignore' ? IGNORE_SENTINEL : mapping.kind === 'newDrill' ? NEW_DRILL_SENTINEL : mapping.drillId;

              return (
                <li key={column} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{column}</span>
                    <select
                      className="min-h-9 rounded-lg border border-gray-300 text-sm px-2 text-gray-700"
                      value={selectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === IGNORE_SENTINEL) setColumnMapping(column, { kind: 'ignore' });
                        else if (v === NEW_DRILL_SENTINEL) {
                          setColumnMapping(column, { kind: 'newDrill', name: column, skill: draft.skill });
                          setNewDrillDrafts((m) => new Map(m).set(column, { name: draft.name || column, skill: draft.skill }));
                        } else setColumnMapping(column, { kind: 'drill', drillId: v });
                      }}
                    >
                      <option value={IGNORE_SENTINEL}>Ignore</option>
                      {SKILLS.map((skill) => {
                        const opts = (drills ?? []).filter((d) => d.skill === skill);
                        if (opts.length === 0) return null;
                        return (
                          <optgroup key={skill} label={SKILL_LABELS[skill]}>
                            {opts.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                      <option value={NEW_DRILL_SENTINEL}>+ New drill…</option>
                    </select>
                  </div>

                  {mapping.kind === 'newDrill' && (
                    <div className="flex gap-2 mt-2">
                      <input
                        className="min-h-9 flex-1 rounded-lg border border-gray-300 px-2 text-sm"
                        placeholder="Drill name"
                        value={draft.name}
                        onChange={(e) => {
                          const next = { ...draft, name: e.target.value };
                          setNewDrillDrafts((m) => new Map(m).set(column, next));
                          setColumnMapping(column, { kind: 'newDrill', name: next.name, skill: next.skill });
                        }}
                      />
                      <select
                        className="min-h-9 rounded-lg border border-gray-300 text-sm px-2"
                        value={draft.skill}
                        onChange={(e) => {
                          const next = { ...draft, skill: e.target.value as Skill };
                          setNewDrillDrafts((m) => new Map(m).set(column, next));
                          setColumnMapping(column, { kind: 'newDrill', name: next.name, skill: next.skill });
                        }}
                      >
                        {SKILLS.map((s) => (
                          <option key={s} value={s}>
                            {SKILL_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep('session')}
              className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleMapContinue}
              disabled={activeColumnMappings.length === 0}
              className="min-h-11 flex-1 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'validate' && (
        <div>
          <p className="text-sm text-gray-700 mb-3">
            {rows.length} player row{rows.length === 1 ? '' : 's'} · {skippedJunkCount} row
            {skippedJunkCount === 1 ? '' : 's'} skipped (blank/total)
            {unresolvedCount > 0 && (
              <span className="text-amber-600"> · {unresolvedCount} need{unresolvedCount === 1 ? 's' : ''} review</span>
            )}
          </p>

          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden mb-4 max-h-[28rem] overflow-y-auto">
            {rows.map((row) => {
              const override = overrides.get(row.index);
              const currentPlayerId = override && override !== 'skip' ? override : row.nameMatch.matchedPlayerId;
              const isSkipped = override === 'skip';
              const statusLabel =
                row.nameMatch.status === 'auto'
                  ? 'Auto-matched'
                  : row.nameMatch.status === 'ambiguous'
                    ? 'Ambiguous — pick one'
                    : 'No match';
              const statusColor =
                row.nameMatch.status === 'auto'
                  ? 'bg-emerald-100 text-emerald-700'
                  : row.nameMatch.status === 'ambiguous'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700';

              const pickList = row.nameMatch.status === 'ambiguous' ? row.nameMatch.candidates : players ?? [];

              return (
                <li key={row.index} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{row.nameMatch.rawName.trim()}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isSkipped ? 'bg-gray-100 text-gray-500' : statusColor}`}>
                      {isSkipped ? 'Skipped' : statusLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <select
                      className="min-h-9 flex-1 rounded-lg border border-gray-300 text-sm px-2 text-gray-700"
                      value={isSkipped ? 'skip' : (currentPlayerId ?? '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOverrides((m) => new Map(m).set(row.index, v === 'skip' ? 'skip' : v));
                      }}
                    >
                      <option value="" disabled>
                        Choose player…
                      </option>
                      {pickList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName} · {playerGradeLabel(p)}
                        </option>
                      ))}
                      <option value="skip">Skip this row</option>
                    </select>
                  </div>
                  {!isSkipped && activeColumnMappings.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {activeColumnMappings.map(({ column }) => `${column}: ${row.raw[column] || '—'}`).join(' · ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {importError && <p className="text-sm text-red-600 mb-3">{importError}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep('map')}
              className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="min-h-11 flex-1 rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700 disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && resultCounts && (
        <div>
          <p className="text-sm text-green-700 mb-4">
            Imported {resultCounts.scores} score{resultCounts.scores === 1 ? '' : 's'} across {resultCounts.players} player
            {resultCounts.players === 1 ? '' : 's'}
            {resultCounts.drillsCreated > 0 &&
              ` · ${resultCounts.drillsCreated} new drill${resultCounts.drillsCreated === 1 ? '' : 's'} created`}
            .
          </p>
          <button
            type="button"
            onClick={reset}
            className="min-h-11 w-full rounded-lg bg-blue-600 text-white text-base font-medium active:bg-blue-700"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
