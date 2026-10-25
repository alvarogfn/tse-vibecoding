/**
 * predictor.worker — rollout do preditor 2T fora da main thread.
 *
 * Contratos:
 * - Fail-Fast interno: valida a mensagem, aplica os pesos e roda o rollout;
 *   qualquer falha vira `{ ok: false, error }` (o chamador decide o fallback).
 * - Fail-Safe de borda: o Worker NUNCA toca no store, no DOM ou no modelo da
 *   main thread. Ele recebe pesos + UFs já preparadas e devolve curvas puras.
 * - Semântica idêntica à main: o alvo é o `target` do prior, as features
 *   estáticas vêm calculadas de `featureContextFor` e `dynamic1T` interpola a
 *   MESMA curva nacional via `curveValueAt`.
 * - Backend CPU explícito: um Worker não tem `<canvas>` garantido e o WebGL
 *   em OffscreenCanvas varia por navegador. O CPU é determinístico e dispensa
 *   canvas; a topologia (34 → 16 → 12 → 8 → 1) é a mesma.
 *
 * Não importa `index.ts`, o store, `training.ts` nem IndexedDB.
 */
import * as tf from '@tensorflow/tfjs';
import type * as tfTypes from '@tensorflow/tfjs';
import { buildAnalyticModel } from '@/lib/election-predictor/analytic-model.js';
import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import type { FeatureContext } from '@/lib/election-predictor/features.js';
import { rollout } from '@/lib/election-predictor/rollout.js';
import type { RolloutUf } from '@/lib/election-predictor/rollout.js';
import { curveValueAt } from '@/lib/election-predictor/structural-prior.js';
import type {
  PredictorWorkerRequest,
  PredictorWorkerResponse,
  PredictorWorkerWeight,
} from '@/lib/election-predictor/predictor-worker-protocol.js';

/**
 * `lib.dom` tipa `self` como Window; no Worker o contrato é só este. O cast
 * evita puxar `lib.webworker` (que conflita com o `lib.dom` do app).
 */
interface PredictorWorkerScope {
  onmessage: ((event: MessageEvent<PredictorWorkerRequest>) => void) | null;
  postMessage(message: PredictorWorkerResponse): void;
}

const scope = globalThis as unknown as PredictorWorkerScope;

/** Backend sem canvas: disponível em qualquer Worker e determinístico. */
const WORKER_BACKEND = 'cpu';

/** Inicialização do TF.js (uma vez; se falhar, a próxima tentativa refaz). */
let runtimeReady: Promise<void> | null = null;
/** Modelo fixo do Worker — os pesos são reaplicados a cada mensagem. */
let model: tfTypes.LayersModel | null = null;
/** Serializa mensagens: `setWeights` e `predict` nunca se cruzam. */
let messageQueue: Promise<void> = Promise.resolve();

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  const text = String(error);
  return text.trim().length > 0 ? text : 'predictor worker failed';
}

/**
 * Garante backend + TF.js prontos. Rejeição limpa o cache para permitir nova
 * tentativa; a rejeição é sempre consumida por `handle()`.
 */
function ensureRuntime(): Promise<void> {
  if (!runtimeReady) {
    runtimeReady = (async (): Promise<void> => {
      const ok = await tf.setBackend(WORKER_BACKEND);
      if (!ok) throw new Error(`TF.js não conseguiu inicializar o backend ${WORKER_BACKEND}`);
      await tf.ready();
    })();
    runtimeReady.catch((): void => {
      runtimeReady = null;
    });
  }
  return runtimeReady;
}

function tensorFromSpec(tfModule: TfModule, spec: PredictorWorkerWeight): tfTypes.Tensor {
  const shape = Array.isArray(spec.shape) ? spec.shape : [];
  const data = Array.isArray(spec.data) ? spec.data : [];
  if (shape.length === 1) {
    const [size] = shape;
    if (size == null || !Number.isInteger(size) || size < 0 || data.length !== size) {
      throw new Error('peso 1D com shape/dados incompatíveis');
    }
    return tfModule.tensor1d(data);
  }
  if (shape.length === 2) {
    const [rows, cols] = shape;
    if (
      rows == null ||
      cols == null ||
      !Number.isInteger(rows) ||
      !Number.isInteger(cols) ||
      rows < 0 ||
      cols < 0 ||
      data.length !== rows * cols
    ) {
      throw new Error('peso 2D com shape/dados incompatíveis');
    }
    return tfModule.tensor2d(data, [rows, cols]);
  }
  throw new Error(`peso com rank ${shape.length} não suportado`);
}

