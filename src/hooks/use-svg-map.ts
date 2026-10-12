import { useCallback } from 'react';
import { useFetch } from './use-fetch.js';
import { parseSvgPaths } from '../helpers/svg.js';
import type { SvgPath } from '../lib/second-turn.js';

const FORCE_CACHE: RequestInit = { cache: 'force-cache' };

// Fail-Safe contract: SVG load failures resolve to { data, error } — never throws.
// Via useFetch com parser de texto (DOMParser): mesma shape { data, paths, error, loading, refetch }.
export const useSvgMap = (url: string, prefix: string) => {
  const parse = useCallback((res: Response): Promise<SvgPath[]> => res.text().then((t) => parseSvgPaths(t, prefix)), [
    prefix,
  ]);
  const { data, error, loading, refetch } = useFetch<SvgPath[]>(url, FORCE_CACHE, parse);
  return { data, paths: data ?? [], error, loading, refetch };
};
