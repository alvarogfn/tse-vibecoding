/**
 * election-predictor/analytic-model — TensorFlow.js topology + weight priors.
 *
 * Topology (per repo doc, "Definição das Camadas do Modelo Preditivo"):
 * dense feedforward 6 features → ReLU hidden layers (16 → 12 → 8) →
 * 1 sigmoid neuron predicting the final Lula share (0–1, ×100 for display).
 * Compiled with Adam + MSE at build time, matching the doc's prescription.
 * Training happens in `training.ts` (pre-train on 1T finals + online
 * fine-tune on session snapshots via `tf.data.Dataset`, checkpoint saved
 * to IndexedDB); this module owns topology + weight priors + inference.
 *
 * ── WEIGHTS: ANALYTIC PRIORS, NOT TRAINED WEIGHTS ──────────────────────
 * No trained checkpoint is published yet (`public/models/predictor/`
 * does not exist). The loader below first attempts
 * `tf.loadLayersModel(BASE_URL + 'models/predictor/model.json')`; ANY
 * failure (missing file, network error, shape mismatch) falls back to the
 * analytic prior built here:
 * - Hidden layers: deterministic pseudo-random projections from a seeded
 *   PRNG (mulberry32, fixed seed). Xavier-uniform scale keeps ReLU
 *   activations in a sane range. Deterministic ⇒ identical inputs always
 *   yield identical outputs across reloads/sessions.
 * - Final layer: HAND-SET averaging prior (uniform small-positive kernel,
 *   slight negative bias) so the raw sigmoid output centers near 50% and
 *   per-UF variation comes from the hidden projections. It does NOT blend
 *   share/anchor by itself — that blending is done EXPLICITLY by the
 *   stabilization step in index.ts (alpha = min(1, counted/60) toward the
 *   structural anchor). This keeps untrained predictions honest: early
 *   counts stay anchored, and the net only modulates the residual swing.
 * Once a real checkpoint is published and loads successfully, it replaces
 * these priors transparently (model singleton is cached process-wide).
 *
 * Memory discipline: every inference runs inside `tf.tidy()` and extracts
 * a plain number via `dataSync()` before returning, so no GPU-side tensor
 * survives the call (WebGL/WASM buffers are invisible to the V8 GC).
 * One-shot init tensors are disposed explicitly in `finally`.
 */

import type * as tfTypes from '@tensorflow/tfjs';

/** The lazily-imported tfjs module namespace (runtime value, type-only here). */
export type TfModule = typeof import('@tensorflow/tfjs');

/** Fixed seed ⇒ deterministic hidden projections across sessions. */
const ANALYTIC_SEED = 20260201;

const INPUT_DIM = 6;
const HIDDEN: ReadonlyArray<readonly [number, number]> = [
  [6, 16],
  [16, 12],
  [12, 8],
];
const FINAL_FAN_IN = 8;

/** Hand-set final-layer prior: average hidden evidence, center near 50%. */
const FINAL_KERNEL_VALUE = 0.12;
const FINAL_BIAS_VALUE = -0.3;

/** Deterministic PRNG (mulberry32). Pure — no Math.random, no Date. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function throwMissingLayer(index: number): never {
  throw new Error(`election-predictor: analytic model is missing dense layer ${index}`);
}

/**
 * Build the untrained network with analytic-prior weights (see header).
 * Fail-Fast: throws on structural surprises so the store can map them to
 * the `error` snapshot at the boundary.
 */
export function buildAnalyticModel(tf: TfModule): tfTypes.LayersModel {
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [INPUT_DIM] }));
  model.add(tf.layers.dense({ units: 12, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

  const rand = mulberry32(ANALYTIC_SEED);
  const garbage: tfTypes.Tensor[] = [];
  try {
    for (let li = 0; li < HIDDEN.length; li += 1) {
      const dims = HIDDEN[li];
      if (!dims) throwMissingLayer(li);
      const [fanIn, fanOut] = dims;
      const limit = Math.sqrt(6 / (fanIn + fanOut)); // Xavier-uniform range
      const kernelVals: number[] = new Array<number>(fanIn * fanOut);
      for (let i = 0; i < kernelVals.length; i += 1) {
        const r: number = rand();
        kernelVals[i] = (r * 2 - 1) * limit;
      }
      const kernel = tf.tensor2d(kernelVals, [fanIn, fanOut]);
      // Viés positivo pequeno: metade dos ReLUs nasceria morta com bias zero
      // e o pré-treino não convergia (saídas chapadas ⇒ mapa todo azul).
      const bias = tf.fill([fanOut], 0.1);
      garbage.push(kernel, bias);
      const layer = model.layers[li];
      if (!layer) throwMissingLayer(li);
      layer.setWeights([kernel, bias]);
    }
    const finalKernel = tf.tensor2d(new Array<number>(FINAL_FAN_IN).fill(FINAL_KERNEL_VALUE), [
      FINAL_FAN_IN,
      1,
    ]);
    const finalBias = tf.tensor1d([FINAL_BIAS_VALUE]);
    garbage.push(finalKernel, finalBias);
    const head = model.layers[HIDDEN.length];
    if (!head) throwMissingLayer(HIDDEN.length);
    head.setWeights([finalKernel, finalBias]);
  } finally {
    for (const t of garbage) t.dispose();
  }

  // lr 0.01 (não o 0.001 padrão): o pré-treino tem poucas epochs p/
  // separar as UFs (metas 35–68); com 0.001 os pesos quase não saíam do lugar.
  model.compile({ optimizer: tf.train.adam(0.01), loss: 'meanSquaredError' });
  return model;
}

/**
 * Forward em lote → number[] em 0–1 (uma chamada p/ N linhas; ideal p/ rollout).
 * Escopo tf.tidy + dataSync interno: nenhum tensor escapa.
 */
export function predictRaw01Batch(
  tf: TfModule,
  model: tfTypes.LayersModel,
  batch: number[][],
): number[] {
  if (batch.length === 0) return [];
  return tf.tidy(() => {
    const xs = tf.tensor2d(batch, [batch.length, INPUT_DIM]);
    const out = model.predict(xs) as tfTypes.Tensor;
    const data = out.dataSync();
    return Array.from(data, (v) => (Number.isFinite(v) ? (v as number) : 0.5));
  });
}

/**
 * Single forward pass → plain number in 0–1.
 * ALL tensor ops are scoped in `tf.tidy()`; the scalar is materialized
 * with `dataSync()` inside the tidy so no tensor escapes to GPU memory.
 */
export function predictRaw01(
  tf: TfModule,
  model: tfTypes.LayersModel,
  features: number[],
): number {
  return tf.tidy(() => {
    const xs = tf.tensor2d([features], [1, INPUT_DIM]);
    const out = model.predict(xs) as tfTypes.Tensor;
    const data = out.dataSync();
    const v: number = data[0];
    return Number.isFinite(v) ? v : 0.5;
  });
}
