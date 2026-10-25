/**
 * Contrato de mensagens entre a main thread e o Web Worker do rollout.
 *
 * Tudo aqui é estruturalmente clonável (objetos/arrays de números): o Worker
 * nunca recebe funções, tensores do TF.js nem referências ao store. Os pesos
 * são achatados como `{ shape, data }` e a curva 1T viaja como pontos puros.
 */
import type { RolloutResult } from '@/lib/election-predictor/rollout.js';

/** Um tensor de peso do modelo (kernel 2D ou bias 1D), serializado. */
export interface PredictorWorkerWeight {
  shape: number[];
  data: number[];
}

/** Ponto da curva nacional do 1T normalizada (mesmo shape do prior). */
export interface PredictorWorkerCurvePoint {
  counted: number;
  lulaDuel: number;
}

/**
 * Uma UF pronta para o rollout. `curve` é a curva NACIONAL compartilhada —
 * não há dinâmica por UF, exatamente como em `featureContextFor`.
 */
export interface PredictorWorkerUf {
  uf: string;
  counted: number;
  share: number | null;
  /** Prior estrutural final (alvo em 100%); nunca é recalculado no Worker. */
  target: number;
  weight: number;
  curve: readonly PredictorWorkerCurvePoint[];
  /** `final1T` estático da UF (feature 4). */
  final1T: number;
  /** Média de pesquisas da UF/nacional (feature 5). */
  pollAvg: number;
  /** Share nacional L+F do 1T (feature 6). */
  nationalShare1T: number;
}

export interface PredictorWorkerRequest {
  /** Correlaciona resposta e pedido; respostas antigas são ignoradas. */
  id: number;
  weights: readonly PredictorWorkerWeight[];
  ufs: readonly PredictorWorkerUf[];
  /** Número de fatias do rollout (default do chamador: `ROLLOUT_SLICES`). */
  slices: number;
  /**
   * Fallback de `curveAt` quando a curva não tem pontos. No prior é
   * `nationalFinalDuel`; sem prior, o `featureContextFor` usa 50.
   */
  curveFallback: number;
}

export type PredictorWorkerResponse =
  | ({ id: number; ok: true } & RolloutResult)
  | { id: number; ok: false; error: string };
