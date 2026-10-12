import { useMemo } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import { MG_MUN_URL, svgMicroId } from '../../../lib/second-turn';
import type { IbgeMicroRaw, IbgeMunRaw, MgGeo } from '../../../lib/second-turn';

// Fail-Safe contract: IBGE fetch failures resolve to { data: null, error } — never throws.
// USES useFetch<IbgeMunRaw[]> (plain JSON via response.json()) + memoized transform
// nomes dos municípios + agrupamento mun → micro a partir do cache JSON bruto.
// O ViaCEP não oferece consulta IBGE → nome, então o cache foi gerado da API de
// localidades do IBGE (mesmo formato bruto, 1 request só no build, zero rate-limit em runtime).
export const useMgGeo = () => {
  const { data: raw, error, loading, refetch } = useFetch<IbgeMunRaw[]>(MG_MUN_URL, { cache: 'force-cache' });
  const data = useMemo<MgGeo | null>(() => {
    if (!raw) return null;
    const names: Record<string, string> = {};
    const munMicro: Record<string, string> = {};
    const microNames: Record<string, string> = {};
    for (const m of raw) {
      const ibge = String(m.id);
      names[ibge] = m.nome;
      const mi = m.microrregiao || {};
      if ((mi as IbgeMicroRaw).id && (mi as IbgeMicroRaw).mesorregiao) {
        const micro = mi as IbgeMicroRaw & { nome: string; mesorregiao: { id: number } };
        const svgId = svgMicroId(micro.id, micro.mesorregiao.id);
        munMicro[ibge] = svgId;
        microNames[svgId] = micro.nome;
      }
    }
    return { names, munMicro, microNames };
  }, [raw]);
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
