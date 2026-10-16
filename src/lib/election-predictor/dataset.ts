import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import { buildFeatureVector } from '@/lib/election-predictor/features.js';

export interface TrainRow {
  xs: number[];
  ys: number[];
}

export interface SessionPoint {
  counted: number;
  share: number | null;
}

/**
 * Linhas online: snapshots 2T da sessão (única fonte de treino).
 * Sem 1T, sem pesquisas: cada ponto vira (features no instante → share
 * observado). Pontos sem share são ignorados — o treino só começa quando
 * a apuração do 2T começa.
 */
export function onlineRows(series: ReadonlyMap<string, SessionPoint[]>, perUfCap = 10): TrainRow[] {
  const rows: TrainRow[] = [];
  for (const [, pts] of series) {
    const tail = pts.filter((p) => p.share != null).slice(-perUfCap);
    for (const p of tail) {
      const share = p.share as number;
      rows.push({
        xs: buildFeatureVector({
          counted: p.counted,
          share,
          baseline1T: null,
          pollAvg: null,
          ptBias: null,
          anchor: share,
        }),
        ys: [Math.min(1, Math.max(0, share / 100))],
      });
    }
  }
  return rows;
}

/**
 * tf.data.Dataset embaralhado (seed fixa ⇒ determinístico) em batches.
 * NOTA: após `.batch()`, o tf.data já empilha em Tensores — NÃO converter de
 * novo (tf.tensor2d(tensor) lança "requires values to be number[][]...").
 * O batch `{xs: Tensor[batch,6], ys: Tensor[batch,1]}` vai direto ao fitDataset.
 */
export function toDataset(tf: TfModule, rows: TrainRow[], batchSize: number) {
  return tf.data
    .array(rows.map((r) => ({ xs: r.xs, ys: r.ys })))
    .shuffle(rows.length, 'election-predictor')
    .batch(batchSize);
}
