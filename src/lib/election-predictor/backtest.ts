/**
 * election-predictor/backtest — harness de backtest do prior estrutural.
 *
 * O contrato é deliberadamente independente da fonte dos dados:
 *
 * - `prior` já construído com o 1T + pesquisas;
 * - `finalByUf` é o resultado final verdadeiro do 2T (share de Lula no duelo);
 * - `snapshots` são os cortes de apuração do 2T (counted + live por UF).
 *
 * Com esses três insumos o harness mede MAE/RMSE do modelo contra:
 *   1. âncora (1T + delta das pesquisas);
 *   2. live cru (sem correção de viés);
 *   3. agregação nacional bottom-up.
 *
 * Sem `finalByUf` e `snapshots` reais do 2T não há validação out-of-sample.
 * O harness não afirma acurácia; ele apenas mede quando os dados existirem.
 */

import type { StructuralPrior } from './structural-prior.js';

export interface BacktestSnapshot {
  /** % de seções totalizadas fallback quando a UF não tem valor próprio. */
  counted: number;
  /** % apurado específico da UF (o 2T real é dessincronizado). */
  countedByUf?: Readonly<Record<string, number>>;
  /** Share de Lula observado por UF no snapshot; null/ausente = sem live. */
  liveByUf: Readonly<Record<string, number | null | undefined>>;
}

export interface BacktestPoint {
  uf: string;
  /** % apurado efetivamente usado para esta UF. */
  counted: number;
  actual: number;
  estimate: number;
  anchor: number;
  live: number | null;
  /** estimate - actual (pp). */
  error: number;
  absError: number;
  weight: number;
}

export interface BacktestNational {
  actual: number;
  model: number;
  anchor: number;
  live: number | null;
  weight: number;
}

export interface BacktestCutoff {
  /** `counted` fallback do snapshot; cada ponto tem seu próprio counted. */
  counted: number;
  n: number;
  /** Quantas UFs tinham live neste corte. */
  liveN: number;
  modelMae: number;
  anchorMae: number;
  /** MAE do live cru; null se nenhuma UF tinha live no corte. */
  liveMae: number | null;
  /** MAE do modelo restrita ao subconjunto com live (comparação justa). */
  modelMaeLive: number | null;
  /** MAE da âncora restrita ao subconjunto com live. */
  anchorMaeLive: number | null;
  modelRmse: number;
  anchorRmse: number;
  modelWeightedMae: number | null;
  anchorWeightedMae: number | null;
  /** Acertos de lado (Lula > 50 vs Flávio > 50); empates não entram. */
  modelWinnerHits: number;
  modelWinnerN: number;
  national: BacktestNational | null;
  points: BacktestPoint[];
}

export interface BacktestOverall {
  modelMae: number;
  anchorMae: number;
  liveMae: number | null;
  modelMaeLive: number | null;
  anchorMaeLive: number | null;
  modelWeightedMae: number | null;
  anchorWeightedMae: number | null;
}

export interface StructuralBacktestReport {
  cutoffs: BacktestCutoff[];
  overall: BacktestOverall;
}

interface Metrics {
  n: number;
  absSum: number;
  sqSum: number;
  weightedAbsSum: number;
  anchorAbsSum: number;
  anchorSqSum: number;
  anchorWeightedAbsSum: number;
  weightSum: number;
  liveN: number;
  liveAbsSum: number;
  liveModelAbsSum: number;
  liveAnchorAbsSum: number;
  liveValueSum: number;
  liveWeightedValueSum: number;
  liveWeightSum: number;
  winnerHits: number;
  winnerN: number;
  estimateSum: number;
  anchorSum: number;
  actualSum: number;
  estimateWeightedSum: number;
  anchorWeightedSum: number;
  actualWeightedSum: number;
  totalWeight: number;
}

