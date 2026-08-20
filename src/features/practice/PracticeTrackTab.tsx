import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { Practice, PracticeDrill, PracticeStatEvent, PracticeStatType, Player } from '../../types';
import { PositionBadges } from '../tryouts/PositionBadges';
import { GAME_STAT_LABELS, countEvents, serveReceiveAverage, statRolesForPositions } from '../games/gameStats';
import { SR_RATINGS, SR_RATING_COLOR_CLASSES, StatButton } from '../games/statButtons';

type MobileCategory = 'attack' | 'serve_receive' | 'assist';
const MOBILE_CATEGORIES: MobileCategory[] = ['serve_receive', 'attack', 'assist'];
const MOBILE_CATEGORY_LABELS: Record<MobileCategory, string> = {
  attack: 'Attack',
  serve_receive: 'Serve Receive',
  assist: 'Assist',
};

// Separate keys from Game Day's mobile-view prefs — a coach may want this
// on for practice but off for games, or vice versa.
const MOBILE_VIEW_KEY = 'vb-stats-practice-mobile-view';
const MOBILE_CATEGORY_KEY = 'vb-stats-practice-mobile-category';

function readStoredMobileView(): boolean {
  try {
    return localStorage.getItem(MOBILE_VIEW_KEY) === '1';
  } catch {
    return false;
  }
}
function readStoredMobileCategory(): MobileCategory {
  try {
    const v = localStorage.getItem(MOBILE_CATEGORY_KEY);
    if (v === 'attack' || v === 'serve_receive' || v === 'assist') return v;
  } catch {
    // ignore
  }
  return 'serve_receive';
}

