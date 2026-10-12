/**
 * election-predictor — real-time electoral projection (TensorFlow.js, client-side).
 *
 * Pipeline (per repo doc `previsao-eleitoral-com-tensorflow-js.md`):
 *  1. Per-UF dense feedforward inference (6 normalized features → sigmoid).
 *  2. Residual-delta-swing vs the structural anchor + stabilization blend
 *     `alpha = min(1, counted/60)` toward the anchor
 *     (anchor = 1T final ?? poll ?? current ?? 50).
 *  3. Bottom-up national aggregation: Σ(uf_pred × weight)/Σweight with
 *     weight = eleitorado || validos; Flávio national = 100 − Lula national.
 *
 * Execution contracts:
 * - Fail-Fast: per-UF math/inference throws upward; the async recompute
 *   boundary maps ANY failure to `{ status: 'error', error }`.
 * - Fail-Safe: the store never throws to subscribers; TF/load failures keep
 *   the previous series (if any) and only flip status/error.
 * - tfjs is lazy-loaded (`await import('@tensorflow/tfjs')` + `tf.ready()`)
 *   so the initial bundle stays lean; every tensor op lives in `tf.tidy()`.
 */
import { useSyncExternalStore } from 'react';
import {
  BR_FLAVIO_COLOR,
  BR_LULA_COLOR,
  BR_WIDTH,
  UF_DEFAULT_COLOR,
  UF_WIDTH,
  lightOf,
  pastelOf,
} from '@/lib/election-predictor/colors.js';
import {
  clampCounted,
  clampPct,
  cleanShare,
  resolveAnchor,
  weightOf,
} from '@/lib/election-predictor/features.js';
import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import { ensurePretrainedModel, fineTuneModel, resetSavedModel } from '@/lib/election-predictor/training.js';
import { fetchFirstTurnBaselines } from '@/lib/election-predictor/baselines.js';
import type { FirstTurnBaseline } from '@/lib/election-predictor/baselines.js';
import { onlineRows } from '@/lib/election-predictor/dataset.js';
import { loadSnapshotSeries, saveSnapshotSeries } from '@/lib/election-predictor/snapshots.js';
import { rollout, ROLLOUT_SLICES } from '@/lib/election-predictor/rollout.js';
import { POLL_VALID_LULA } from '@/lib/election-predictor/transfer.js';

export interface PredictorPoint {
  x: number;
  y: number | null;
}

export interface PredictorSeries {
  id: string;
  label: string;
  kind: 'uf' | 'br-flavio' | 'br-lula';
  counted: number;
  history: PredictorPoint[];
  estimate: PredictorPoint[];
  color: string;
  lightColor: string;
  width: number;
}

export type PredictorStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PredictorSnapshot {
  status: PredictorStatus;
  series: PredictorSeries[];
  updatedAt: number | null;
  error: string | null;
}

export interface PredictorUfInput {
  uf: string;
  counted: number;
  lulaShare: number | null;
  validos: number;
  eleitorado: number;
  color?: string;
  baseline1T?: number | null;
  pollAvg?: number | null;
  ptBias?: number | null;
}

export interface PredictorInputs {
  ufs: PredictorUfInput[];
  nationalCounted: number;
  nationalShare: number | null;
}

// ---------------------------------------------------------------------------
// External store (stable snapshot refs for useSyncExternalStore)
// ---------------------------------------------------------------------------

const INITIAL_SNAPSHOT: PredictorSnapshot = {
  status: 'idle',
  series: [],
  updatedAt: null,
  error: null,
};

let current: PredictorSnapshot = INITIAL_SNAPSHOT;
let version = 0;
const listeners = new Set<() => void>();
/** Monotonic run id — guards overlapping recomputes (last push wins). */
let runId = 0;
/** Key of the last pushed inputs — identical polls skip the pass (no chart rebuild). */
let lastInputsKey: string | null = null;

function setSnapshot(next: PredictorSnapshot): void {
  current = next;
  version += 1;
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // Fail-Safe: a broken subscriber must never break the store.
    }
  }
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return (): void => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): PredictorSnapshot {
  return current;
}

function getServerSnapshot(): PredictorSnapshot {
  return INITIAL_SNAPSHOT;
}

// ---------------------------------------------------------------------------
// Prediction math (pure; throws Fail-Fast, caught at the recompute boundary)
// ---------------------------------------------------------------------------