const emptyMetrics = (): Metrics => ({
  n: 0,
  absSum: 0,
  sqSum: 0,
  weightedAbsSum: 0,
  anchorAbsSum: 0,
  anchorSqSum: 0,
  anchorWeightedAbsSum: 0,
  weightSum: 0,
  liveN: 0,
  liveAbsSum: 0,
  liveModelAbsSum: 0,
  liveAnchorAbsSum: 0,
  liveValueSum: 0,
  liveWeightedValueSum: 0,
  liveWeightSum: 0,
  winnerHits: 0,
  winnerN: 0,
  estimateSum: 0,
  anchorSum: 0,
  actualSum: 0,
  estimateWeightedSum: 0,
  anchorWeightedSum: 0,
  actualWeightedSum: 0,
  totalWeight: 0,
});

const normalizeUf = (uf: string): string => uf.trim().toUpperCase();

function cleanShare(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return value;
}

function cleanWeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

const mean = (values: readonly number[]): number =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const meanNullable = (values: readonly (number | null)[]): number | null => {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length > 0 ? mean(finite) : null;
};

function finishMetrics(metrics: Metrics, counted: number, points: BacktestPoint[]): BacktestCutoff {
  const {
    n,
    absSum,
    sqSum,
    weightedAbsSum,
    anchorAbsSum,
    anchorSqSum,
    anchorWeightedAbsSum,
    weightSum,
    liveN,
    liveAbsSum,
    liveModelAbsSum,
    liveAnchorAbsSum,
    liveValueSum,
    liveWeightedValueSum,
    liveWeightSum,
    winnerHits,
    winnerN,
    estimateSum,
    anchorSum,
    actualSum,
    estimateWeightedSum,
    anchorWeightedSum,
    actualWeightedSum,
    totalWeight,
  } = metrics;

  const national: BacktestNational | null =
    n === 0
      ? null
      : totalWeight > 0
        ? {
            actual: actualWeightedSum / totalWeight,
            model: estimateWeightedSum / totalWeight,
            anchor: anchorWeightedSum / totalWeight,
            live: liveWeightSum > 0 ? liveWeightedValueSum / liveWeightSum : null,
            weight: totalWeight,
          }
        : {
            actual: actualSum / n,
            model: estimateSum / n,
            anchor: anchorSum / n,
            live: liveN > 0 ? liveValueSum / liveN : null,
            weight: 0,
          };

  return {
    counted,
    n,
    liveN,
    modelMae: n > 0 ? absSum / n : 0,
    anchorMae: n > 0 ? anchorAbsSum / n : 0,
    liveMae: liveN > 0 ? liveAbsSum / liveN : null,
    modelMaeLive: liveN > 0 ? liveModelAbsSum / liveN : null,
    anchorMaeLive: liveN > 0 ? liveAnchorAbsSum / liveN : null,
    modelRmse: n > 0 ? Math.sqrt(sqSum / n) : 0,
    anchorRmse: n > 0 ? Math.sqrt(anchorSqSum / n) : 0,
    modelWeightedMae: weightSum > 0 ? weightedAbsSum / weightSum : null,
    anchorWeightedMae: weightSum > 0 ? anchorWeightedAbsSum / weightSum : null,
    modelWinnerHits: winnerHits,
    modelWinnerN: winnerN,
    national,
    points,
  };
}

/**
 * Roda o backtest para cada snapshot. UFs ausentes em `finalByUf` são
 * ignoradas; UFs sem live no snapshot caem na âncora (comportamento do prior).
 */
