import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import { buildFeatureVector } from '@/lib/election-predictor/features.js';
import type { FeatureContext } from '@/lib/election-predictor/features.js';

export interface TrainRow {
  xs: number[];
  ys: number[];
}

export interface SessionPoint {
  counted: number;
  share: number | null;
}

/**
 * Linhas online: snapshots 2T da apuração (única fonte de treino).
 * Cada ponto vira (features no instante → **target final do prior**). Sem
 * `targetByUf`, o alvo cai no share observado (comportamento antigo, de
 * persistência); com o prior 1T, a rede aprende o residual até o final
 * estrutural, não a repetir o share atual.
 */
export function onlineRows(
  series: ReadonlyMap<string, SessionPoint[]>,
  targetByUf?: ReadonlyMap<string, number>,
  contextFor?: (uf: string, counted: number) => FeatureContext,
  perUfCap = 10,
): TrainRow[] {
  const rows: TrainRow[] = [];
  for (const [uf, pts] of series) {
    // Chaves internas (ex.: __br) guardam histórico nacional para o gráfico;
    // não são UFs e não entram no treino.
    if (uf.startsWith('__')) continue;
    const tail = pts.filter((p) => p.share != null).slice(-perUfCap);
    for (const p of tail) {
      const share = p.share as number;
      const rawTarget =
        targetByUf?.get(uf) ?? targetByUf?.get(uf.toUpperCase()) ?? share;
      const target = Number.isFinite(rawTarget)
        ? Math.min(100, Math.max(0, rawTarget))
        : share;
      rows.push({
        xs: buildFeatureVector({
          counted: p.counted,
          share,
          anchor: target,
          uf,
          context: contextFor?.(uf, p.counted),
        }),
        ys: [Math.min(1, Math.max(0, target / 100))],
      });
    }
  }
  return rows;
}

/**
 * tf.data.Dataset embaralhado (seed fixa ⇒ determinístico) em batches.
 * NOTA: após `.batch()`, o tf.data já empilha em Tensores — NÃO converter de
 * novo (tf.tensor2d(tensor) lança "requires values to be number[][]...").
 * O batch `{xs: Tensor[batch,dim], ys: Tensor[batch,1]}` vai direto ao fitDataset.
 */
export function toDataset(tf: TfModule, rows: TrainRow[], batchSize: number) {
  return tf.data
    .array(rows.map((r) => ({ xs: r.xs, ys: r.ys })))
    .shuffle(rows.length, 'election-predictor')
    .batch(batchSize);
}
