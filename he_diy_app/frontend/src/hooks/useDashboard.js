import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDashboard } from "../lib/api.js";

/* One in-flight request at a time. A filter change supersedes the previous
   fetch rather than racing it, and the previous render is held (dimmed) while
   the new one loads so nothing jumps. */
export function useDashboard(filters) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const inflight = useRef(null);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setLoading(true);
    try {
      const payload = await fetchDashboard(filters, controller.signal);
      setData(payload);
      setError(null);
    } catch (exception) {
      if (exception.name !== "AbortError") setError(exception.message);
    } finally {
      if (inflight.current === controller) {
        inflight.current = null;
        setLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    load();
    return () => inflight.current?.abort();
  }, [load]);

  return { data, loading, error, reload: load };
}
