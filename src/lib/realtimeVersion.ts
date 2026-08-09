import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// One global counter, bumped whenever ANY row in ANY app table changes
// (insert/update/delete), via a single realtime subscription covering the
// whole public schema. Queries that depend on this version re-run whenever
// it changes — a coarse but simple stand-in for Dexie's automatic
// dependency-tracked liveQuery, appropriate at this app's data volume.
let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  for (const listener of listeners) listener();
}

supabase
  .channel('db-changes')
  .on('postgres_changes', { event: '*', schema: 'public' }, bump)
  .subscribe();

export function useRealtimeVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => {
    const listener = () => setV(version);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return v;
}
