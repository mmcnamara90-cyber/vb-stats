import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseQuery as useLiveQuery } from '../../lib/useSupabaseQuery';
import type { CourtZone, Game, GameLineup, GameStatEvent, GameStatType, Player } from '../../types';
import { zoneAssignmentsForRotation } from '../tryouts/lineupRotation';
import { PositionBadges } from '../tryouts/PositionBadges';
import { GAME_STAT_LABELS, countEvents, serveReceiveAverage, statRolesForPositions } from './gameStats';

const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;
// Net row first (where the action mostly is), then back row.
const ZONE_ORDER: CourtZone[] = [4, 3, 2, 5, 6, 1];

export function LiveStatsTab({ game }: { game: Game }) {
  const [setNumber, setSetNumber] = useState(1);
  const [rotation, setRotation] = useState<(typeof ROTATIONS)[number]>(1);

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

  const zoneAssignments = lineup?.zoneAssignments ?? {};
  const onCourt = rotation === 1 ? zoneAssignments : zoneAssignmentsForRotation(zoneAssignments, rotation);
  const onCourtCount = ZONE_ORDER.filter((z) => onCourt[z]).length;

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

  return (
    <div>
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
              setNumber === n ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'
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
              rotation === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {onCourtCount < 6 ? (
        <p className="text-sm text-gray-500">
          Set all 6 starting spots for Set {setNumber} on the Lineup tab first — {onCourtCount}/6 filled.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {ZONE_ORDER.map((zone) => {
            const playerId = onCourt[zone];
            const player = playerId ? playersById.get(playerId) : undefined;
            if (!player) return null;
            return (
              <PlayerStatCard
                key={zone}
                player={player}
                zone={zone}
                events={events}
                onRecord={(t, v) => recordStat(player.id, t, v)}
              />
            );
          })}
        </div>
      )}

      <RecentEvents events={events.slice(0, 15)} playersById={playersById} onUndo={undoEvent} />
    </div>
  );
}

function PlayerStatCard({
  player,
  zone,
  events,
  onRecord,
}: {
  player: Player;
  zone: CourtZone;
  events: GameStatEvent[];
  onRecord: (statType: GameStatType, value?: number) => void;
}) {
  const roles = statRolesForPositions(player.positions);
  const showServeReceive = roles.hitter || roles.passer;
  const srAvg = serveReceiveAverage(events, player.id);

  return (
    <div className="rounded-lg border border-gray-200 p-2">
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="text-[10px] text-gray-400 shrink-0">Z{zone}</span>
        <span className="font-medium text-gray-900 text-sm truncate">
          {player.firstName} {player.lastName}
        </span>
        <PositionBadges positions={player.positions} />
      </div>

      {roles.hitter && (
        <div className="flex gap-1.5 mb-1.5">
          <StatButton
            label="Attempt"
            count={countEvents(events, player.id, 'attack_attempt')}
            onClick={() => onRecord('attack_attempt')}
            color="gray"
          />
          <StatButton
            label="Kill"
            count={countEvents(events, player.id, 'kill')}
            onClick={() => onRecord('kill')}
            color="green"
          />
          <StatButton
            label="Error"
            count={countEvents(events, player.id, 'attack_error')}
            onClick={() => onRecord('attack_error')}
            color="red"
          />
        </div>
      )}

      {roles.setter && (
        <div className="flex gap-1.5 mb-1.5">
          <StatButton
            label={GAME_STAT_LABELS.set_attempt}
            count={countEvents(events, player.id, 'set_attempt')}
            onClick={() => onRecord('set_attempt')}
            color="gray"
          />
          <StatButton
            label={GAME_STAT_LABELS.assist}
            count={countEvents(events, player.id, 'assist')}
            onClick={() => onRecord('assist')}
            color="green"
          />
        </div>
      )}

      {showServeReceive && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 shrink-0 w-14">
            SR{srAvg != null ? ` ${srAvg.toFixed(1)}` : ''}
          </span>
          {[0, 1, 2, 3].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onRecord('serve_receive', v)}
              className="min-h-8 min-w-8 flex-1 rounded-md border border-gray-300 text-xs font-semibold text-gray-700 active:bg-gray-100"
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatButton({
  label,
  count,
  onClick,
  color,
}: {
  label: string;
  count: number;
  onClick: () => void;
  color: 'gray' | 'green' | 'red';
}) {
  const colorClasses: Record<typeof color, string> = {
    gray: 'border-gray-300 text-gray-700 active:bg-gray-100',
    green: 'border-emerald-300 text-emerald-700 active:bg-emerald-50',
    red: 'border-rose-300 text-rose-700 active:bg-rose-50',
  };
  return (
    <button type="button" onClick={onClick} className={`flex-1 min-h-9 rounded-md border text-xs font-medium ${colorClasses[color]}`}>
      {label} <span className="font-semibold">{count}</span>
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
                className="min-h-8 px-2 rounded-md border border-gray-300 text-xs text-gray-500 shrink-0"
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
