import { useEffect, useRef, useState } from 'react';
import { useRealtimeVersion } from './realtimeVersion';

// Drop-in-ish replacement for dexie-react-hooks' useLiveQuery: runs an async
// query function, returns its result (undefined while loading), and re-runs
// on dep changes or whenever any table changes (see realtimeVersion.ts).
export function useSupabaseQuery<T>(queryFn: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const version = useRealtimeVersion();
  const [result, setResult] = useState<T | undefined>(undefined);
  const callId = useRef(0);

  useEffect(() => {
    const id = ++callId.current;
    queryFn().then((r) => {
      if (id === callId.current) setResult(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return result;
}
