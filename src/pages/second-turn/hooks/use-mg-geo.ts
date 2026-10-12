import { useMemo, useCallback } from 'react';
import { useFetch } from '@/hooks/use-fetch.js';
import { useMgMunicipalitiesFindAll } from '@/hooks/use-mg-municipalities-find-all.js';
import { MG_MUN_URL } from '@/lib/second-turn.js';
import type { IbgeMunRaw, MgGeo } from '@/lib/second-turn.js';
import { toGeo } from '@/helpers/mg-geo.js';

const FORCE_CACHE: RequestInit = { cache: 'force-cache' };

// Fail-Safe contract: failures resolve to error state — never throws.
// Remoto primeiro (useMgMunicipalitiesFindAll → useFetch, endpoint canônico do
// IBGE); fallback p/ o cache local em JSON bruto (tarefa 3) se o remoto falhar.
export const useMgGeo = () => {
  const remote = useMgMunicipalitiesFindAll();
  const local = useFetch<IbgeMunRaw[]>(MG_MUN_URL, FORCE_CACHE);

  const raw = remote.data ?? local.data;
  const data = useMemo<MgGeo | null>(() => toGeo(raw), [raw]);
  const error = !raw ? (remote.error ?? local.error ?? null) : null;
  const loading = !raw && (remote.loading || local.loading);

  const refetch = useCallback(async (): Promise<void> => {
    await remote.refetch();
    await local.refetch();
  }, [remote.refetch, local.refetch]);

  return {
    data,
    error,
    loading,
    refetch,
    names: data?.names ?? {},
    munMicro: data?.munMicro ?? {},
    microNames: data?.microNames ?? {},
  };
};
