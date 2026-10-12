import { useState, useEffect, useCallback } from 'react';
import type { SvgPath } from '../lib/second-turn.js';

// Fail-Safe contract: SVG load failures resolve to { data, error } — never throws.
// Cannot use useFetch because the payload is SVG text parsed via DOMParser,
// not JSON (useFetch only supports response.json()).
async function loadSvgPaths(url: string, prefix: string): Promise<SvgPath[]> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} no mapa`);
  const txt = await res.text();
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  const nodes = [...doc.querySelectorAll('path')].filter((p) =>
    (p.getAttribute('id') || '').startsWith(prefix),
  );
  return nodes.map((p) => ({
    id: p.getAttribute('id') || '',
    d: p.getAttribute('d') || '',
    title: p.getAttribute('title') || p.getAttribute('id') || '',
  }));
}

export const useSvgMap = (url: string, prefix: string) => {
  const [paths, setPaths] = useState<SvgPath[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const fetchData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const p = await loadSvgPaths(url, prefix);
      setPaths(p);
      setError(null);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }, [url, prefix]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadSvgPaths(url, prefix)
      .then((p) => {
        if (alive) {
          setPaths(p);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(String((e as Error)?.message || e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [url, prefix]);
  const data: SvgPath[] | null = paths;
  return { data, paths, error, loading, refetch: fetchData };
};
