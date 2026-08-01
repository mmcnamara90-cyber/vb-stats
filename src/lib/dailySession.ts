import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Session, SessionType } from '../types';

export function todayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Cache in-flight get-or-create calls per (type, date) so concurrent mounts
// (e.g. React StrictMode's double effect invocation) can't race and create
// two sessions for the same day.
const getOrCreateCache = new Map<string, Promise<Session>>();

function getOrCreateSession(type: SessionType, date: string): Promise<Session> {
  const key = `${type}:${date}`;
  let promise = getOrCreateCache.get(key);
  if (!promise) {
    promise = db.transaction('rw', db.sessions, async () => {
      const existing = await db.sessions
        .where('type')
        .equals(type)
        .and((s) => s.date === date)
        .first();
      if (existing) return existing;
      const created: Session = { id: crypto.randomUUID(), type, date };
      await db.sessions.add(created);
      return created;
    });
    getOrCreateCache.set(key, promise);
  }
  return promise;
}

export function useTodaysSession(type: SessionType): Session | undefined {
  const date = todayIso();
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getOrCreateSession(type, date).then((session) => {
      if (!cancelled) setSessionId(session.id);
    });
    return () => {
      cancelled = true;
    };
  }, [type, date]);

  return useLiveQuery(async () => {
    if (!sessionId) return undefined;
    return db.sessions.get(sessionId);
  }, [sessionId]);
}
