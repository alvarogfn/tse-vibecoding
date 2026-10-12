import { useState, useEffect, useCallback } from 'react';

type FetchState<T> = { data: T | null; error: string | null; loading: boolean };

/** Parser padrão: JSON. Passe `parse` p/ outros formatos (ex. JWS via texto, SVG). */
const parseJson = <T,>(res: Response): Promise<T> => res.json() as Promise<T>;

// Fail-Safe contract: fetch failures resolve to { data: null, error } — never throws.
// `options` e `parse` entram nas deps: passe valores estáveis (consts de módulo
// ou memoizados) — literal inline recriado a cada render causaria refetch infinito.
export const useFetch = <T,>(url: string, options?: RequestInit, parse?: (res: Response) => Promise<T>) => {
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, loading: true });

  const fetchData = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await (parse ?? parseJson<T>)(response);
      setState({ data, error: null, loading: false });
    } catch (e: unknown) {
      setState({ data: null, error: String((e as Error)?.message || e), loading: false });
    }
  }, [url, options, parse]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
};
