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

export { db };
