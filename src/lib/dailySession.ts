import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useSupabaseQuery } from './useSupabaseQuery';
import type { Session, SessionType, TryoutLevel } from '../types';

export function todayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Cache in-flight get-or-create calls per (type, date) so concurrent mounts
// can't race and create two sessions for the same day from the same tab.
const getOrCreateCache = new Map<string, Promise<Session>>();

// Gets (or creates) the one session for a given type+date — same "one
// session per day" model `useTodaysSession` relies on, but for an arbitrary
// date (e.g. importing a past tryout day's CSV, not necessarily today).
// When `level` is passed and the session doesn't already have one set, it's
// upserted — imported scores need a level for benchmarks/radar to scope by.
export function getOrCreateSessionForDate(
  type: SessionType,
  date: string,
  level?: TryoutLevel,
): Promise<Session> {
  const key = `${type}:${date}`;
  let promise = getOrCreateCache.get(key);
  if (!promise) {
    promise = (async () => {
      const { data: existing } = await supabase
        .from('sessions')
        .select('*')
        .eq('type', type)
        .eq('date', date)
        .maybeSingle();
      if (existing) return existing as Session;

      const created: Session = { id: crypto.randomUUID(), type, date };
      const { error } = await supabase.from('sessions').insert(created);
      if (error) throw error;
      return created;
    })();
    getOrCreateCache.set(key, promise);
  }
  return promise.then(async (session) => {
    if (level && !session.level) {
      await supabase.from('sessions').update({ level }).eq('id', session.id);
      return { ...session, level };
    }
    return session;
  });
}

function getOrCreateSession(type: SessionType, date: string): Promise<Session> {
  return getOrCreateSessionForDate(type, date);
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

  return useSupabaseQuery(async () => {
    if (!sessionId) return undefined;
    const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
    return (data as Session) ?? undefined;
  }, [sessionId]);
}
