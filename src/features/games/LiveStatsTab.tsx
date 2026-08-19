import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { CourtZone, Game, GameLineup, GameStatEvent, GameStatType, Player } from '../../types';
import { PositionBadges } from '../tryouts/PositionBadges';
import { GAME_STAT_LABELS, countEvents, serveAverage, serveReceiveAverage, statRolesForPositions } from './gameStats';
import { computeEffectiveCourt } from './effectiveCourt';

const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;
// Net row first (where the action mostly is), then back row.
const ZONE_ORDER: CourtZone[] = [4, 3, 2, 5, 6, 1];

type MobileCategory = 'attack' | 'serve_receive' | 'assist';
const MOBILE_CATEGORIES: MobileCategory[] = ['serve_receive', 'attack', 'assist'];
const MOBILE_CATEGORY_LABELS: Record<MobileCategory, string> = {
  attack: 'Attack',
  serve_receive: 'Serve Receive',
  assist: 'Assist',
};

// Device-level preference — a coach handing their phone to an assistant to
// track just serve receive shouldn't have to re-toggle this every time the
// page reloads mid-game.
const MOBILE_VIEW_KEY = 'vb-stats-mobile-view';
const MOBILE_CATEGORY_KEY = 'vb-stats-mobile-category';

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

export function LiveStatsTab({ game }: { game: Game }) {
  const [setNumber, setSetNumber] = useState(1);
  const [rotation, setRotation] = useState<(typeof ROTATIONS)[number]>(1);
  const [mobileView, setMobileView] = useState(readStoredMobileView);
  const [mobileCategory, setMobileCategory] = useState<MobileCategory>(readStoredMobileCategory);

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
  const lineups = useLiveQuery(async () => {
    const { data } = await supabase.from('gameLineups').select('*').eq('gameId', game.id).order('setNumber');
    return (data as GameLineup[]) ?? [];
  }, [game.id]);
  const events = useLiveQuery(async () => {
    const { data } = await supabase
      .from('gameStatEvents')
      .select('*')
      .eq('gameId', game.id)
      .eq('setNumber', setNumber)
      .order('createdAt', { ascending: false });
    return (data as GameStatEvent[]) ?? [];
  }, [game.id, setNumber]);

  if (players === undefined || lineups === undefined || events === undefined) {
    return <p className="text-gray-500">Loading…</p>;
  }

  const playersById = new Map(players.map((p) => [p.id, p]));
  const lineup = lineups.find((l) => l.setNumber === setNumber);
  const setNumbers = [...new Set([1, setNumber, ...lineups.map((l) => l.setNumber)])].sort((a, b) => a - b);

  const effective = computeEffectiveCourt(
    lineup ?? { zoneAssignments: {}, subs: [], liberos: [] },
    rotation,
  );
  const onCourt = effective.zoneAssignments;
  const onCourtCount = ZONE_ORDER.filter((z) => onCourt[z]).length;
  const serverId = onCourt[1];
  const server = serverId ? playersById.get(serverId) : undefined;

  async function recordStat(playerId: string, statType: GameStatType, value?: number) {
    const event: GameStatEvent = {
      id: crypto.randomUUID(),
      gameId: game.id,
      setNumber,
      playerId,
      statType,
      value,
      rotation,
      createdAt: new Date().toISOString(),
    };
    await supabase.from('gameStatEvents').insert(event);
  }

  async function undoEvent(id: string) {
    await supabase.from('gameStatEvents').delete().eq('id', id);
  }

  const lastEvent = events[0];
  const lastEventPlayer = lastEvent ? playersById.get(lastEvent.playerId) : undefined;

  const onCourtZones = ZONE_ORDER.filter((z) => onCourt[z]);

  return (
    <div>
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

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-medium text-gray-500">Set:</span>
        {setNumbers.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setSetNumber(n);
              setRotation(1);
            }}
            className={`min-h-9 px-3 rounded-lg text-sm font-medium border ${
              setNumber === n ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-medium text-gray-500">Rotation:</span>
        {ROTATIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRotation(r)}
            className={`min-h-9 px-3 rounded-lg text-sm font-medium border ${
              rotation === r ? 'bg-brand-indigo text-white border-brand-indigo' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Serve score — whoever's in Zone 1 this rotation is the server;
          rotation determines the server, not a separate selection. */}
      {server && (
        <ServeScoreBar
          server={server}
          serveAvg={serveAverage(events, server.id)}
          onRecord={(v) => recordStat(server.id, 'serve', v)}
        />
      )}

      <button
        type="button"
        onClick={() => lastEvent && undoEvent(lastEvent.id)}
        disabled={!lastEvent}
        className="min-h-11 w-full mb-4 rounded-lg border-2 border-amber-400 bg-amber-100 text-amber-900 text-sm font-semibold active:bg-amber-200 disabled:opacity-40 disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
      >
        {lastEvent
          ? `↩ Undo last: ${GAME_STAT_LABELS[lastEvent.statType]}${lastEvent.value != null ? ` (${lastEvent.value})` : ''} — ${lastEventPlayer ? `${lastEventPlayer.firstName} ${lastEventPlayer.lastName}` : 'Unknown'}`
          : '↩ Undo last (nothing recorded yet)'}
      </button>

      {!mobileView && (effective.activeSubs.length > 0 || effective.liberosOnCourt.length > 0) && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 mb-3 text-xs text-violet-900 space-y-0.5">
          {effective.activeSubs.map((s) => (
            <p key={s.id}>
              🔁 {playersById.get(s.inPlayerId)?.firstName ?? 'Unknown'} in for{' '}
              {playersById.get(s.outPlayerId)?.firstName ?? 'Unknown'} (since Rotation {s.effectiveRotation})
            </p>
          ))}
          {effective.liberosOnCourt.map((l) => (
            <p key={l.liberoAssignmentId}>
              🛡 Libero {playersById.get(l.liberoPlayerId)?.firstName ?? ''} in at Zone {l.zone} (for{' '}
              {playersById.get(l.shadowedPlayerId)?.firstName ?? 'Unknown'})
              {l.serving ? ' — serving this rotation 🎯' : ''}
            </p>
          ))}
          {effective.liberoConflict && (
            <p className="font-semibold text-amber-700">
              ⚠️ Two liberos on court at once — NFHS only allows one at a time.
            </p>
          )}
        </div>
      )}

      {onCourtCount < 6 ? (
        <p className="text-sm text-gray-500">
          Set all 6 starting spots for Set {setNumber} on the Lineup tab first — {onCourtCount}/6 filled.
        </p>
      ) : mobileView ? (
        <MobileStatList
          zones={onCourtZones}
          onCourt={onCourt}
          playersById={playersById}
          events={events}
          category={mobileCategory}
          liberosOnCourt={effective.liberosOnCourt}
          onRecord={recordStat}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {onCourtZones.map((zone) => {
            const playerId = onCourt[zone];
            const player = playerId ? playersById.get(playerId) : undefined;
            if (!player) return null;
            const activeLibero = effective.liberosOnCourt.find((l) => l.zone === zone);
            return (
              <PlayerStatCard
                key={zone}
                player={player}
                zone={zone}
                events={events}
                isLibero={!!activeLibero}
                isServing={!!activeLibero?.serving}
                onRecord={(t, v) => recordStat(player.id, t, v)}
              />
            );
          })}
        </div>
      )}

      {!mobileView && <RecentEvents events={events.slice(0, 15)} playersById={playersById} onUndo={undoEvent} />}
    </div>
  );
}

