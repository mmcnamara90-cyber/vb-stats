import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useSupabaseQuery } from './useSupabaseQuery';
import type { Session, SessionType } from '../types';

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

function getOrCreateSession(type: SessionType, date: string): Promise<Session> {
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

  return useSupabaseQuery(async () => {
    if (!sessionId) return undefined;
    const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
    return (data as Session) ?? undefined;
  }, [sessionId]);
}
