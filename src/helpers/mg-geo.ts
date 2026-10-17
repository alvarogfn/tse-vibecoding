import type { IbgeMunRaw, MgGeo } from '@/lib/second-turn.js';

/** Achata a resposta bruta do IBGE em nomes por IBGE. Puro, sem lifecycle. */
export function toGeo(raw: IbgeMunRaw[] | null): MgGeo | null {
  if (!raw) return null;
  const names: Record<string, string> = {};
  for (const m of raw) {
    const ibge = String(m.id);
    names[ibge] = m.nome;
  }
  return { names };
}
