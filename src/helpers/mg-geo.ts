import type { IbgeMunRaw, MgGeo } from '@/lib/second-turn.js';

/** Converte id de microrregião do IBGE (ex. 31019 + meso 3105) p/ id no SVG (ex. micro_310519). Puro. */
export function svgMicroId(microId: number, mesoId: number): string {
  return `micro_31${String(mesoId % 100).padStart(2, '0')}${String(microId % 100).padStart(2, '0')}`;
}

interface IbgeMicroWithParents {
  id: number;
  nome: string;
  mesorregiao?: { id: number } | null;
}

/** Achata a resposta bruta do IBGE em nomes + agrupamento mun → micro. Puro, sem lifecycle. */
export function toGeo(raw: IbgeMunRaw[] | null): MgGeo | null {
  if (!raw) return null;
  const names: Record<string, string> = {};
  const munMicro: Record<string, string> = {};
  const microNames: Record<string, string> = {};
  for (const m of raw) {
    const ibge = String(m.id);
    names[ibge] = m.nome;
    const mi = (m.microrregiao || {}) as IbgeMicroWithParents;
    if (mi.id && mi.mesorregiao) {
      const svgId = svgMicroId(mi.id, mi.mesorregiao.id);
      munMicro[ibge] = svgId;
      microNames[svgId] = mi.nome;
    }
  }
  return { names, munMicro, microNames };
}
