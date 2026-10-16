/**
 * election-predictor/features — input sanitization + feature engineering.
 *
 * Feature table (6 dims p/ preservar a topologia da rede; pivô 100% 2T):
 *
 * | # | Feature                    | Normalization | Source                          |
 * |---|----------------------------|---------------|---------------------------------|
 * | 0 | percentual_apuracao_atual  | counted / 100 | `counted` (0–100)               |
 * | 1 | proporcao_voto_atual       | share / 100   | `lulaShare`, null → anchor      |
 * | 2 | dinamica_tempo_1_turno     | / 100         | sempre neutro (legado 1T)       |
 * | 3 | resultado_final_1_turno    | / 100         | sempre neutro (legado 1T)       |
 * | 4 | media_agregada_pesquisas   | / 100         | sempre neutro (legado polls)     |
 * | 5 | viabilidade_historica_pt   | 0–1           | sempre neutro (legado 1T)       |
 *
 * Notes:
 * - Pivô 100% 2T (weights/polls/1T removidos): chamadores passam null p/
 *   baseline1T/pollAvg/ptBias e as features 2–5 caem no prior neutro 0.5.
 *   Os slots são mantidos p/ não quebrar os pesos salvos (input dim = 6).
 * - Missing-data rule: null/NaN numeric inputs degrade to neutral priors
 *   (anchor for share, 0.5 for baseline/poll/bias) — never NaN, never throw.
 */

export interface FeatureArgs {
  counted: number;
  share: number | null;
  baseline1T: number | null | undefined;
  pollAvg: number | null | undefined;
  ptBias: number | null | undefined;
  anchor: number;
}

const clamp01 = (v: number): number => {
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
};

/** Clamp a 0–100 percentage; non-finite degrades to the neutral 50. */
export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

/** Clamp a counted % to [0, 100]; non-finite degrades to 0. */
export function clampCounted(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Clean an optional share (0–100) → number | null. Non-finite = missing. */
export function cleanShare(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return clampPct(value);
}

/**
 * Structural anchor for stabilization: 100% 2T (share ?? 50).
 * baseline1T/pollAvg mantidos na assinatura p/ compat, mas o pivô só usa
 * o share observado — sem 1T, sem pesquisas. Fail-Safe por construção.
 */
export function resolveAnchor(
  baseline1T: number | null | undefined,
  pollAvg: number | null | undefined,
  share: number | null | undefined,
): number {
  const raw = baseline1T ?? pollAvg ?? share ?? 50;
  return clampPct(raw);
}

/**
 * PT-bias prior on 0–1. Accepts either 0–1 fractions or 0–100 percentages
 * (values > 1 are scaled down); null/NaN → neutral 0.5.
 */
export function normalizeBias(ptBias: number | null | undefined): number {
  if (ptBias == null || !Number.isFinite(ptBias)) return 0.5;
  const scaled = ptBias > 1 ? ptBias / 100 : ptBias;
  return clamp01(scaled);
}

/** Build the 6-feature normalized vector consumed by the dense network. */
export function buildFeatureVector(args: FeatureArgs): number[] {
  const counted01 = clampCounted(args.counted) / 100;
  const shareNow = args.share != null && Number.isFinite(args.share) ? args.share : args.anchor;
  const base = args.baseline1T ?? 50;
  const poll = args.pollAvg ?? 50;
  return [
    counted01,
    clamp01(shareNow / 100),
    clamp01(base / 100),
    clamp01(base / 100),
    clamp01(poll / 100),
    normalizeBias(args.ptBias),
  ];
}

/**
 * Bottom-up national weight: eleitorado || validos (falsy/negative → 0).
 * A zero weight means "no electoral mass information", handled by the
 * aggregator via unweighted-mean fallback.
 */
export function weightOf(eleitorado: number, validos: number): number {
  const e = Number.isFinite(eleitorado) && eleitorado > 0 ? eleitorado : 0;
  const v = Number.isFinite(validos) && validos > 0 ? validos : 0;
  const w = e || v;
  return w > 0 ? w : 0;
}
