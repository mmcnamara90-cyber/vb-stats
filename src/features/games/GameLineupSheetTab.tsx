import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { CourtZone, Game, GameLineup, Player } from '../../types';
import { computeEffectiveCourt } from './effectiveCourt';
import {
  computeRotationPairGroups,
  pairGroupColorClass,
  PAIR_GROUP_COLOR_CLASSES,
  rotationPairLabels,
} from './lineupSheetColors';

const ZONE_GRID: CourtZone[][] = [
  [4, 3, 2], // front row, at the net
  [5, 6, 1], // back row
];
const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;

function playerLabel(p: Player | undefined): string {
  if (!p) return 'Unknown';
  return p.jerseyNumber != null ? `${p.firstName} #${p.jerseyNumber}` : p.firstName;
}

// A read-only, all-rotations-at-a-glance view of a game's lineup — meant to
// hand off cleanly to someone who isn't going to click through the Lineup
// tab's tap-to-edit UI (e.g. an assistant coach running the game solo).
// Modeled directly on the coach's own hand-drawn sheet: one block per
// rotation, court-shaped grid, each player colored by which rotational
// partnership she belongs to (Setter/Opposite, Middles+Libero,
// Outsides/DS — see lineupSheetColors.ts for how that's derived), libero
// and subs called out in plain text, plus a freeform Notes box for exactly
// the things that don't fit the structured lineup data (players out,
// flexible/maybe subs, forward-looking reminders).
export function GameLineupSheetTab({ game }: { game: Game }) {
  const rosterIdsKey = game.rosterPlayerIds.join(',');
  const players = useLiveQuery(async () => {
    if (game.rosterPlayerIds.length === 0) return [];
    const { data } = await supabase.from('players').select('*').in('id', game.rosterPlayerIds);
    return (data as Player[]) ?? [];
  }, [rosterIdsKey]);

  const lineups = useLiveQuery(async () => {
    const { data } = await supabase.from('gameLineups').select('*').eq('gameId', game.id).order('setNumber');
    return (data as GameLineup[]) ?? [];
  }, [game.id]);

  // Seeded once from game.notes, not resynced on every prop change — same
  // reasoning as PracticePlanTab's DrillLogEditor: a realtime refetch
  // triggered by something unrelated (another tab, another device) could
  // otherwise clobber text the coach is mid-typing. Saves onBlur.
  const [notes, setNotes] = useState(game.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);

  async function saveNotes() {
    if (notes === (game.notes ?? '')) return;
    setSavingNotes(true);
    await supabase.from('games').update({ notes }).eq('id', game.id);
    setSavingNotes(false);
  }

  if (players === undefined || lineups === undefined) return <p className="text-gray-500">Loading…</p>;

  const playersById = new Map(players.map((p) => [p.id, p]));

  return (
    <div>
      <div className="flex items-center justify-between mb-3 print:hidden">
        <p className="text-sm text-gray-500">A clean view to hand off — e.g. text a screenshot, or print it.</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-9 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 shrink-0"
        >
          🖨 Print
        </button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
        <label className="block text-sm font-semibold text-amber-900 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="e.g. No Leila, No Aliyah · Lucy can sub for Isla/Peyton or Kenley · Olivia plays Set 2"
          rows={3}
          className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-indigo focus:outline-none"
        />
        {savingNotes && <p className="text-xs text-amber-700 mt-1">Saving…</p>}
      </div>

      {lineups.length === 0 && (
        <p className="text-gray-500">No lineup set yet — build one in the Lineup tab first.</p>
      )}

      {lineups.map((lineup) => (
        <SetSheet key={lineup.id} lineup={lineup} playersById={playersById} />
      ))}
    </div>
  );
}

function SetSheet({ lineup, playersById }: { lineup: GameLineup; playersById: Map<string, Player> }) {
  const sortedSubs = [...lineup.subs].sort((a, b) => a.effectiveRotation - b.effectiveRotation);
  const liberos = lineup.liberos.filter((l) => l.liberoPlayerId);
  const pairGroups = computeRotationPairGroups(lineup);
  const pairLabels = rotationPairLabels(lineup, playersById);

  return (
    <div className="mb-8 print:break-inside-avoid">
      <h2 className="text-lg font-bold text-gray-900 mb-2 pb-1 border-b-2 border-gray-900">Set {lineup.setNumber}</h2>

      {pairLabels.some((names) => names.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Rotation partners:</span>
          {pairLabels.map(
            (names, i) =>
              names.length > 0 && (
                <span key={i} className="inline-flex items-center gap-1">
                  <span className={`h-3 w-3 rounded-full border ${PAIR_GROUP_COLOR_CLASSES[i]}`} />
                  {names.join(' & ')}
                </span>
              )
          )}
        </div>
      )}

      {liberos.length > 0 && (
        <p className="text-sm text-violet-900 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5 mb-2 inline-block">
          🛡 Libero{liberos.length > 1 ? 's' : ''}:{' '}
          {liberos
            .map((l) => {
              const p = playersById.get(l.liberoPlayerId);
              const shadows = l.shadowedPlayerIds.map((id) => playersById.get(id)?.firstName ?? '?').join('/');
              return `${playerLabel(p)}${shadows ? ` (for ${shadows})` : ''}`;
            })
            .join(' · ')}
        </p>
      )}

      {sortedSubs.length > 0 && (
        <ul className="text-sm text-gray-700 mb-3 space-y-0.5">
          {sortedSubs.map((s) => (
            <li key={s.id}>
              <span className="font-medium">{playerLabel(playersById.get(s.inPlayerId))}</span> in for{' '}
              <span className="font-medium">{playerLabel(playersById.get(s.outPlayerId))}</span> — from Rotation{' '}
              {s.effectiveRotation}
            </li>
          ))}
        </ul>
      )}

      <div className="grid sm:grid-cols-2 gap-3 print:grid-cols-2">
        {ROTATIONS.map((rotation) => {
          const effective = computeEffectiveCourt(lineup, rotation);
          return (
            <div key={rotation} className="rounded-xl border-2 border-gray-300 p-2 print:break-inside-avoid">
              <p className="text-sm font-bold text-gray-700 mb-1 text-center">Rotation {rotation}</p>
              <div className="text-center text-[10px] font-medium tracking-widest text-gray-400 mb-1">— NET —</div>
              {ZONE_GRID.map((row, i) => (
                <div key={i} className="grid grid-cols-3 gap-1.5 mb-1.5 last:mb-0">
                  {row.map((zone) => {
                    const playerId = effective.zoneAssignments[zone];
                    const player = playerId ? playersById.get(playerId) : undefined;
                    const isLibero = effective.liberosOnCourt.some((l) => l.zone === zone);
                    return (
                      <div
                        key={zone}
                        className={`relative min-h-16 rounded-lg border-2 flex flex-col items-center justify-center text-center px-1 ${
                          player ? pairGroupColorClass(player.id, pairGroups) : 'border-gray-200 text-gray-300'
                        }`}
                      >
                        <span className="absolute top-0.5 left-1 text-[9px] font-medium opacity-60">{zone}</span>
                        {isLibero && <span className="absolute top-0.5 right-1 text-[10px]">🛡</span>}
                        <span className="text-sm font-bold leading-tight">
                          {player ? player.firstName : '—'}
                        </span>
                        {player?.jerseyNumber != null && (
                          <span className="text-xs font-semibold opacity-80">#{player.jerseyNumber}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
