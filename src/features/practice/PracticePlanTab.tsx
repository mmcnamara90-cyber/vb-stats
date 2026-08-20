import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { DrillPayoff, Practice, PracticeDrill, PracticeDrillLog, Skill } from '../../types';
import { SKILL_LABELS, SKILLS } from '../tryouts/skills';
import { createDrill } from './DrillCatalogScreen';

const inputClass =
  'min-h-10 w-full rounded-lg border border-gray-300 px-2.5 text-sm focus:border-brand-indigo focus:outline-none';

const PAYOFF_OPTIONS: { id: DrillPayoff; label: string }[] = [
  { id: 'high', label: '🔥 High' },
  { id: 'medium', label: '🙂 Medium' },
  { id: 'low', label: '😕 Low' },
];

// Deterministic id (matches PositionTarget's `${team}:${position}` pattern)
// so saving a log is always a plain upsert-by-id, never a lookup-then-
// insert-or-update dance.
function drillLogId(practiceId: string, drillId: string): string {
  return `${practiceId}:${drillId}`;
}

// This practice's plan — an ordered list of catalog drills (Practice.drillIds).
// The Track tab reads this list to build its drill-selector strip. Kept
// simple (no drag-and-drop, matching the Lineup Simulator's tap-to-place
// precedent): add from the catalog or create new, reorder with ↑/↓, remove
// with ✕.
export function PracticePlanTab({ practice }: { practice: Practice }) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewDrill, setShowNewDrill] = useState(false);
  const [expandedDrillId, setExpandedDrillId] = useState<string | null>(null);

  const drills = useLiveQuery(async () => {
    const { data } = await supabase.from('drills').select('*').order('name', { ascending: true });
    return (data as PracticeDrill[]) ?? [];
  }, []);
  const logs = useLiveQuery(async () => {
    const { data } = await supabase.from('practiceDrillLogs').select('*').eq('practiceId', practice.id);
    return (data as PracticeDrillLog[]) ?? [];
  }, [practice.id]);

  if (drills === undefined || logs === undefined) return <p className="text-gray-500">Loading…</p>;
  const drillsById = new Map(drills.map((d) => [d.id, d]));
  const logsByDrillId = new Map(logs.map((l) => [l.drillId, l]));
  const planned = practice.drillIds.map((id) => drillsById.get(id)).filter((d): d is PracticeDrill => !!d);
  const notPlanned = drills
    .filter((d) => !practice.drillIds.includes(d.id))
    .filter((d) => !search.trim() || d.name.toLowerCase().includes(search.trim().toLowerCase()));

  async function saveLog(drillId: string, patch: Partial<Omit<PracticeDrillLog, 'id' | 'practiceId' | 'drillId'>>) {
    const existing = logsByDrillId.get(drillId);
    const log: PracticeDrillLog = {
      id: drillLogId(practice.id, drillId),
      practiceId: practice.id,
      drillId,
      followUp: false,
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await supabase.from('practiceDrillLogs').upsert(log);
  }

  async function setDrillIds(drillIds: string[]) {
    await supabase.from('practices').update({ drillIds }).eq('id', practice.id);
  }

  function addDrill(drillId: string) {
    if (practice.drillIds.includes(drillId)) return;
    setDrillIds([...practice.drillIds, drillId]);
    setShowPicker(false);
    setSearch('');
  }
  function removeDrill(drillId: string) {
    setDrillIds(practice.drillIds.filter((id) => id !== drillId));
  }
  function moveDrill(index: number, direction: -1 | 1) {
    const next = [...practice.drillIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDrillIds(next);
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Today's plan. The Track tab uses this list to let you tag stats by drill; anything tracked without picking a
        drill files under "General".
      </p>

      {planned.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No drills planned yet — add some below.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden mb-4">
          {planned.map((d, i) => {
            const log = logsByDrillId.get(d.id);
            const expanded = expandedDrillId === d.id;
            return (
              <li key={d.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-baseline gap-2 flex-wrap min-w-0">
                    <span className="text-xs text-gray-400 font-mono">{i + 1}.</span>
                    <span className="font-medium text-gray-900">{d.name}</span>
                    {d.focusSkill && (
                      <span className="shrink-0 text-[11px] font-medium text-brand-indigo bg-brand-indigo/10 rounded-full px-2 py-0.5">
                        {SKILL_LABELS[d.focusSkill]}
                      </span>
                    )}
                    {log?.followUp && <span className="shrink-0 text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">🚩 follow up</span>}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => moveDrill(i, -1)} disabled={i === 0} className="min-h-8 min-w-8 rounded-md border border-gray-300 text-gray-600 disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" onClick={() => moveDrill(i, 1)} disabled={i === planned.length - 1} className="min-h-8 min-w-8 rounded-md border border-gray-300 text-gray-600 disabled:opacity-30">
                      ↓
                    </button>
                    <button type="button" onClick={() => removeDrill(d.id)} className="min-h-8 px-2.5 rounded-md bg-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-300">
                      ✕
                    </button>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedDrillId(expanded ? null : d.id)}
                  className="mt-1 text-xs font-medium text-brand-indigo"
                >
                  {expanded
                    ? '▾ Hide log'
                    : `▸ ${log ? 'Edit log' : 'Log time / payoff / notes'}${log?.durationMinutes ? ` (${log.durationMinutes}m)` : ''}${log?.payoff ? ` · ${PAYOFF_OPTIONS.find((p) => p.id === log.payoff)?.label}` : ''}`}
                </button>

                {expanded && (
                  <DrillLogEditor log={log} onSave={(patch) => saveLog(d.id, patch)} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showPicker ? (
        <div className="rounded-lg border border-gray-200 p-3">
          <input className={`${inputClass} mb-2`} placeholder="Search drills…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto mb-2">
            {notPlanned.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => addDrill(d.id)} className="w-full min-h-11 flex items-center justify-between gap-2 px-1 py-1.5 text-left">
                  <span className="flex items-baseline gap-2 flex-wrap min-w-0">
                    <span className="font-medium text-gray-900">{d.name}</span>
                    {d.description && <span className="text-xs text-gray-500 truncate">{d.description}</span>}
                  </span>
                  <span className="shrink-0 text-brand-indigo font-bold">+</span>
                </button>
              </li>
            ))}
            {notPlanned.length === 0 && !showNewDrill && <li className="px-1 py-2 text-sm text-gray-400">No matching drills in the catalog.</li>}
          </ul>

          {showNewDrill ? (
            <NewDrillInline
              defaultName={search}
              onCreated={(d) => {
                addDrill(d.id);
                setShowNewDrill(false);
              }}
              onCancel={() => setShowNewDrill(false)}
            />
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowNewDrill(true)} className="min-h-9 flex-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700">
                + New drill
              </button>
              <button type="button" onClick={() => { setShowPicker(false); setSearch(''); }} className="min-h-9 flex-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700">
                Done
              </button>
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setShowPicker(true)} className="min-h-11 w-full rounded-lg bg-brand-indigo text-white text-base font-medium active:bg-brand-indigo-dark">
          + Add drill
        </button>
      )}
    </div>
  );
}

// How this specific drill went today — time spent, payoff, freeform notes,
// and a follow-up flag. Seeded from the existing log once (a plain useState
// initializer, not an effect resyncing on every prop change) so a realtime
// refetch triggered by something unrelated elsewhere in the app can't
// clobber text the coach is mid-typing — same reasoning as GameLineupTab's
// local optimistic-state pattern, just for a plain form instead of taps.
function DrillLogEditor({
  log,
  onSave,
}: {
  log: PracticeDrillLog | undefined;
  onSave: (patch: Partial<Omit<PracticeDrillLog, 'id' | 'practiceId' | 'drillId'>>) => void;
}) {
  const [duration, setDuration] = useState(log?.durationMinutes != null ? String(log.durationMinutes) : '');
  const [notes, setNotes] = useState(log?.notes ?? '');

  function saveDuration() {
    const n = duration.trim() === '' ? undefined : Math.max(0, Math.round(Number(duration)));
    onSave({ durationMinutes: Number.isFinite(n) ? n : undefined });
  }

  return (
    <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500 shrink-0">Minutes spent</label>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className="min-h-9 w-20 rounded-lg border border-gray-300 px-2 text-sm"
          placeholder="—"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          onBlur={saveDuration}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Payoff</label>
        <div className="flex gap-1.5">
          {PAYOFF_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSave({ payoff: log?.payoff === p.id ? undefined : p.id })}
              className={`min-h-9 px-2.5 rounded-lg text-xs font-medium border ${
                log?.payoff === p.id ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Coach notes</label>
        <textarea
          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand-indigo focus:outline-none"
          rows={2}
          placeholder="What worked, what didn't, what to adjust next time…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onSave({ notes: notes.trim() || undefined })}
        />
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
        <input
          type="checkbox"
          checked={log?.followUp ?? false}
          onChange={(e) => onSave({ followUp: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-brand-indigo focus:ring-brand-indigo"
        />
        🚩 Flag for follow-up next practice
      </label>
    </div>
  );
}

function NewDrillInline({
  defaultName,
  onCreated,
  onCancel,
}: {
  defaultName: string;
  onCreated: (drill: PracticeDrill) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [focusSkill, setFocusSkill] = useState<Skill | ''>('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const drill = await createDrill({ name, description, focusSkill: focusSkill || undefined });
    setSaving(false);
    onCreated(drill);
  }

  return (
    <div className="space-y-1.5 mb-2">
      <input className={inputClass} placeholder="Drill name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input className={inputClass} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <select className={inputClass} value={focusSkill} onChange={(e) => setFocusSkill(e.target.value as Skill | '')}>
        <option value="">— focus skill (optional) —</option>
        {SKILLS.map((s) => (
          <option key={s} value={s}>
            {SKILL_LABELS[s]}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="min-h-9 flex-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700">
          Cancel
        </button>
        <button type="button" onClick={create} disabled={!name.trim() || saving} className="min-h-9 flex-1 rounded-lg bg-brand-indigo text-white text-xs font-medium active:bg-brand-indigo-dark disabled:opacity-50">
          {saving ? 'Adding…' : 'Add to plan'}
        </button>
      </div>
    </div>
  );
}