export function runStructuralBacktest(
  prior: StructuralPrior,
  finalByUf: Readonly<Record<string, number>>,
  snapshots: readonly BacktestSnapshot[],
): StructuralBacktestReport {
  const finals = new Map<string, number>();
  for (const [rawUf, rawValue] of Object.entries(finalByUf)) {
    const uf = normalizeUf(rawUf);
    const actual = cleanShare(rawValue);
    if (!uf || actual == null) continue;
    finals.set(uf, actual);
  }
  const finalRows = [...finals.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (finalRows.length === 0) {
    throw new Error('finalByUf vazio: sem UFs para o backtest');
  }
  if (snapshots.length === 0) {
    throw new Error('snapshots vazio: sem cortes para o backtest');
  }

  const cutoffs: BacktestCutoff[] = [];
  for (const snapshot of snapshots) {
    if (!Number.isFinite(snapshot.counted)) {
      throw new Error('BacktestSnapshot.counted inválido');
    }
    const counted = Math.min(100, Math.max(0, snapshot.counted));
    const countedByUf = new Map<string, number>();
    for (const [rawUf, rawCounted] of Object.entries(snapshot.countedByUf ?? {})) {
      const uf = normalizeUf(rawUf);
      if (!uf || typeof rawCounted !== 'number' || !Number.isFinite(rawCounted)) continue;
      countedByUf.set(uf, Math.min(100, Math.max(0, rawCounted)));
    }
    const liveByUf = new Map<string, number | null>();
    for (const [rawUf, rawValue] of Object.entries(snapshot.liveByUf)) {
      const uf = normalizeUf(rawUf);
      if (!uf) continue;
      liveByUf.set(uf, cleanShare(rawValue));
    }

    const metrics = emptyMetrics();
    const points: BacktestPoint[] = [];
    for (const [uf, actual] of finalRows) {
      const live = liveByUf.get(uf) ?? null;
      const ufCounted = countedByUf.get(uf) ?? counted;
      const projection = prior.project({ uf, counted: ufCounted, lulaShare: live });
      if (!projection) continue;

      const estimate = projection.estimate;
      const anchor = projection.anchor;
      const error = estimate - actual;
      const absError = Math.abs(error);
      const weight = cleanWeight(projection.weight);
      const liveError = live == null ? null : live - actual;

      points.push({
        uf,
        counted: ufCounted,
        actual,
        estimate,
        anchor,
        live,
        error,
        absError,
        weight,
      });

      const anchorError = anchor - actual;
      const anchorAbsError = Math.abs(anchorError);

      metrics.n += 1;
      metrics.absSum += absError;
      metrics.sqSum += error * error;
      metrics.weightedAbsSum += absError * weight;
      metrics.anchorAbsSum += anchorAbsError;
      metrics.anchorSqSum += anchorError * anchorError;
      metrics.anchorWeightedAbsSum += anchorAbsError * weight;
      metrics.weightSum += weight;
      metrics.estimateSum += estimate;
      metrics.anchorSum += anchor;
      metrics.actualSum += actual;
      metrics.estimateWeightedSum += estimate * weight;
      metrics.anchorWeightedSum += anchor * weight;
      metrics.actualWeightedSum += actual * weight;
      metrics.totalWeight += weight;

      if (live != null && liveError != null) {
        metrics.liveN += 1;
        metrics.liveAbsSum += Math.abs(liveError);
        metrics.liveModelAbsSum += absError;
        metrics.liveAnchorAbsSum += anchorAbsError;
        metrics.liveValueSum += live;
        metrics.liveWeightedValueSum += live * weight;
        metrics.liveWeightSum += weight;
      }

      const actualSide = Math.sign(actual - 50);
      if (actualSide !== 0) {
        metrics.winnerN += 1;
        if (Math.sign(estimate - 50) === actualSide) metrics.winnerHits += 1;
      }
    }

    if (points.length === 0) {
      throw new Error(`BacktestSnapshot em ${counted}% não casou nenhuma UF`);
    }
    points.sort((a, b) => a.uf.localeCompare(b.uf));
    cutoffs.push(finishMetrics(metrics, counted, points));
  }

  return {
    cutoffs,
    overall: {
      modelMae: mean(cutoffs.map((cutoff) => cutoff.modelMae)),
      anchorMae: mean(cutoffs.map((cutoff) => cutoff.anchorMae)),
      liveMae: meanNullable(cutoffs.map((cutoff) => cutoff.liveMae)),
      modelMaeLive: meanNullable(cutoffs.map((cutoff) => cutoff.modelMaeLive)),
      anchorMaeLive: meanNullable(cutoffs.map((cutoff) => cutoff.anchorMaeLive)),
      modelWeightedMae: meanNullable(cutoffs.map((cutoff) => cutoff.modelWeightedMae)),
      anchorWeightedMae: meanNullable(cutoffs.map((cutoff) => cutoff.anchorWeightedMae)),
    },
  };
}
