/**
 * rollout-worker-client — ponte Fail-Safe entre a main thread e o Worker.
 *
 * Contratos:
 * - `runRolloutInWorker` NUNCA rejeita: devolve `RolloutResult` ou `null`.
 *   `null` significa "Worker indisponível/falhou/substituído" — o chamador
 *   roda o rollout na main thread (fallback) ou ignora, se o run já venceu.
 * - Um único rollout em voo. Um pedido novo termina o Worker anterior para
 *   interromper o CPU e evitar resposta obsoleta; `id` ainda descarta
 *   qualquer resposta atrasada.
 * - Timeout de 30s: Worker travado não congela a apuração.
 * - Depois de uma falha de runtime, o Worker fica desativado nesta página
 *   (evita pagar timeout a cada passe); recarregar restabelece.
 * - Listeners, timer e a Promise pendente são sempre limpos em `settle`.
 */
import type { RolloutResult } from '@/lib/election-predictor/rollout.js';
import type {
  PredictorWorkerRequest,
  PredictorWorkerResponse,
} from '@/lib/election-predictor/predictor-worker-protocol.js';

/** Payload da main sem o `id` (atribuído pela ponte). */
export type PredictorWorkerPayload = Omit<PredictorWorkerRequest, 'id'>;

const WORKER_TIMEOUT_MS = 10_000;

interface PendingRollout {
  id: number;
  timer: ReturnType<typeof setTimeout>;
  settle: (result: RolloutResult | null) => void;
  /** UFs esperadas na resposta (curves.length). */
  ufs: number;
  /** Fatias pedidas; o rollout pode devolver 1 quando tudo já está em 100%. */
  slices: number;
}

let worker: Worker | null = null;
let workerDisabled = false;
let nextId = 0;
let pending: PendingRollout | null = null;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  const text = String(error);
  return text.trim().length > 0 ? text : 'predictor worker failed';
}

const isPctArray = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof item === 'number' &&
      Number.isFinite(item) &&
      item >= 0 &&
      item <= 100,
  );

/**
 * Valida o contrato antes de entregar a resposta ao store. Um payload
 * truncado/versão divergente cai no fallback da main em vez de virar
 * `status:'error'` no recompute.
 */
function isValidResult(response: {
  progress: unknown;
  curves: unknown;
  nationalLula: unknown;
  nationalFlavio: unknown;
}, entry: PendingRollout): boolean {
  if (!Array.isArray(response.curves) || response.curves.length !== entry.ufs) {
    return false;
  }
  if (!isPctArray(response.nationalLula) || !isPctArray(response.nationalFlavio)) {
    return false;
  }
  const length = response.nationalLula.length;
  if (length < 1 || length > entry.slices) return false;
  if (!Array.isArray(response.progress) || response.progress.length !== length) {
    return false;
  }
  let previous = 0;
  for (const value of response.progress) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= previous ||
      value > 1
    ) {
      return false;
    }
    previous = value;
  }
  if (previous !== 1) return false;
  return response.curves.every(
    (curve) => isPctArray(curve) && curve.length === length,
  );
}

/** Settle exatamente uma vez; sem timer nem listener pendurado. */
function settle(result: RolloutResult | null): void {
  const entry = pending;
  if (!entry) return;
  pending = null;
  clearTimeout(entry.timer);
  entry.settle(result);
}

function disposeWorker(): void {
  const instance = worker;
  worker = null;
  if (!instance) return;
  instance.onmessage = null;
  instance.onerror = null;
  instance.onmessageerror = null;
  try {
    instance.terminate();
  } catch {
    // Fail-Safe: terminate não pode quebrar o fallback.
  }
}

/**
 * Descarta o Worker e resolve o pedido pendente com `null`.
 * `disable` só é true p/ falha real (erro/timeout/inferência), nunca p/ um
 * pedido substituído por outro mais recente.
 */
function fail(message: string, disable: boolean): void {
  if (disable) workerDisabled = true;
  // Liquida primeiro: um console.warn monkeypatched não pode deixar a
  // Promise pendente nem o Worker vivo.
  disposeWorker();
  settle(null);
  if (disable) {
    // Diagnóstico: a projeção segue na main thread, mas queremos rastro.
    console.warn(`[election-predictor] rollout no Worker falhou (${message}); usando a main thread.`);
  }
}

function createWorker(): Worker {
  if (worker) return worker;
  if (workerDisabled) throw new Error('Worker de rollout desativado nesta sessão');
  if (typeof Worker === 'undefined') {
    workerDisabled = true;
    throw new Error('Worker indisponível neste ambiente');
  }
  let instance: Worker;
  try {
    instance = new Worker(new URL('./predictor.worker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    workerDisabled = true;
    const message = toErrorMessage(error);
    console.warn(`[election-predictor] Worker indisponível (${message}); usando a main thread.`);
    throw error instanceof Error ? error : new Error(message);
  }

  instance.onmessage = (event: MessageEvent<PredictorWorkerResponse>): void => {
    const response = event.data;
    const entry = pending;
    // Resposta órfã (run vencido/timeout): ignora sem tocar no snapshot.
    if (!entry || !response || response.id !== entry.id) return;
    if (response.ok) {
      if (!isValidResult(response, entry)) {
        fail('resposta inválida do Worker', true);
        return;
      }
      settle({
        progress: response.progress,
        curves: response.curves,
        nationalLula: response.nationalLula,
        nationalFlavio: response.nationalFlavio,
      });
      return;
    }
    fail(response.error || 'inferência falhou no Worker', true);
  };

  instance.onerror = (event: ErrorEvent): void => {
    fail(event.message?.trim() || 'erro no Worker', true);
  };

  instance.onmessageerror = (): void => {
    fail('mensagem inválida vinda do Worker', true);
  };

  worker = instance;
  return instance;
}

/** Há Worker disponível nesta página? (Evita serializar pesos à toa.) */
export function isRolloutWorkerAvailable(): boolean {
  return !workerDisabled && typeof Worker !== 'undefined';
}

/**
 * Cancela o pedido pendente sem desabilitar o Worker para sempre. Chamado
 * quando o store invalida um run (0%, UF vazia, erro antes do rollout).
 */
export function cancelRolloutInWorker(): void {
  if (!pending) return;
  fail('pedido cancelado', false);
}

/**
 * Pede o rollout ao Worker. Resume com `null` em qualquer cenário não-feliz;
 * o chamador compara `runId` antes de decidir entre usar o resultado e cair
 * no rollout da main thread.
 */
export function runRolloutInWorker(
  payload: PredictorWorkerPayload,
): Promise<RolloutResult | null> {
  if (workerDisabled || typeof Worker === 'undefined') return Promise.resolve(null);

  // Last-wins: o run anterior já foi invalidado por `runId`; terminá-lo
  // interrompe o CPU em vez de enfileirar trabalho que será descartado.
  if (pending) fail('pedido substituído', false);

  let instance: Worker;
  try {
    instance = createWorker();
  } catch {
    return Promise.resolve(null);
  }

  const id = nextId + 1;
  nextId = id;

  return new Promise<RolloutResult | null>((resolve) => {
    const timer = setTimeout((): void => {
      fail(`timeout de ${WORKER_TIMEOUT_MS}ms`, true);
    }, WORKER_TIMEOUT_MS);

    pending = {
      id,
      timer,
      settle: resolve,
      ufs: payload.ufs.length,
      slices: payload.slices,
    };

    try {
      instance.postMessage({ ...payload, id } satisfies PredictorWorkerRequest);
    } catch (error) {
      fail(`postMessage: ${toErrorMessage(error)}`, true);
    }
  });
}