// Mirrors the Game Day Live tab's card layout (SR square left, Assist
// middle, Attack/Kill/Error stacked right) and mobile-view toggle, but with
// no rotation/lineup concept: every roster player gets a card at once (no
// "6 on court" gating, no zones), there's no libero/sub banner, and no
// serve-score bar (no Zone 1 to tie a server to). Assist has no auto-credit
// default here either — with no rotation there's no back-row setter to
// infer from, so it's always a plain explicit tap for whoever set it.
export function PracticeTrackTab({ practice }: { practice: Practice }) {
  const [mobileView, setMobileView] = useState(readStoredMobileView);
  const [mobileCategory, setMobileCategory] = useState<MobileCategory>(readStoredMobileCategory);
  // null = "General" (no drill selected) — the default, and what every tap
  // recorded before this feature existed reads back as.
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(MOBILE_VIEW_KEY, mobileView ? '1' : '0');
    } catch {
      // ignore
    }
  }, [mobileView]);
  useEffect(() => {
    try {
      localStorage.setItem(MOBILE_CATEGORY_KEY, mobileCategory);
    } catch {
      // ignore
    }
  }, [mobileCategory]);

  const players = useLiveQuery(async () => {
    const { data } = await supabase.from('players').select('*').eq('active', true);
    return (data as Player[]) ?? [];
  }, []);
  const events = useLiveQuery(async () => {
    const { data } = await supabase
      .from('practiceStatEvents')
      .select('*')
      .eq('practiceId', practice.id)
      .order('createdAt', { ascending: false });
    return (data as PracticeStatEvent[]) ?? [];
  }, [practice.id]);
  const drills = useLiveQuery(async () => {
    if (practice.drillIds.length === 0) return [];
    const { data } = await supabase.from('drills').select('*').in('id', practice.drillIds);
    return (data as PracticeDrill[]) ?? [];
  }, [practice.drillIds.join(',')]);

  if (players === undefined || events === undefined || drills === undefined) return <p className="text-gray-500">Loading…</p>;

  const playersById = new Map(players.map((p) => [p.id, p]));
  const drillsById = new Map(drills.map((d) => [d.id, d]));
  const plannedDrills = practice.drillIds.map((id) => drillsById.get(id)).filter((d): d is PracticeDrill => !!d);
  const rosterPlayers = practice.rosterPlayerIds
    .map((id) => playersById.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  // Card counts/mobile list scope to whichever drill is selected (or
  // "General" — taps with no drill) so the numbers on screen mean "reps in
  // this drill today," not the whole practice's running total. Undo and the
  // Recent log stay unscoped — correcting the literal last tap (or any past
  // one) shouldn't depend on which drill happens to be selected right now.
  const scopedEvents = events.filter((e) => (e.drillId ?? null) === selectedDrillId);

  async function recordStat(playerId: string, statType: PracticeStatType, value?: number) {
    const event: PracticeStatEvent = {
      id: crypto.randomUUID(),
      practiceId: practice.id,
      playerId,
      statType,
      value,
      drillId: selectedDrillId ?? undefined,
      createdAt: new Date().toISOString(),
    };
    await supabase.from('practiceStatEvents').insert(event);
  }

  async function undoEvent(id: string) {
    await supabase.from('practiceStatEvents').delete().eq('id', id);
  }

  const lastEvent = events[0];
  const lastEventPlayer = lastEvent ? playersById.get(lastEvent.playerId) : undefined;
  const lastEventDrill = lastEvent?.drillId ? drillsById.get(lastEvent.drillId) : undefined;

  if (rosterPlayers.length === 0) {
    return <p className="text-sm text-gray-500">No players on this practice's roster.</p>;
  }

  return (
    <div>
      {plannedDrills.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-500 mb-1.5">Tracking for</div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedDrillId(null)}
              className={`min-h-9 px-3 rounded-lg text-xs font-medium border ${
                selectedDrillId === null ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              General
            </button>
            {plannedDrills.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDrillId(d.id)}
                className={`min-h-9 px-3 rounded-lg text-xs font-medium border ${
                  selectedDrillId === d.id ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setMobileView((v) => !v)}
          className={`min-h-9 px-3 rounded-lg text-sm font-medium border ${
            mobileView ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
          }`}
        >
          📱 Mobile view {mobileView ? 'On' : 'Off'}
        </button>
        {mobileView && (
          <div className="flex gap-1.5 flex-wrap">
            {MOBILE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setMobileCategory(c)}
                className={`min-h-9 px-2.5 rounded-lg text-xs font-medium border ${
                  mobileCategory === c ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {MOBILE_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => lastEvent && undoEvent(lastEvent.id)}
        disabled={!lastEvent}
        className="min-h-11 w-full mb-4 rounded-lg border-2 border-amber-400 bg-amber-100 text-amber-900 text-sm font-semibold active:bg-amber-200 disabled:opacity-40 disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
      >
        {lastEvent
          ? `↩ Undo last: ${GAME_STAT_LABELS[lastEvent.statType]}${lastEvent.value != null ? ` (${lastEvent.value})` : ''} — ${lastEventPlayer ? `${lastEventPlayer.firstName} ${lastEventPlayer.lastName}` : 'Unknown'}${lastEventDrill ? ` (${lastEventDrill.name})` : ''}`
          : '↩ Undo last (nothing recorded yet)'}
      </button>

      {mobileView ? (
        <PracticeMobileList
          players={rosterPlayers}
          events={scopedEvents}
          category={mobileCategory}
          onRecord={recordStat}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {rosterPlayers.map((player) => (
            <PracticeStatCard key={player.id} player={player} events={scopedEvents} onRecord={(t, v) => recordStat(player.id, t, v)} />
          ))}
        </div>
      )}

      {!mobileView && <RecentEvents events={events.slice(0, 15)} playersById={playersById} drillsById={drillsById} onUndo={undoEvent} />}
    </div>
  );
}

function PracticeStatCard({
  player,
  events,
  onRecord,
}: {
  player: Player;
  events: PracticeStatEvent[];
  onRecord: (statType: PracticeStatType, value?: number) => void;
}) {
  const roles = statRolesForPositions(player.positions);
  const showAttack = roles.hitter || roles.setter;
  const showServeReceive = roles.hitter || roles.passer;
  const srAvg = serveReceiveAverage(events, player.id);

  return (
    <div className="rounded-lg border border-gray-300 p-2 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="font-semibold text-gray-900 text-sm truncate">
          {player.firstName} {player.lastName}
        </span>
        <PositionBadges positions={player.positions} />
      </div>

      <div className="flex gap-1.5 items-stretch">
        {showServeReceive && (
          <div className="shrink-0 flex flex-col items-center gap-1">
            <span className="text-[10px] text-gray-700 font-semibold leading-none">
              SR{srAvg != null ? ` ${srAvg.toFixed(1)}` : ''}
            </span>
            <div className="grid grid-cols-2 gap-1 w-[72px]">
              {SR_RATINGS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onRecord('serve_receive', v)}
                  className={`min-h-9 rounded-md text-sm font-bold ${SR_RATING_COLOR_CLASSES[v]}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => onRecord('assist')}
          className="shrink-0 w-14 rounded-md bg-sky-600 active:bg-sky-700 text-white flex flex-col items-center justify-center gap-0.5"
        >
          <span className="text-[10px] font-semibold leading-none">Assist</span>
          <span className="text-base font-extrabold leading-none">{countEvents(events, player.id, 'assist')}</span>
        </button>

        {showAttack && (
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <StatButton
              label="Attempt"
              count={countEvents(events, player.id, 'attack_attempt')}
              onClick={() => onRecord('attack_attempt')}
              color="gray"
              stack
            />
            <StatButton
              label="Kill"
              count={countEvents(events, player.id, 'kill')}
              onClick={() => onRecord('kill')}
              color="green"
              stack
            />
            <StatButton
              label="Error"
              count={countEvents(events, player.id, 'attack_error')}
              onClick={() => onRecord('attack_error')}
              color="red"
              stack
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PracticeMobileList({
  players,
  events,
  category,
  onRecord,
}: {
  players: Player[];
  events: PracticeStatEvent[];
  category: MobileCategory;
  onRecord: (playerId: string, statType: PracticeStatType, value?: number) => void;
}) {
  const applicable = players.filter((player) => {
    const roles = statRolesForPositions(player.positions);
    if (category === 'attack') return roles.hitter || roles.setter;
    if (category === 'assist') return true; // everyone
    return roles.hitter || roles.passer; // serve_receive
  });

  if (applicable.length === 0) {
    return (
      <p className="text-sm text-gray-500 mb-4">
        No one on this roster tracks {MOBILE_CATEGORY_LABELS[category].toLowerCase()} right now.
      </p>
    );
  }

  return (
    <div className="space-y-2 mb-4">
      {applicable.map((player) => (
        <PracticeMobileRow
          key={player.id}
          player={player}
          events={events}
          category={category}
          onRecord={(t, v) => onRecord(player.id, t, v)}
        />
      ))}
    </div>
  );
}

function PracticeMobileRow({
  player,
  events,
  category,
  onRecord,
}: {
  player: Player;
  events: PracticeStatEvent[];
  category: MobileCategory;
  onRecord: (statType: PracticeStatType, value?: number) => void;
}) {
  const srAvg = serveReceiveAverage(events, player.id);
  return (
    <div className="rounded-lg border border-gray-300 p-3 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900">
          {player.firstName} {player.lastName}
        </span>
        {category === 'serve_receive' && srAvg != null && (
          <span className="text-sm font-semibold text-gray-600">{srAvg.toFixed(1)} avg</span>
        )}
      </div>

      {category === 'attack' && (
        <div className="flex gap-2">
          <StatButton label="Attempt" count={countEvents(events, player.id, 'attack_attempt')} onClick={() => onRecord('attack_attempt')} color="gray" large />
          <StatButton label="Kill" count={countEvents(events, player.id, 'kill')} onClick={() => onRecord('kill')} color="green" large />
          <StatButton label="Error" count={countEvents(events, player.id, 'attack_error')} onClick={() => onRecord('attack_error')} color="red" large />
        </div>
      )}

      {category === 'assist' && (
        <button
          type="button"
          onClick={() => onRecord('assist')}
          className="w-full min-h-14 rounded-lg bg-sky-600 active:bg-sky-700 text-white text-base font-semibold"
        >
          {GAME_STAT_LABELS.assist} <span className="font-extrabold text-lg">{countEvents(events, player.id, 'assist')}</span>
        </button>
      )}

      {category === 'serve_receive' && (
        <div className="grid grid-cols-2 gap-2">
          {SR_RATINGS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onRecord('serve_receive', v)}
              className={`min-h-16 rounded-lg text-2xl font-bold ${SR_RATING_COLOR_CLASSES[v]}`}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentEvents({
  events,
  playersById,
  drillsById,
  onUndo,
}: {
  events: PracticeStatEvent[];
  playersById: Map<string, Player>;
  drillsById: Map<string, PracticeDrill>;
  onUndo: (id: string) => void;
}) {
  if (events.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900 text-sm">Recent (tap ✕ to undo)</div>
      <ul className="divide-y divide-gray-100">
        {events.map((e) => {
          const p = playersById.get(e.playerId);
          const drill = e.drillId ? drillsById.get(e.drillId) : undefined;
          return (
            <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="text-gray-700">
                {p ? `${p.firstName} ${p.lastName}` : 'Unknown'} — {GAME_STAT_LABELS[e.statType]}
                {e.value != null ? ` (${e.value})` : ''}
                {drill && <span className="text-gray-400"> · {drill.name}</span>}
              </span>
              <button
                type="button"
                onClick={() => onUndo(e.id)}
                className="min-h-8 px-2.5 rounded-md bg-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-300 shrink-0"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
