/**
 * helpers/regions — UFs por região do IBGE (puro, sem lifecycle).
 * Ordem oficial: Norte, Nordeste, Centro-Oeste, Sudeste, Sul.
 */

export type RegionSigla = 'N' | 'NE' | 'CO' | 'SE' | 'S';

interface RegionInfo {
  sigla: RegionSigla;
  label: string;
  ufs: string[];
}

export const REGIONS: RegionInfo[] = [
  { sigla: 'N', label: 'Norte', ufs: ['ac', 'ap', 'am', 'pa', 'ro', 'rr', 'to'] },
  { sigla: 'NE', label: 'Nordeste', ufs: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'] },
  { sigla: 'CO', label: 'Centro-Oeste', ufs: ['df', 'go', 'mt', 'ms'] },
  { sigla: 'SE', label: 'Sudeste', ufs: ['es', 'mg', 'rj', 'sp'] },
  { sigla: 'S', label: 'Sul', ufs: ['pr', 'rs', 'sc'] },
];

const UF_TO_REGION: Record<string, RegionSigla> = Object.fromEntries(
  REGIONS.flatMap((r) => r.ufs.map((uf) => [uf, r.sigla])),
) as Record<string, RegionSigla>;

/** Região de uma UF (sigla minúscula, ex. 'mg') — null se desconhecida. */
export function ufRegionOf(uf: string): RegionSigla | null {
  return UF_TO_REGION[uf.toLowerCase()] ?? null;
}
