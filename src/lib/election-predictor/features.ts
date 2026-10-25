/**
 * election-predictor/features — input sanitization + feature engineering.
 *
 * Feature table (input dim = 7 + 27 UF one-hot = 34):
 *
 * | #     | Feature                   | Normalization | Source                          |
 * |-------|---------------------------|---------------|---------------------------------|
 * | 0     | percentual_apuracao_atual | counted / 100 | `counted` (0–100)               |
 * | 1     | proporcao_voto_atual      | share / 100   | `share`, null → anchor          |
 * | 2     | ancora                    | anchor / 100  | prior 1T+polls (ou share)       |
 * | 3     | dinamica_tempo_1_turno    | 0–100 / 100   | curva nacional do 1T no mesmo c |
 * | 4     | resultado_final_1_turno   | 0–100 / 100   | duelo Lula×Flávio por UF no 1T  |
 * | 5     | media_agregada_pesquisas  | 0–100 / 100   | poll estadual ou média nacional |
 * | 6     | viabilidade_historica_pt  | 0–1           | proxy: lean estrutural da UF     |
 * | 7–33  | uf_one_hot                | 0/1           | `uf` (desconhecida → zeros)     |
 *
 * Notes:
 * - O one-hot diz à rede QUAL UF está prevendo; os pesos compartilhados
 *   aprendem a dinâmica global e os do one-hot o viés de cada UF.
 * - `dinamica_tempo_1_turno` usa a curva nacional como proxy: o TSE publicado
 *   aqui não tem a série temporal completa por UF (só o líder).
 * - `viabilidade_historica_pt` não tem as 4 eleições passadas no repo; usamos
 *   um proxy explícito do lean estrutural (final 1T da UF vs share nacional).
 *   Quando os dados históricos existirem, este campo pode ser substituído sem
 *   mudar o contrato.
 * - Missing-data rule: null/NaN degradam para `anchor`; nunca NaN, nunca throw.
 */

import { UFS } from '@/lib/tse.js';

/** Ordem canônica das 27 UFs (índice do one-hot). */
export const UF_ORDER: readonly string[] = UFS.map(([sigla]) => sigla.toLowerCase());

/** Posição da UF no one-hot, ou -1 se desconhecida (vetor zero). */
export function ufIndexOf(uf: string): number {
  return UF_ORDER.indexOf(uf.toLowerCase());
}

/** Dimensão de entrada da rede: 7 features + one-hot UF. */
export const INPUT_DIM = 7 + UF_ORDER.length;

export interface FeatureContext {
  /** Curva nacional do 1T no mesmo `counted` (0–100). */
  dynamic1T: number;
  /** Duelo Lula×Flávio no final do 1T na UF (0–100). */
  final1T: number;
  /** Média de pesquisas da UF ou média nacional (0–100). */
  pollAvg: number;
  /** Share nacional L+F do 1T (0–100), base do proxy histórico. */
  nationalShare1T: number;
}

export interface FeatureArgs {
  counted: number;
  share: number | null;
  anchor: number;
  uf: string;
  context?: Partial<FeatureContext>;
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
  const context = args.context ?? {};
  const dynamic1T = clampPct(context.dynamic1T ?? args.anchor);
  const final1T = clampPct(context.final1T ?? args.anchor);
  const pollAvg = clampPct(context.pollAvg ?? args.anchor);
  const nationalShare1T = clampPct(context.nationalShare1T ?? args.anchor);
  // Proxy do lean estrutural: 0,5 = UF igual à média nacional; 0/1 = -50/+50 pp.
  const viabilityProxy = clamp01(0.5 + (final1T - nationalShare1T) / 50);
  const idx = ufIndexOf(args.uf);
  const oneHot: number[] = new Array<number>(UF_ORDER.length).fill(0);
  if (idx >= 0) oneHot[idx] = 1;
  return [
    counted01,
    clamp01(shareNow / 100),
    anchor01,
    dynamic1T / 100,
    final1T / 100,
    pollAvg / 100,
    viabilityProxy,
    ...oneHot,
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
  // O doc agrega por votos válidos estimados (V_uf), não por eleitorado
  // registrado: o eleitorado inclui abstenção e distorce a média dos shares.
  // Só cai no eleitorado quando o TSE ainda não trouxe votos válidos.
  const w = v || e;
  return w > 0 ? w : 0;
}
