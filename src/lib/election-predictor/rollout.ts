import type * as tfTypes from '@tensorflow/tfjs';
import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import { predictRaw01Batch } from '@/lib/election-predictor/analytic-model.js';
import { buildFeatureVector, clampPct } from '@/lib/election-predictor/features.js';

export const ROLLOUT_SLICES = 1000;

export interface RolloutUf {
  uf: string;
  counted: number;
  share: number | null;
  anchor: number;
  weight: number;
}

export interface RolloutResult {
  /** curves[k][i] = Lula share da UF k na fatia i (x em (counted, 100]). */
  curves: number[][];
  nationalLula: number[];
  nationalFlavio: number[];
}

/**
 * Rollout autorregressivo: o modelo prevê cada uma das 1000 fatias do % restante,
 * realimentado com a própria previsão anterior (share_{t+1} = f(share_t)).
 * Batch único [nUf, 6] por fatia ⇒ 1000 inferências totais (não 27×1000).
 * `await tf.nextFrame()` a cada 200 fatias cede a main thread (sem jank).
 * Flutuações emergem da resposta da rede ao counted-x e ao share evolutivo —
 * é o modelo prevendo a trajetória, não uma reta até a âncora.
 */
export async function rollout(
  tf: TfModule,
  model: tfTypes.LayersModel,
  ufs: RolloutUf[],
  slices: number = ROLLOUT_SLICES,
  shouldAbort?: () => boolean,
): Promise<RolloutResult | null> {
  const n = ufs.length;
  const curves: number[][] = ufs.map(() => []);
  const states: Array<number | null> = ufs.map((u) => u.share);
  // Tudo apurado: 1 ponto terminal por UF (N11) — 1000 pontos empilhados em
  // x=100 seriam overdraw puro + trabalho p/ tooltip/decimação.
  const effSlices = ufs.length > 0 && ufs.every((u) => u.counted >= 100) ? 1 : slices;
  for (let i = 1; i <= effSlices; i += 1) {
    const batch = ufs.map((u, k) => {
      const x = u.counted + ((100 - u.counted) * i) / effSlices;
      const s = states[k];
      return buildFeatureVector({
        counted: x,
        share: s,
        anchor: u.anchor,
        uf: u.uf,
      });
    });
    const raws = predictRaw01Batch(tf, model, batch);
    for (let k = 0; k < n; k += 1) {
      const u = ufs[k];
      if (!u) continue;
      const x = u.counted + ((100 - u.counted) * i) / effSlices;
      const alpha = Math.min(1, x / 60);
      const next = clampPct((1 - alpha) * u.anchor + alpha * clampPct((raws[k] ?? 0.5) * 100));
      states[k] = next;
      const curve = curves[k];
      if (curve) curve.push(next);
    }
    if (i % 25 === 0) {
      if (shouldAbort?.()) return null; // superseded — caller stays silent.
      await tf.nextFrame(); // cede a main thread (sem jank no gráfico).
    }
  }
  // Bottom-up por fatia: Σ(curva × peso)/Σ(pesos) — a nacional flutua junto.
  const nationalLula: number[] = [];
  for (let i = 0; i < effSlices; i += 1) {
    let tw = 0;
    let sw = 0;
    let sum = 0;
    for (let k = 0; k < n; k += 1) {
      const w = ufs[k]?.weight ?? 0;
      const y = curves[k]?.[i] ?? 50;
      tw += w;
      sw += y * w;
      sum += y;
    }
    nationalLula.push(clampPct(tw > 0 ? sw / tw : sum / Math.max(1, n)));
  }
  return { curves, nationalLula, nationalFlavio: nationalLula.map((v) => clampPct(100 - v)) };
}
