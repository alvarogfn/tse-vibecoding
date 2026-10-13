import { useCallback } from 'react';
import { useFetch } from '@/hooks/use-fetch.js';
import { parseSvgPaths } from '@/helpers/svg.js';
import type { SvgPath } from '@/lib/second-turn.js';

const FORCE_CACHE: RequestInit = { cache: 'force-cache' };

// Fail-Safe contract: SVG load failures resolve to { data, error } — never throws.
// Via useFetch com parser de texto (DOMParser): mesma shape { data, paths, error, loading, refetch }.
export const useSvgMap = (url: string, prefix: string) => {
  const parse = useCallback(
    async (res: Response): Promise<SvgPath[]> => {
      const paths = parseSvgPaths(await res.text(), prefix);
      if (paths.length === 0) console.warn(`[useSvgMap] 0 paths p/ prefixo "${prefix}" em ${url} — ids mudaram?`);
      return paths;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefix],
  );
  const { data, error, loading, refetch } = useFetch<SvgPath[]>(url, FORCE_CACHE, parse);
  return { data, paths: data ?? [], error, loading, refetch };
};
