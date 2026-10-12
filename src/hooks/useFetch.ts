import { useState, useEffect, useCallback } from 'react';
type FetchState<T> = { data: T | null; error: string | null; loading: boolean };
// Fail-Safe contract: fetch failures resolve to { data: null, error } — never throws.
export const useFetch = <T,>(url: string, options?: RequestInit) => {
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, loading: true });
  const fetchData = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as T;
      setState({ data, error: null, loading: false });
    } catch (e: unknown) {
      setState({ data: null, error: String((e as Error)?.message || e), loading: false });
    }
  }, [url]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  return { ...state, refetch: fetchData };
};
