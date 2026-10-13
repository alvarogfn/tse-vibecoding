import { useState, useEffect, useCallback, useRef } from 'react';

type FetchState<T> = { data: T | null; error: string | null; loading: boolean };

/** Parser padrão: JSON. Passe `parse` p/ outros formatos (ex. JWS via texto, SVG). */
const parseJson = <T,>(res: Response): Promise<T> => res.json() as Promise<T>;

// Fail-Safe contract: fetch failures resolve to { data: null, error } — never throws.
// `options` e `parse` entram nas deps: passe valores estáveis (consts de módulo
// ou memoizados) — literal inline recriado a cada render causaria refetch infinito.
export const useFetch = <T,>(url: string, options?: RequestInit, parse?: (res: Response) => Promise<T>) => {
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, loading: true });
  // Id da chamada vigente: respostas fora de ordem (retry manual + poll) são
  // descartadas — só a última resolve no estado (M4).
  const idRef = useRef(0);

  const fetchData = useCallback(async (): Promise<void> => {
    const id = idRef.current + 1;
    idRef.current = id;
    const alive = (): boolean => id === idRef.current;
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await (parse ?? parseJson<T>)(response);
      if (!alive()) return;
      setState({ data, error: null, loading: false });
    } catch (e: unknown) {
      if (!alive()) return;
      setState({ data: null, error: String((e as Error)?.message || e), loading: false });
    }
  }, [url, options, parse]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refetch: fetchData };
};
