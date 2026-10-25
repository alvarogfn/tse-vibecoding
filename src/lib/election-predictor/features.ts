/**
 * election-predictor/features — input sanitization + feature engineering.
 *
 * Feature table (input dim = 3 + 27 UF one-hot = 30):
 *
 * | #     | Feature                   | Normalization | Source                     |
 * |-------|---------------------------|---------------|----------------------------|
 * | 0     | percentual_apuracao_atual | counted / 100 | `counted` (0–100)          |
 * | 1     | proporcao_voto_atual      | share / 100   | `share`, null → anchor     |
 * | 2     | ancora                    | anchor / 100  | `anchor` (share ?? 50)     |
 * | 3–29  | uf_one_hot                | 0/1           | `uf` (desconhecida → zeros)|
 *
 * Notes:
 * - O one-hot diz à rede QUAL UF está prevendo: os pesos compartilhados
 *   aprendem a dinâmica global e os pesos do one-hot aprendem o viés de
 *   cada UF — só com os dados da apuração (sem fonte externa).
 *   UF desconhecida cai no vetor zero (neutro).
 * - Missing-data rule: null/NaN degrade to neutral priors
 *   (anchor for share) — never NaN, never throw.
 */

import { UFS } from '@/lib/tse.js';

/** Ordem canônica das 27 UFs (índice do one-hot). */
export const UF_ORDER: readonly string[] = UFS.map(([sigla]) => sigla.toLowerCase());

/** Posição da UF no one-hot, ou -1 se desconhecida (vetor zero). */
export function ufIndexOf(uf: string): number {
  return UF_ORDER.indexOf(uf.toLowerCase());
}

/** Dimensão de entrada da rede: counted + share + anchor + one-hot UF. */
export const INPUT_DIM = 3 + UF_ORDER.length;

export interface FeatureArgs {
  counted: number;
  share: number | null;
  anchor: number;
  uf: string;
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
 * Structural anchor for stabilization: share observado ?? 50 (neutro).
 * Fail-Safe por construção — sempre retorna 0–100 finito.
 */
export function resolveAnchor(share: number | null | undefined): number {
  const raw = share ?? 50;
  return clampPct(raw);
}

/** Build the normalized feature vector consumed by the dense network. */
export function buildFeatureVector(args: FeatureArgs): number[] {
  const counted01 = clampCounted(args.counted) / 100;
  const shareNow = args.share != null && Number.isFinite(args.share) ? args.share : args.anchor;
  const anchor01 = clamp01(args.anchor / 100);
  const idx = ufIndexOf(args.uf);
  const oneHot: number[] = new Array<number>(UF_ORDER.length).fill(0);
  if (idx >= 0) oneHot[idx] = 1;
  return [counted01, clamp01(shareNow / 100), anchor01, ...oneHot];
}

/**
 * Bottom-up national weight: eleitorado || validos (falsy/negative → 0).
 * A zero weight means "no electoral mass information", handled by the
 * aggregator via unweighted-mean fallback.
 */
export function weightOf(eleitorado: number, validos: number): number {
  const e = Number.isFinite(eleitorado) && eleitorado > 0 ? eleitorado : 0;
  const v = Number.isFinite(validos) && validos > 0 ? validos : 0;
  // O doc agrega por votos válidos estimados (V_uf), não por eleitorado
  // registrado: o eleitorado inclui abstenção e distorce a média dos shares.
  // Só cai no eleitorado quando o TSE ainda não trouxe votos válidos.
  const w = v || e;
  return w > 0 ? w : 0;
}