/**
 * Aplica os pesos recebidos. `setWeights` grava via `LayerVariable.write` →
 * `Variable.assign`, que aponta a variável para o mesmo dataId e incrementa a
 * refCount. Descartar os tensores temporários no `finally` é seguro: só
 * decrementa a refCount, sem apagar os dados que o modelo passou a usar.
 */
function applyWeights(
  tfModule: TfModule,
  target: tfTypes.LayersModel,
  specs: readonly PredictorWorkerWeight[],
): void {
  if (specs.length === 0) throw new Error('mensagem sem pesos');
  const tensors: tfTypes.Tensor[] = [];
  try {
    for (const spec of specs) tensors.push(tensorFromSpec(tfModule, spec));
    target.setWeights(tensors);
  } finally {
    for (const tensor of tensors) tensor.dispose();
  }
}

/** Reconstrói o contexto exatamente como `featureContextFor` na main. */
function rolloutUfs(request: PredictorWorkerRequest): RolloutUf[] {
  return request.ufs.map((uf) => ({
    uf: uf.uf,
    counted: uf.counted,
    share: uf.share,
    target: uf.target,
    weight: uf.weight,
    featureContext: (counted: number): FeatureContext => ({
      dynamic1T: curveValueAt(uf.curve, counted, request.curveFallback),
      final1T: uf.final1T,
      pollAvg: uf.pollAvg,
      nationalShare1T: uf.nationalShare1T,
    }),
  }));
}

function assertRequest(request: PredictorWorkerRequest): void {
  if (!request || typeof request !== 'object' || !Number.isInteger(request.id)) {
    throw new Error('mensagem sem id válido');
  }
  if (!Array.isArray(request.weights) || request.weights.length === 0) {
    throw new Error('mensagem sem pesos');
  }
  if (!Array.isArray(request.ufs) || request.ufs.length === 0) {
    throw new Error('mensagem sem UFs');
  }
  if (!Number.isInteger(request.slices) || request.slices <= 0 || request.slices > 100_000) {
    throw new Error('slices inválido');
  }
  if (
    !Number.isFinite(request.curveFallback) ||
    request.curveFallback < 0 ||
    request.curveFallback > 100
  ) {
    throw new Error('curveFallback inválido');
  }
  for (const uf of request.ufs) {
    if (
      !uf ||
      typeof uf.uf !== 'string' ||
      uf.uf.length === 0 ||
      !Number.isFinite(uf.counted) ||
      !Number.isFinite(uf.target) ||
      !Number.isFinite(uf.weight)
    ) {
      throw new Error('UF inválida no payload');
    }
  }
}

async function handle(request: PredictorWorkerRequest): Promise<void> {
  const id = typeof request?.id === 'number' ? request.id : -1;
  try {
    assertRequest(request);
    await ensureRuntime();
    if (!model) model = buildAnalyticModel(tf);
    applyWeights(tf, model, request.weights);
    const result = await rollout(tf, model, rolloutUfs(request), request.slices);
    if (!result) throw new Error('rollout não produziu resultado');
    scope.postMessage({
      id,
      ok: true,
      progress: result.progress,
      curves: result.curves,
      nationalLula: result.nationalLula,
      nationalFlavio: result.nationalFlavio,
    });
  } catch (error) {
    scope.postMessage({ id, ok: false, error: toErrorMessage(error) });
  }
}

scope.onmessage = (event: MessageEvent<PredictorWorkerRequest>): void => {
  const request = event.data;
  // Fila: uma mensagem por vez. `handle` converte falhas em resposta; o catch
  // mantém a fila viva mesmo se o próprio postMessage lançar.
  messageQueue = messageQueue
    .then((): Promise<void> => handle(request))
    .catch((): void => {
      // Fail-Safe: uma mensagem nunca envenena as próximas.
    });
};