interface PreparedUf {
  input: PredictorUfInput;
  counted: number;
  anchor: number;
  weight: number;
  share: number | null;
  baseline1T: number | null;
  pollAvg: number | null;
  ptBias: number | null;
}

function prepareUf(input: PredictorUfInput, base: FirstTurnBaseline | undefined): PreparedUf {
  const counted = clampCounted(input.counted);
  const rawShare = cleanShare(input.lulaShare);
  // 0 votos com 0% apurado = ausência de evidência, NÃO 0% de apoio.
  // Sem esse guarda a âncora colapsava a 0 e o gráfico cravava 100×0.
  const share = rawShare === 0 && counted <= 0 ? null : rawShare;
  const baseline1T = input.baseline1T ?? base?.lula1T ?? null;
  const pollAvg = input.pollAvg ?? POLL_VALID_LULA;
  // Viés pró-Lula/PT estrutural: sem dataset multieleição, o próprio 1T da UF
  // é o proxy (UF com Lula alto no 1T = reduto pró-PT) — entra na feature 5.
  const ptBias = input.ptBias ?? (base?.lula1T != null ? base.lula1T / 100 : null);
  return {
    input,
    counted,
    anchor: resolveAnchor(baseline1T, pollAvg, share),
    weight: weightOf(input.eleitorado, input.validos),
    share,
    baseline1T,
    pollAvg,
    ptBias,
  };
}

/** Solid factual segment: anchor at x=0 → observed share at x=counted. */
function historyFor(counted: number, anchor: number, share: number | null): PredictorPoint[] {
  if (share == null) return [];
  return [
    { x: 0, y: clampPct(anchor) },
    { x: counted, y: clampPct(share) },
  ];
}

/** Média ponderada das âncoras das UFs (mesmos pesos do bottom-up). */
function anchorOf(prepared: PreparedUf[]): number {
  let tw = 0;
  let sw = 0;
  let sum = 0;
  for (const p of prepared) {
    tw += p.weight;
    sw += p.anchor * p.weight;
    sum += p.anchor;
  }
  return clampPct(tw > 0 ? sw / tw : sum / Math.max(1, prepared.length));
}

/** Curva de N fatias → pontos {x, y} do counted (exclusive) até 100. */
function curvePoints(counted: number, ys: number[]): PredictorPoint[] {
  const n = ys.length;
  return ys.map((y, i) => ({
    x: n > 0 ? counted + ((100 - counted) * (i + 1)) / n : 100,
    y: clampPct(y),
  }));
}

/** Série de UF com projeção em 1000 fatias (flutuações do modelo, não reta). */
function ufSeriesFromCurve(p: PreparedUf, ys: number[]): PredictorSeries {
  const color = pastelOf(p.input.color ?? UF_DEFAULT_COLOR);
  const start = p.share != null ? clampPct(p.share) : clampPct(p.anchor);
  return {
    id: `uf-${p.input.uf.toLowerCase()}`,
    label: p.input.uf.toUpperCase(),
    kind: 'uf',
    counted: p.counted,
    history: historyFor(p.counted, p.anchor, p.share),
    estimate: [{ x: p.counted, y: start }, ...curvePoints(p.counted, ys)],
    color,
    lightColor: lightOf(color),
    width: UF_WIDTH,
  };
}

/** Série nacional com projeção em 1000 fatias (bottom-up por fatia). */
function nationalSeriesFromCurve(
  id: 'br-flavio' | 'br-lula',
  label: 'Brasil · Flávio' | 'Brasil · Lula',
  counted: number,
  anchor: number,
  share: number | null,
  ys: number[],
  color: string,
): PredictorSeries {
  const start = share != null ? clampPct(share) : clampPct(anchor);
  return {
    id,
    label,
    kind: id,
    counted,
    history: historyFor(counted, anchor, share),
    estimate: [{ x: counted, y: start }, ...curvePoints(counted, ys)],
    color,
    lightColor: lightOf(color),
    width: BR_WIDTH,
  };
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  const text = String(err);
  return text.trim().length > 0 ? text : 'Election predictor inference failed';
}

// ---------------------------------------------------------------------------
// Async recompute (boundary: Fail-Fast inside → Fail-Safe snapshot outside)
// ---------------------------------------------------------------------------

interface SanitizedInputs {
  ufs: PredictorUfInput[];
  nationalCounted: number;
  nationalShare: number | null;
}

