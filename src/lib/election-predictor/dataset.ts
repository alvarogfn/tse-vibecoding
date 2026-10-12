import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import { buildFeatureVector } from '@/lib/election-predictor/features.js';
import { transferLulaPrior, POLL_VALID_LULA } from '@/lib/election-predictor/transfer.js';
import type { FirstTurnBaseline } from '@/lib/election-predictor/baselines.js';

export interface TrainRow {
  xs: number[];
  ys: number[];
}

export interface SessionPoint {
  counted: number;
  share: number | null;
}

/**
 * Alvo de treino = âncora com transferência (0–1). HONESTIDADE METODOLÓGICA:
 * o final real do 2T é desconhecido durante a apuração; o fit destila a
 * âncora (1T transferido/polls) e a modulação pela evidência parcial, para
 * que os pesos acompanhem os dados que chegam em vez de ficarem congelados
 * nos priors analíticos. Não é aprendizado do resultado final.
 */
export function anchorTarget01(baseline1T: number | null, eliminated: number | null, poll: number | null, share: number | null): number {
  const transferred =
    baseline1T != null ? transferLulaPrior(baseline1T, eliminated) : null;
  const anchor = transferred ?? poll ?? share ?? POLL_VALID_LULA;
  const v = anchor / 100;
  return Math.min(1, Math.max(0, v));
}

/**
 * Linhas de pré-treino das SÉRIES temporais do 1T (1-turn-data/): cada
 * instante vira uma linha (features no instante → alvo = final transferido).
 * É aqui que o modelo vê a dinâmica por tempo (flutuações reais de 4/out),
 * não só o ponto final. UFs usam a curva do líder local como share.
 */
export function seriesPretrainRows(
  national: Array<{ counted: number; share: number }>,
  byUf: ReadonlyMap<string, Array<{ counted: number; share: number }>>,
  finalOf: (uf: string | null) => { lula1T: number | null; eliminated: number | null },
): TrainRow[] {
  const rows: TrainRow[] = [];
  const nat = finalOf(null);
  const natAnchor = transferLulaPrior(nat.lula1T, nat.eliminated);
  for (const p of national) {
    if (!Number.isFinite(p.counted) || !Number.isFinite(p.share)) continue;
    rows.push({
      xs: buildFeatureVector({
        counted: p.counted,
        share: p.share,
        baseline1T: nat.lula1T,
        pollAvg: POLL_VALID_LULA,
        ptBias: null,
        anchor: natAnchor,
      }),
      ys: [natAnchor / 100],
    });
  }
  for (const [uf, pts] of byUf) {
    const f = finalOf(uf);
    const anchor = transferLulaPrior(f.lula1T, f.eliminated);
    for (const p of pts) {
      if (!Number.isFinite(p.counted) || !Number.isFinite(p.share)) continue;
      rows.push({
        xs: buildFeatureVector({
          counted: p.counted,
          share: p.share,
          baseline1T: f.lula1T,
          pollAvg: POLL_VALID_LULA,
          ptBias: f.lula1T != null ? f.lula1T / 100 : null,
          anchor,
        }),
        ys: [anchor / 100],
      });
    }
  }
  return rows;
}

/** Linhas de pré-treino: 27 UFs × finais 1T transferidos. */
export function pretrainRows(baselines: FirstTurnBaseline[]): TrainRow[] {
  return baselines.map((b) => {
    const anchor = transferLulaPrior(b.lula1T, b.eliminated);
    return {
      xs: buildFeatureVector({
        counted: 100,
        share: b.lula1T,
        baseline1T: b.lula1T,
        pollAvg: POLL_VALID_LULA,
        ptBias: null,
        anchor,
      }),
      ys: [anchor / 100],
    };
  });
}

/** Linhas online: snapshots 2T da sessão. */
export function onlineRows(
  series: ReadonlyMap<string, SessionPoint[]>,
  baseByUf: ReadonlyMap<string, FirstTurnBaseline>,
  perUfCap = 10,
): TrainRow[] {
  const rows: TrainRow[] = [];
  for (const [uf, pts] of series) {
    const base = baseByUf.get(uf);
    const tail = pts.filter((p) => p.share != null).slice(-perUfCap);
    for (const p of tail) {
      const share = p.share as number;
      const anchor = transferLulaPrior(base?.lula1T ?? null, base?.eliminated ?? null);
      // Peso crescente p/ o 2T: com 0% apurado o alvo é a âncora (1T
      // transferido); aos 70% o alvo é o observado — o 1T vira só o ponto
      // de partida dos pesos (warm-start), sem puxar o treino p/ trás.
      const beta = Math.min(1, Math.max(0, p.counted) / 70);
      const target = (1 - beta) * anchor + beta * share;
      rows.push({
        xs: buildFeatureVector({
          counted: p.counted,
          share,
          baseline1T: base?.lula1T ?? null,
          pollAvg: POLL_VALID_LULA,
          ptBias: null,
          anchor,
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
 * O batch `{xs: Tensor[batch,6], ys: Tensor[batch,1]}` vai direto ao fitDataset.
 */
export function toDataset(tf: TfModule, rows: TrainRow[], batchSize: number) {
  return tf.data
    .array(rows.map((r) => ({ xs: r.xs, ys: r.ys })))
    .shuffle(rows.length, 'election-predictor')
    .batch(batchSize);
}
