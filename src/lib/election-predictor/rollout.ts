import type * as tfTypes from '@tensorflow/tfjs';
import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import { predictRaw01Batch } from '@/lib/election-predictor/analytic-model.js';
import { buildFeatureVector, clampPct } from '@/lib/election-predictor/features.js';
import type { FeatureContext } from '@/lib/election-predictor/features.js';
import { buildProgressSchedule } from '@/lib/election-predictor/rollout-progress.js';

/**
 * 2000 fatias com grade adaptativa (potência 2): densas perto da apuração
 * atual, esparsas no fim, onde alpha=1 e o target já é exato. Isso evita o
 * erro de ~3 pp da grade uniforme de 1000 na primeira fatia e ainda cabe no
 * Worker (~2-3 s). Benchmark contra referência de 10.000 em `rollout-progress`.
 */
export const ROLLOUT_SLICES = 2000;

/**
 * Cede a main thread sem depender de requestAnimationFrame. Em aba de fundo
 * (ou janela ocluída) o rAF do `tf.nextFrame()` pode ficar congelado e a
 * projeção inteira nunca termina; o timeout de 16ms garante o yield mesmo
 * assim (e vence a corrida quando há paint).
 */
async function yieldFrame(tf: TfModule): Promise<void> {
  await Promise.race([
    tf.nextFrame(),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 16);
    }),
  ]);
}

export interface RolloutUf {
  uf: string;
  counted: number;
  share: number | null;
  /** Prior estrutural final (alvo em 100%); substitui o share como âncora. */
  target: number;
  /** Features externas (1T dinâmico/final, pesquisas, lean) no `counted` x. */
  featureContext: (counted: number) => FeatureContext;
  weight: number;
}

export interface RolloutResult {
  /** progress[i] = fração (0,1] do restante; x = counted + (100-counted)*u. */
  progress: number[];
  /** curves[k][i] = Lula share da UF k na fatia i (x em (counted, 100]). */
  curves: number[][];
  nationalLula: number[];
  nationalFlavio: number[];
}

/**
 * Rollout autorregressivo: o modelo percorre fatias do % restante, realimentado
 * com a própria previsão anterior (share_{t+1} = f(share_t)). A grade é
 * adaptativa (ver `rollout-progress.ts`): densa perto do `counted`, esparsa no
 * fim, onde alpha=1 e o target já é exato. Batch único [nUf, 34] por fatia.
 * `await tf.nextFrame()` a cada 25 fatias cede a main thread (sem jank).
 * O endpoint é o `target` estrutural (1T + pesquisas); a rede só modula a
 * trajetória e o resíduo decai a zero em x=100. Não é mais uma reta até o
 * share atual.
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
  const states: number[] = ufs.map((u) => clampPct(u.share ?? u.target));
  // Tudo apurado: 1 ponto terminal por UF (N11) — milhares de pontos empilhados
  // em x=100 seriam overdraw puro + trabalho p/ tooltip/decimação.
  const effSlices = ufs.length > 0 && ufs.every((u) => u.counted >= 100) ? 1 : slices;
  const progress = buildProgressSchedule(effSlices);
  for (let i = 0; i < progress.length; i += 1) {
    const step = progress[i] ?? 1;
    const batch = ufs.map((u, k) => {
      const x = u.counted + (100 - u.counted) * step;
      return buildFeatureVector({
        counted: x,
        share: states[k] ?? u.target,
        anchor: u.target,
        uf: u.uf,
        context: u.featureContext(x),
      });
    });
    const raws = predictRaw01Batch(tf, model, batch);
    for (let k = 0; k < n; k += 1) {
      const u = ufs[k];
      if (!u) continue;
      const x = u.counted + (100 - u.counted) * step;
      const alpha = Math.min(1, x / 60);
      const target = clampPct(u.target);
      const current = states[k] ?? target;
      // O modelo só modula a trajetória; em x=100 o resíduo desaparece e o
      // endpoint é exatamente o prior estrutural. Sem isso o rollout voltaria
      // a convergir para o share atual (persistência).
      const residual = Math.min(10, Math.max(-10, clampPct((raws[k] ?? 0.5) * 100) - target));
      const next = clampPct(
        (1 - alpha) * current + alpha * target + alpha * (1 - alpha) * residual,
      );
      states[k] = next;
      const curve = curves[k];
      if (curve) curve.push(next);
    }
    if ((i + 1) % 25 === 0) {
      if (shouldAbort?.()) return null; // superseded — caller stays silent.
      await yieldFrame(tf); // cede a main thread (sem jank no gráfico).
    }
  }
  // Bottom-up por fatia: Σ(curva × peso)/Σ(pesos) — a nacional flutua junto.
  const nationalLula: number[] = [];
  for (let i = 0; i < progress.length; i += 1) {
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
  return {
    progress,
    curves,
    nationalLula,
    nationalFlavio: nationalLula.map((v) => clampPct(100 - v)),
  };
}