// ===== Serve score — top of the tracking area, tied to the current server =====

function ServeScoreBar({
  server,
  serveAvg,
  onRecord,
}: {
  server: Player;
  serveAvg: number | undefined;
  onRecord: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border-2 border-brand-indigo bg-white px-3 py-2 mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-brand-indigo">
          🏐 Serving: {server.firstName} {server.lastName}
        </span>
        {serveAvg != null && <span className="text-xs font-medium text-gray-600">{serveAvg.toFixed(1)} avg</span>}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {SR_RATINGS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onRecord(v)}
            className={`min-h-10 rounded-md text-base font-bold ${SR_RATING_COLOR_CLASSES[v]}`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

// ===== Desktop / iPad view: two-column grid; SR square (left) — Assist
// (middle) — Attack/Kill/Error stacked (right, wider than the SR square) =====

function PlayerStatCard({
  player,
  zone,
  events,
  isLibero,
  isServing,
  onRecord,
}: {
  player: Player;
  zone: CourtZone;
  events: GameStatEvent[];
  isLibero: boolean;
  isServing: boolean;
  onRecord: (statType: GameStatType, value?: number) => void;
}) {
  const roles = statRolesForPositions(player.positions);
  // A libero can't attack, regardless of what position she's normally
  // tagged (e.g. a DS_L/OPP player playing libero this rotation) — hide
  // the attack block rather than show buttons for a play that can't
  // legally happen right now. Setters get attack options too now.
  const showAttack = (roles.hitter || roles.setter) && !isLibero;
  const showServeReceive = roles.hitter || roles.passer || isLibero;
  const srAvg = serveReceiveAverage(events, player.id);

  return (
    <div className={`rounded-lg border p-2 bg-white shadow-sm ${isLibero ? 'border-violet-400' : 'border-gray-300'}`}>
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="text-[10px] text-gray-500 font-medium shrink-0">Z{zone}</span>
        <span className="font-semibold text-gray-900 text-sm truncate">
          {player.firstName} {player.lastName}
        </span>
        <PositionBadges positions={player.positions} />
        {isLibero && (
          <span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700">
            🛡 Libero{isServing ? ' · serving' : ''}
          </span>
        )}
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

        {/* Assist — available to every on-court player, sits between serve
            receive and the hitting boxes. Used to redirect credit when the
            back-row setter wasn't the one who actually set the ball. */}
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

// ===== Mobile view: one stat category at a time, big touch targets =====

function MobileStatList({
  zones,
  onCourt,
  playersById,
  events,
  category,
  liberosOnCourt,
  onRecord,
}: {
  zones: CourtZone[];
  onCourt: Partial<Record<CourtZone, string>>;
  playersById: Map<string, Player>;
  events: GameStatEvent[];
  category: MobileCategory;
  liberosOnCourt: { zone: CourtZone }[];
  onRecord: (playerId: string, statType: GameStatType, value?: number) => void;
}) {
  const rows = zones
    .map((zone) => {
      const playerId = onCourt[zone];
      const player = playerId ? playersById.get(playerId) : undefined;
      if (!player) return null;
      const isLibero = liberosOnCourt.some((l) => l.zone === zone);
      return { zone, player, isLibero };
    })
    .filter((r): r is { zone: CourtZone; player: Player; isLibero: boolean } => r !== null);

  const applicableRows = rows.filter(({ player, isLibero }) => {
    const roles = statRolesForPositions(player.positions);
    if (category === 'attack') return (roles.hitter || roles.setter) && !isLibero;
    if (category === 'assist') return true; // everyone
    return roles.hitter || roles.passer || isLibero; // serve_receive
  });

  if (applicableRows.length === 0) {
    return (
      <p className="text-sm text-gray-500 mb-4">
        No one currently on court tracks {MOBILE_CATEGORY_LABELS[category].toLowerCase()} right now.
      </p>
    );
  }

  return (
    <div className="space-y-2 mb-4">
      {applicableRows.map(({ zone, player, isLibero }) => (
        <MobileStatRow
          key={zone}
          player={player}
          zone={zone}
          events={events}
          category={category}
          isLibero={isLibero}
          onRecord={(t, v) => onRecord(player.id, t, v)}
        />
      ))}
    </div>
  );
}

function MobileStatRow({
  player,
  zone,
  events,
  category,
  isLibero,
  onRecord,
}: {
  player: Player;
  zone: CourtZone;
  events: GameStatEvent[];
  category: MobileCategory;
  isLibero: boolean;
  onRecord: (statType: GameStatType, value?: number) => void;
}) {
  const srAvg = serveReceiveAverage(events, player.id);
  return (
    <div className={`rounded-lg border p-3 bg-white shadow-sm ${isLibero ? 'border-violet-400' : 'border-gray-300'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900">
          {player.firstName} {player.lastName}
          <span className="text-xs text-gray-400 font-normal ml-1.5">Z{zone}</span>
          {isLibero && <span className="text-xs text-violet-600 font-normal ml-1.5">🛡 Libero</span>}
        </span>
        {category === 'serve_receive' && srAvg != null && (
          <span className="text-sm font-semibold text-gray-600">{srAvg.toFixed(1)} avg</span>
        )}
      </div>

      {category === 'attack' && (
        <div className="flex gap-2">
          <StatButton
            label="Attempt"
            count={countEvents(events, player.id, 'attack_attempt')}
            onClick={() => onRecord('attack_attempt')}
            color="gray"
            large
          />
          <StatButton
            label="Kill"
            count={countEvents(events, player.id, 'kill')}
            onClick={() => onRecord('kill')}
            color="green"
            large
          />
          <StatButton
            label="Error"
            count={countEvents(events, player.id, 'attack_error')}
            onClick={() => onRecord('attack_error')}
            color="red"
            large
          />
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

// Filled, high-contrast buttons — easy to read/tap at a glance during live
// play. Serve-receive/serve ratings are color-coded by quality (0 = bad,
// 3 = perfect), matching the common coaching-scoresheet convention.
const SR_RATINGS = [0, 1, 2, 3] as const;
const SR_RATING_COLOR_CLASSES: Record<(typeof SR_RATINGS)[number], string> = {
  0: 'bg-rose-600 text-white active:bg-rose-700',
  1: 'bg-orange-500 text-white active:bg-orange-600',
  2: 'bg-amber-400 text-gray-900 active:bg-amber-500',
  3: 'bg-emerald-600 text-white active:bg-emerald-700',
};

function StatButton({
  label,
  count,
  onClick,
  color,
  large,
  stack,
}: {
  label: string;
  count: number;
  onClick: () => void;
  color: 'gray' | 'green' | 'red';
  large?: boolean;
  stack?: boolean;
}) {
  const colorClasses: Record<typeof color, string> = {
    gray: 'bg-slate-600 active:bg-slate-700',
    green: 'bg-emerald-600 active:bg-emerald-700',
    red: 'bg-rose-600 active:bg-rose-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${stack ? 'w-full' : 'flex-1'} rounded-md font-semibold text-white ${colorClasses[color]} ${
        large ? 'min-h-14 text-base' : 'min-h-9 text-xs'
      }`}
    >
      {label} <span className={large ? 'font-extrabold text-lg' : 'font-bold'}>{count}</span>
    </button>
  );
}

function RecentEvents({
  events,
  playersById,
  onUndo,
}: {
  events: GameStatEvent[];
  playersById: Map<string, Player>;
  onUndo: (id: string) => void;
}) {
  if (events.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 font-semibold text-gray-900 text-sm">Recent (tap ✕ to undo)</div>
      <ul className="divide-y divide-gray-100">
        {events.map((e) => {
          const p = playersById.get(e.playerId);
          return (
            <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="text-gray-700">
                {p ? `${p.firstName} ${p.lastName}` : 'Unknown'} — {GAME_STAT_LABELS[e.statType]}
                {e.value != null ? ` (${e.value})` : ''}
                <span className="text-xs text-gray-400 ml-1">R{e.rotation}</span>
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
