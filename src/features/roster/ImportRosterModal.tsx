import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Player } from '../../types';
import { buildImportRows, parseCsvObjects, planImport, type ImportPlan } from './importRoster';
import { POSITION_LABELS } from '../tryouts/skills';
import { gradeLabel, gradYearToGrade } from '../../lib/grade';

export function ImportRosterModal({ onClose }: { onClose: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(false);
    setFileName(file.name);
    try {
      const text = await file.text();
      const records = parseCsvObjects(text);
      const rows = buildImportRows(records);
      const { data: existingPlayers } = await supabase.from('players').select('*');
      setPlan(planImport(rows, (existingPlayers as Player[]) ?? []));
      setSkippedCount(records.length - rows.length);
    } catch {
      setError('Could not read that file as CSV.');
      setPlan(null);
    }
  }

  async function handleImport() {
    if (!plan) return;
    setImporting(true);
    if (plan.toCreate.length > 0) {
      const newPlayers: Player[] = plan.toCreate.map((row) => ({
        id: crypto.randomUUID(),
        firstName: row.firstName,
        lastName: row.lastName,
        gradYear: row.gradYear ?? new Date().getFullYear() + 1,
        positions: row.positions,
        contactPhone: row.contactPhone,
        contactEmail: row.contactEmail,
        tags: [],
        active: row.registered,
        createdAt: new Date().toISOString(),
      }));
      await supabase.from('players').insert(newPlayers);
    }
    for (const { row, existing } of plan.toUpdate) {
      await supabase
        .from('players')
        .update({
          gradYear: row.gradYear ?? existing.gradYear,
          positions: row.positions.length > 0 ? row.positions : existing.positions,
          contactPhone: row.contactPhone ?? existing.contactPhone,
          contactEmail: row.contactEmail ?? existing.contactEmail,
          // One-directional: an unregistered row deactivates an existing
          // player, but being registered never force-reactivates someone —
          // that could undo an intentional cut/graduation for an unrelated
          // reason. Leave `active` untouched when registered.
          ...(row.registered ? {} : { active: false }),
        })
        .eq('id', existing.id);
    }
    setImporting(false);
    setDone(true);
  }

  const deactivateCount = (plan?.toUpdate ?? []).filter(({ row, existing }) => !row.registered && existing.active).length;
  const newInactiveCount = (plan?.toCreate ?? []).filter((row) => !row.registered).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-xl font-bold mb-1">Import Roster</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload the Airtable CSV export. Name, grade, position, and contact info are imported —
          team assignments, cut/keep status, and family/parent info are left out. If the CSV has a
          "Registered" column, blank rows deactivate that player (never auto-reactivates someone).
        </p>

        {!done && (
          <div className="mb-4">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="block w-full text-sm text-gray-700"
            />
            {fileName && <p className="text-xs text-gray-500 mt-1">{fileName}</p>}
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          </div>
        )}

        {plan && !done && (
          <div className="mb-4">
            <p className="text-sm text-gray-700 mb-2">
              {plan.toCreate.length} new player{plan.toCreate.length === 1 ? '' : 's'} ·{' '}
              {plan.toUpdate.length} existing player{plan.toUpdate.length === 1 ? '' : 's'} updated
              {skippedCount > 0 && ` · ${skippedCount} row${skippedCount === 1 ? '' : 's'} skipped (coach/blank)`}
            </p>
            {(deactivateCount > 0 || newInactiveCount > 0) && (
              <p className="text-sm text-amber-700 mb-2">
                Not registered: {deactivateCount > 0 && `${deactivateCount} existing player${deactivateCount === 1 ? '' : 's'} will be deactivated`}
                {deactivateCount > 0 && newInactiveCount > 0 && ' · '}
                {newInactiveCount > 0 && `${newInactiveCount} new player${newInactiveCount === 1 ? '' : 's'} added as inactive`}
              </p>
            )}
            <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden max-h-64 overflow-y-auto">
              {[...plan.toCreate.map((row) => ({ row, isNew: true })), ...plan.toUpdate.map(({ row }) => ({ row, isNew: false }))]
                .sort((a, b) => a.row.lastName.localeCompare(b.row.lastName))
                .map(({ row, isNew }, i) => (
                  <li key={i} className="px-4 py-2 text-sm flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      {row.firstName} {row.lastName}
                      {!isNew && <span className="text-xs text-brand-indigo ml-1">(update)</span>}
                      {!row.registered && <span className="text-xs text-amber-600 ml-1">(not registered)</span>}
                    </span>
                    <span className="text-gray-500 text-xs text-right">
                      {row.positions.map((p) => POSITION_LABELS[p]).join(', ') || 'no position'} ·{' '}
                      {row.gradYear != null ? gradeLabel(gradYearToGrade(row.gradYear)) : '?'}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {done && <p className="text-sm text-green-700 mb-4">Roster imported.</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg border border-gray-300 text-base font-medium text-gray-700 active:bg-gray-100"
          >
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button
              type="button"
              onClick={handleImport}
              disabled={!plan || importing || plan.toCreate.length + plan.toUpdate.length === 0}
              className="min-h-11 flex-1 rounded-lg bg-brand-indigo text-base font-medium text-white active:bg-brand-indigo-dark disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
