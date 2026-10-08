import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal server-state hook: data / loading / error / refetch.
 *
 * `fetcher` must be stable (wrap it in useCallback) or listed via `deps`;
 * the effect re-runs whenever `deps` change.
 */
export function useFetch(fetcher, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (!mounted.current) return;
      setData(result?.data ?? result ?? null);
      setMeta(result?.meta ?? null);
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => { run(); }, [run]);

  return { data, meta, loading, error, refetch: run, setData };
}

export default useFetch;