/**
 * Stable identity for an inputs payload. Polling rebuilds the object every
 * cycle with the same values — comparing keys avoids recompute + notify, so
 * `useSyncExternalStore` subscribers (and the chart memos) never fire.
 */
function inputsKey(sanitized: SanitizedInputs): string {
  const ufs = sanitized.ufs.map((u) => [
    u.uf,
    u.counted,
    u.lulaShare,
    u.validos,
    u.eleitorado,
    u.color ?? '',
    u.baseline1T ?? '',
    u.pollAvg ?? '',
    u.ptBias ?? '',
  ]);
  return JSON.stringify({ u: ufs, c: sanitized.nationalCounted, s: sanitized.nationalShare });
}

/** In-session 2T series per UF (p/ fine-tune online); cap p/ não crescer sem limite. */
const sessionSeries = new Map<string, Array<{ counted: number; share: number | null }>>();
const SESSION_CAP = 200;
/** Séries restauradas do IndexedDB uma única vez (primeiro recompute). */
let snapshotsRestored = false;

function isValidPoint(p: unknown): p is { counted: number; share: number | null } {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Record<string, unknown>;
  return Number.isFinite(r['counted']) && (r['share'] == null || Number.isFinite(r['share']));
}

async function recompute(sanitized: SanitizedInputs, myRun: number): Promise<void> {
  try {
    const tf: TfModule = await import('@tensorflow/tfjs');
    await tf.ready();
    // Pré-treino 1T (uma vez; depois IndexedDB) + modelo pronto.
    const model = await ensurePretrainedModel(tf);
    if (myRun !== runId) return;
    const baselines = await fetchFirstTurnBaselines().catch(() => null);
    if (myRun !== runId) return;
    const baseByUf = new Map((baselines ?? []).map((b) => [b.uf.toLowerCase(), b]));

    // Sequential Fail-Fast pass: first throw aborts this run; the catch
    // below converts it to the `error` snapshot (stale runs stay silent).
    const prepared: PreparedUf[] = sanitized.ufs.map((u) =>
      prepareUf(u, baseByUf.get(u.uf.toLowerCase())),
    );
    if (prepared.length === 0) {
      if (myRun === runId) setSnapshot({ status: 'idle', series: [], updatedAt: null, error: null });
      return;
    }
    // Stale runs must not touch training history: a newer push may have
    // bumped runId while awaits above resolved (H1: no poisoned snapshots).
    if (myRun !== runId) return;

    // Acumula a série 2T da sessão (só muda quando counted/share mudam) e
    // refina os pesos com (pré-treino 1T implícito nos pesos + snapshots 2T).
    // No primeiro recompute, restaura antes as séries salvas no IndexedDB
    // (padrão da página do 1º turno): reiniciar a página não zera o treino.
    if (!snapshotsRestored) {
      snapshotsRestored = true;
      const persisted = await loadSnapshotSeries().catch(
        (): Record<string, Array<{ counted: number; share: number | null }>> => ({}),
      );
      if (myRun !== runId) return;
      for (const [key, pts] of Object.entries(persisted)) {
        if (!sessionSeries.has(key) && Array.isArray(pts)) {
          sessionSeries.set(
            key,
            pts.filter(isValidPoint).slice(-SESSION_CAP),
          );
        }
      }
    }
    let seriesChanged = false;
    for (const p of prepared) {
      const key = p.input.uf.toLowerCase();
      const arr = sessionSeries.get(key) ?? [];
      const last = arr[arr.length - 1];
      if (!last || last.counted !== p.counted || last.share !== p.share) {
        arr.push({ counted: p.counted, share: p.share });
        if (arr.length > SESSION_CAP) arr.shift();
        sessionSeries.set(key, arr);
        seriesChanged = true;
      }
    }
    if (seriesChanged) void saveSnapshotSeries(Object.fromEntries(sessionSeries));
    await fineTuneModel(tf, model, onlineRows(sessionSeries, baseByUf));
    if (myRun !== runId) return;

    // Rollout: o modelo prevê cada uma das 1000 fatias do % restante por UF;
    // a nacional é o bottom-up por fatia (flutua junto, sem falácia ecológica).
    const { curves, nationalLula, nationalFlavio } =
      (await rollout(
        tf,
        model,
        prepared.map((p) => ({
          counted: p.counted,
          share: p.share,
          anchor: p.anchor,
          baseline1T: p.baseline1T,
          pollAvg: p.pollAvg,
          ptBias: p.ptBias,
          weight: p.weight,
        })),
        ROLLOUT_SLICES,
        () => myRun !== runId,
      )) ?? { curves: [], nationalLula: [], nationalFlavio: [] };
    if (myRun !== runId) return; // superseded — last push wins, no notify.

    const natCounted = clampCounted(sanitized.nationalCounted);
    const natRaw = cleanShare(sanitized.nationalShare);
    const natShare = natRaw === 0 && natCounted <= 0 ? null : natRaw;
    const natAnchor = anchorOf(prepared);
    const flavioShare = natShare != null ? clampPct(100 - natShare) : null;

    // UFs first, nationals last: Chart.js paints later datasets on top,
    // so the thick mains stay above the thin UF lines (H3).
    const series: PredictorSeries[] = [
      ...prepared.map((p, i) => ufSeriesFromCurve(p, curves[i] ?? [])),
      nationalSeriesFromCurve(
        'br-flavio',
        'Brasil · Flávio',
        natCounted,
        clampPct(100 - natAnchor),
        flavioShare,
        nationalFlavio,
        BR_FLAVIO_COLOR,
      ),
      nationalSeriesFromCurve(
        'br-lula',
        'Brasil · Lula',
        natCounted,
        natAnchor,
        natShare,
        nationalLula,
        BR_LULA_COLOR,
      ),
    ];

    setSnapshot({ status: 'ready', series, updatedAt: Date.now(), error: null });
  } catch (err) {
    if (myRun !== runId) return; // superseded — stay silent.
    // Retryable: forget the failed inputs key so the next identical poll
    // retries instead of sticking on the error snapshot forever (H2).
    lastInputsKey = null;
    // Fail-Safe: surface the error, keep the previous series (if any).
    setSnapshot({
      status: 'error',
      series: current.series,
      updatedAt: current.updatedAt,
      error: toErrorMessage(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/** Últimos inputs válidos — p/ retreinar do zero sem esperar o próximo poll. */
let lastSanitized: SanitizedInputs | null = null;

export function pushPredictorInputs(inputs: PredictorInputs): void {
  const ufs = Array.isArray(inputs.ufs) ? inputs.ufs : [];
  if (ufs.length === 0) {
    // Empty-data state: nothing to predict — idle with no series.
    runId += 1; // invalidate any in-flight recompute.
    lastInputsKey = null;
    setSnapshot({ status: 'idle', series: [], updatedAt: null, error: null });
    return;
  }
  const sanitized: SanitizedInputs = {
    ufs,
    nationalCounted: inputs.nationalCounted,
    nationalShare: inputs.nationalShare ?? null,
  };
  // Cheapest rebuild fix: identical inputs (same values, new object identity
  // from the 15s poll) skip the pass entirely — no loading flash, no notify,
  // so the chart memos keep their refs and Chart.js doesn't rebuild.
  const key = inputsKey(sanitized);
  if (key === lastInputsKey) return;
  lastInputsKey = key;
  lastSanitized = sanitized;
  const myRun = runId + 1;
  runId = myRun;
  // Keep the previous series visible while the new pass computes.
  setSnapshot({ status: 'loading', series: current.series, updatedAt: current.updatedAt, error: null });
  void recompute(sanitized, myRun);
}

export function useElectionPredictor(): PredictorSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Apaga o modelo salvo e retreina DO ZERO com os dados atuais (1T ponderado
 * + snapshots 2T já apurados, mantidos). O próximo push continua incremental.
 */
export function retrainPredictorFromScratch(): void {
  const myRun = runId + 1;
  runId = myRun;
  lastInputsKey = null;
  setSnapshot({ status: 'loading', series: current.series, updatedAt: current.updatedAt, error: null });
  void (async (): Promise<void> => {
    try {
      const tf: TfModule = await import('@tensorflow/tfjs');
      await tf.ready();
      await resetSavedModel(tf);
      if (myRun !== runId || lastSanitized == null) return;
      // Marca como processado p/ o próximo poll idêntico não repetir o passe.
      lastInputsKey = inputsKey(lastSanitized);
      await recompute(lastSanitized, myRun);
    } catch (err) {
      if (myRun !== runId) return;
      setSnapshot({
        status: 'error',
        series: current.series,
        updatedAt: current.updatedAt,
        error: err instanceof Error && err.message.trim() ? err.message : 'Falha ao retreinar do zero.',
      });
    }
  })();
}
