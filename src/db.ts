import Dexie, { type EntityTable } from 'dexie';
import type {
  Player,
  Session,
  TryoutDrill,
  PlayerGroup,
  DrillRun,
  SkillScore,
  Note,
  RosterDecision,
  Lineup,
  StatEvent,
  Drill,
  PracticePlan,
  Benchmark,
  PositionTarget,
  RosterCandidate,
} from './types';

const db = new Dexie('VolleyballCoachDB') as Dexie & {
  players: EntityTable<Player, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  tryoutDrills: EntityTable<TryoutDrill, 'id'>;
  playerGroups: EntityTable<PlayerGroup, 'id'>;
  drillRuns: EntityTable<DrillRun, 'id'>;
  skillScores: EntityTable<SkillScore, 'id'>;
  notes: EntityTable<Note, 'id'>;
  rosterDecisions: EntityTable<RosterDecision, 'id'>;
  lineups: EntityTable<Lineup, 'id'>;
  statEvents: EntityTable<StatEvent, 'id'>;
  drills: EntityTable<Drill, 'id'>;
  practicePlans: EntityTable<PracticePlan, 'id'>;
  benchmarks: EntityTable<Benchmark, 'id'>;
  positionTargets: EntityTable<PositionTarget, 'id'>;
  rosterCandidates: EntityTable<RosterCandidate, 'id'>;
};

db.version(3).stores({
  players: 'id, active, lastName, gradYear, primaryPosition',
  sessions: 'id, type, date',
  tryoutDrills: 'id, skill, name',
  playerGroups: 'id, name',
  drillRuns: 'id, drillId, sessionId',
  skillScores: 'id, playerId, sessionId, skill, drillId, scoredAt',
  notes: 'id, playerId, sessionId, createdAt',
  rosterDecisions: 'id, playerId, tryoutCycleId',
  lineups: 'id, gameId, setNumber',
  statEvents: 'id, gameId, setNumber, playerId, statType, timestamp',
  drills: 'id, name',
  practicePlans: 'id, sessionId',
});

// v4: players.primaryPosition/secondaryPosition -> players.positions[];
// L and DS merge into the single DS_L tag; sessions gain a level field;
// new benchmarks table for per-position/skill/level targets.
db.version(4)
  .stores({
    players: 'id, active, lastName, gradYear, *positions',
    sessions: 'id, type, date, level',
    tryoutDrills: 'id, skill, name',
    playerGroups: 'id, name',
    drillRuns: 'id, drillId, sessionId',
    skillScores: 'id, playerId, sessionId, skill, drillId, scoredAt',
    notes: 'id, playerId, sessionId, createdAt',
    rosterDecisions: 'id, playerId, tryoutCycleId',
    lineups: 'id, gameId, setNumber',
    statEvents: 'id, gameId, setNumber, playerId, statType, timestamp',
    drills: 'id, name',
    practicePlans: 'id, sessionId',
    benchmarks: 'id, position, skill, level',
  })
  .upgrade(async (tx) => {
    const mapPosition = (pos: string) => (pos === 'L' || pos === 'DS' ? 'DS_L' : pos);
    await tx
      .table('players')
      .toCollection()
      .modify((p: Record<string, unknown>) => {
        const positions: string[] = [];
        if (typeof p.primaryPosition === 'string') positions.push(mapPosition(p.primaryPosition));
        if (typeof p.secondaryPosition === 'string') {
          const mapped = mapPosition(p.secondaryPosition);
          if (!positions.includes(mapped)) positions.push(mapped);
        }
        p.positions = positions;
        delete p.primaryPosition;
        delete p.secondaryPosition;
      });
  });

// v5: roster-building — per-team position targets and candidate shortlists.
db.version(5).stores({
  players: 'id, active, lastName, gradYear, *positions',
  sessions: 'id, type, date, level',
  tryoutDrills: 'id, skill, name',
  playerGroups: 'id, name',
  drillRuns: 'id, drillId, sessionId',
  skillScores: 'id, playerId, sessionId, skill, drillId, scoredAt',
  notes: 'id, playerId, sessionId, createdAt',
  rosterDecisions: 'id, playerId, tryoutCycleId',
  lineups: 'id, gameId, setNumber',
  statEvents: 'id, gameId, setNumber, playerId, statType, timestamp',
  drills: 'id, name',
  practicePlans: 'id, sessionId',
  benchmarks: 'id, position, skill, level',
  positionTargets: 'id, team, position',
  rosterCandidates: 'id, team, position, playerId, status',
});

export { db };
