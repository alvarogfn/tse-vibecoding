/**
 * election-predictor/transfer — priors eleitorais p/ o 2º turno (puros).
 *
 * Fonte: Datafolha 6–7/out/2026 (n=2520, margem 2pp, 95% confiança; 1º turno
 * 4/out: Flávio 47,03% × Lula 45,16% dos válidos — menor diferença já registrada):
 * - Migração dos votos de Cury/Santos/Caiado/Zema: 46% Flávio, 32% Lula,
 *   15% branco/nulo (restante indecisos/sem resposta).
 * - Estimulada 2T: Flávio 49 × Lula 45 (branco/nulo 5%, indecisos 1%).
 * - Válidos: Flávio 52 × Lula 48.
 *
 * Uso: ajustar a âncora estrutural (resultado 1T) pela transferência esperada
 * dos eliminados, em vez de projetar a repetição crua do 1º turno.
 */

export const TRANSFER_TO_FLAVIO = 0.46;
export const TRANSFER_TO_LULA = 0.32;

/** Margem de erro do Datafolha (2pp, 95% confiança) aplicada à conversão. */
export const TRANSFER_MARGIN_PP = 2;

export interface ConvertedPool {
  /** Pontos que o pool eliminado rende (ex. Lula). */
  points: number;
  /** Banda ±margem: [lo, hi]. */
  lo: number;
  hi: number;
}

/**
 * Converte o pool eliminado (3º/4º/5º… lugares, em pp dos válidos) pela taxa
 * de migração, com banda de ±2pp. Ex.: pool 7,81pp × 0,32 → Lula +2,50pp [0,50–4,50].
 */
export function convertEliminated(
  pool: number | null,
  rate: number = TRANSFER_TO_LULA,
  margin: number = TRANSFER_MARGIN_PP,
): ConvertedPool {
  const p = pool != null && Number.isFinite(pool) ? Math.max(0, pool) : 0;
  const points = p * rate;
  return {
    points,
    lo: Math.max(0, points - margin),
    hi: Math.min(100, points + margin),
  };
}

/** Espontânea/estimulada convertida p/ prior nacional de share (0–100). */
export const POLL_VALID_LULA = 48;

/** 1º turno (votos válidos, TSE 4/out/2026). */
export const FIRST_ROUND_LULA = 45.16;
export const FIRST_ROUND_FLAVIO = 47.03;

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 50;
  return Math.min(100, Math.max(0, v));
}

/**
 * Prior 2T do Lula num eleitorado: 1T + 32% do pool eliminado.
 * `eliminated` = 100 − lula1T − flavio1T (pp dos válidos).
 */
export function transferLulaPrior(lula1T: number | null, eliminated: number | null): number {
  if (lula1T == null || !Number.isFinite(lula1T)) return POLL_VALID_LULA;
  const pool = eliminated != null && Number.isFinite(eliminated) ? Math.max(0, eliminated) : 0;
  return clampPct(lula1T + TRANSFER_TO_LULA * pool);
}

/** Espelho p/ Flávio (documenta os 46%; o agregado usa 100 − Lula). */
export function transferFlavioPrior(flavio1T: number | null, eliminated: number | null): number {
  if (flavio1T == null || !Number.isFinite(flavio1T)) return 100 - POLL_VALID_LULA;
  const pool = eliminated != null && Number.isFinite(eliminated) ? Math.max(0, eliminated) : 0;
  return clampPct(flavio1T + TRANSFER_TO_FLAVIO * pool);
}
