/**
 * election-predictor/weighting — pesquisas eleitorais do 2º turno p/ ponderar
 * o treino (puros, sem lifecycle). Novas pesquisas entram em WEIGHTING_POLLS
 * e os agregados abaixo passam a considerá-las automaticamente. Campos
 * desconhecidos ficam null (nunca chute): os agregados ignoram null e, sem
 * `n`, usam o n médio das demais como peso.
 */

export interface PollMigration {
  /** Fração do pool eliminado que migra p/ Flávio (ex. 0.46). */
  toFlavio: number | null;
  /** Fração que migra p/ Lula (ex. 0.32). */
  toLula: number | null;
  /** Fração que vira branco/nulo (ex. 0.15). */
  blankNull: number | null;
}

export interface PollStimulated {
  flavio: number | null;
  lula: number | null;
  /** Base da estimulada: totais (100 = válidos + brancos + nulos + indecisos) ou válidos. */
  base: 'total' | 'validos';
}

export interface PollValid {
  flavio: number | null;
  lula: number | null;
}

export interface PollEntry {
  institute: string;
  dates: string | null;
  n: number | null;
  marginPP: number | null;
  registry?: string;
  note?: string;
  stimulated: PollStimulated | null;
  valid: PollValid | null;
  migration: PollMigration | null;
  firstRound: { flavio: number; lula: number };
}

const FIRST_ROUND = { flavio: 47.03, lula: 45.16 };

export const DATAFOLHA_2T_2026_10_07: PollEntry = {
  institute: 'Datafolha',
  dates: '6–7/out/2026',
  n: 2520,
  marginPP: 2,
  registry: 'BR-02949/2026',
  stimulated: { flavio: 49, lula: 45, base: 'total' },
  valid: { flavio: 52, lula: 48 },
  migration: { toFlavio: 0.46, toLula: 0.32, blankNull: 0.15 },
  firstRound: { ...FIRST_ROUND },
};

export const IPESPE_2T_2026_10_10: PollEntry = {
  institute: 'Ipespe',
  dates: '10/out/2026',
  n: null,
  marginPP: null,
  note: 'Válidos: Lula 47,3 × Flávio 52,7 (mais recente dos 4 no mesmo intervalo).',
  stimulated: null,
  valid: { flavio: 52.7, lula: 47.3 },
  migration: null,
  firstRound: { ...FIRST_ROUND },
};

export const VOX_2T_2026_10_1SEM: PollEntry = {
  institute: 'Vox',
  dates: '1ª semana/2º turno',
  n: null,
  marginPP: null,
  note: 'Único com Lula à frente no número: 44,2 × 42,7 em EMPATE TÉCNICO — base TOTAL de entrevistados, não votos válidos (não entra na média de válidos).',
  stimulated: { flavio: 42.7, lula: 44.2, base: 'total' },
  valid: null,
  migration: null,
  firstRound: { ...FIRST_ROUND },
};

export const PODERDATA_AYA_2T_2026_10_1SEM: PollEntry = {
  institute: 'PoderData/Aya',
  dates: '1ª semana/2º turno',
  n: null,
  marginPP: null,
  note: 'Sem ficha exata divulgada: Lula entre 47–48 × Flávio 52–53 nos válidos. Aguardando números p/ entrar nas médias.',
  stimulated: null,
  valid: null,
  migration: null,
  firstRound: { ...FIRST_ROUND },
};

export const ATLASINTEL_2T_2026_10_1SEM: PollEntry = {
  institute: 'AtlasIntel',
  dates: '1ª semana/2º turno',
  n: null,
  marginPP: null,
  note: 'Sem ficha exata divulgada: Lula entre 47–48 × Flávio 52–53 nos válidos. Aguardando números p/ entrar nas médias.',
  stimulated: null,
  valid: null,
  migration: null,
  firstRound: { ...FIRST_ROUND },
};

/** Todas as pesquisas 2T conhecidas — este array é o que você vai popular. */
export const WEIGHTING_POLLS: PollEntry[] = [
  DATAFOLHA_2T_2026_10_07,
  IPESPE_2T_2026_10_10,
  VOX_2T_2026_10_1SEM,
  PODERDATA_AYA_2T_2026_10_1SEM,
  ATLASINTEL_2T_2026_10_1SEM,
];

/** Peso efetivo: n declarado, senão o n médio das demais (nunca 0). */
function pollWeight(p: PollEntry, avgN: number): number {
  if (p.n != null && Number.isFinite(p.n) && p.n > 0) return p.n;
  return avgN > 0 ? avgN : 1;
}

function averageN(polls: PollEntry[]): number {
  const ns = polls
    .map((p) => p.n)
    .filter((n): n is number => n != null && Number.isFinite(n) && n > 0);
  if (ns.length === 0) return 1;
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}

function weightedMean(polls: PollEntry[], pick: (p: PollEntry) => number | null, fallback: number): number {
  const avgN = averageN(polls);
  let tw = 0;
  let sw = 0;
  for (const p of polls) {
    const v = pick(p);
    if (v == null || !Number.isFinite(v)) continue;
    const w = pollWeight(p, avgN);
    tw += w;
    sw += v * w;
  }
  return tw > 0 ? sw / tw : fallback;
}

/** Prior nacional de share do Lula (votos válidos), ponderado pelo n. */
export function pollValidLula(polls: PollEntry[] = WEIGHTING_POLLS): number {
  return weightedMean(polls, (p) => p.valid?.lula ?? null, 48);
}

/** Taxas de migração ponderadas pelo n (p/ converter 3º/4º/5º lugares). */
export function migrationRates(polls: PollEntry[] = WEIGHTING_POLLS): { toFlavio: number; toLula: number } {
  return {
    toFlavio: weightedMean(polls, (p) => p.migration?.toFlavio ?? null, 0.46),
    toLula: weightedMean(polls, (p) => p.migration?.toLula ?? null, 0.32),
  };
}

/** Margem de erro ponderada (pp) p/ a banda de conversão. */
export function pollMarginPP(polls: PollEntry[] = WEIGHTING_POLLS): number {
  return weightedMean(polls, (p) => p.marginPP, 2);
}
