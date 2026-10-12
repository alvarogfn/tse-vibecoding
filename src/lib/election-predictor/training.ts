import type * as tfTypes from '@tensorflow/tfjs';
import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import { buildAnalyticModel } from '@/lib/election-predictor/analytic-model.js';
import { fetchFirstTurnBaselines, fetchFirstTurnSeries } from '@/lib/election-predictor/baselines.js';
import type { FirstTurnBaseline } from '@/lib/election-predictor/baselines.js';
import { pretrainRows, seriesPretrainRows, toDataset } from '@/lib/election-predictor/dataset.js';
import type { TrainRow } from '@/lib/election-predictor/dataset.js';

const IDB_URL = 'indexeddb://election-predictor-v1';
const PRETRAIN_EPOCHS = 25;
const ONLINE_EPOCHS = 5;

/** Final nacional bottom-up dos baselines (p/ alvo das séries nacionais). */
let cached: tfTypes.LayersModel | null = null;
let pretrained = false;
function nationalFinalOf(
  baselines: FirstTurnBaseline[] | null,
): { lula1T: number | null; eliminated: number | null } {
  if (!baselines || baselines.length === 0) return { lula1T: null, eliminated: null };
  let tw = 0;
  let sl = 0;
  let sf = 0;
  for (const b of baselines) {
    const w = b.validos > 0 ? b.validos : 0;
    if (b.lula1T == null || b.flavio1T == null || w <= 0) continue;
    tw += w;
    sl += b.lula1T * w;
    sf += b.flavio1T * w;
  }
  if (tw <= 0) return { lula1T: null, eliminated: null };
  const lula1T = sl / tw;
  return { lula1T, eliminated: Math.max(0, 100 - lula1T - sf / tw) };
}

/**
 * Modelo pronto: tenta IndexedDB (fit anterior) → checkpoint estático →
 * priors analíticos + PRÉ-TREINO nos finais 1T transferidos (salva no IDB).
 * Chamadas seguintes retornam o singleton (treino incremental via fineTune).
 */
export async function ensurePretrainedModel(tf: TfModule): Promise<tfTypes.LayersModel> {
  if (cached) return cached;
  try {
    cached = await tf.loadLayersModel(IDB_URL);
    pretrained = true;
    return cached;
  } catch {
    // sem modelo salvo — segue p/ checkpoint ou priors + pré-treino.
  }
  try {
    cached = await tf.loadLayersModel(`${import.meta.env.BASE_URL}models/predictor/model.json`);
    pretrained = true;
    return cached;
  } catch {
    // sem checkpoint publicado — priors analíticos + pré-treino local.
  }
  const model = buildAnalyticModel(tf);
  // Pré-treino nas SÉRIES temporais do 1T (1-turn-data/): o modelo vê a
  // dinâmica por tempo de cada UF + nacional, com alvo = final transferido
  // (pesquisas ponderadas). Fallback: só os finais. Depois salva no IDB.
  const [series, baselines] = await Promise.all([
    fetchFirstTurnSeries().catch(() => null),
    fetchFirstTurnBaselines().catch(() => null),
  ]);
  let rows: TrainRow[] = [];
  if (series) {
    const finalsByUf = new Map((baselines ?? []).map((b) => [b.uf.toLowerCase(), b]));
    const nat = nationalFinalOf(baselines);
    rows = seriesPretrainRows(series.national, series.byUf, (uf) =>
      uf == null
        ? nat
        : {
            lula1T: finalsByUf.get(uf)?.lula1T ?? null,
            eliminated: finalsByUf.get(uf)?.eliminated ?? null,
          },
    );
  }
  if (rows.length === 0 && baselines && baselines.length > 0) {
    rows = pretrainRows(baselines);
  }
  if (rows.length > 0) {
    await fitRows(tf, model, rows, PRETRAIN_EPOCHS);
  }
  await saveQuietly(model);
  pretrained = true;
  cached = model;
  return model;
}

/** Fine-tune online (warm-start nos pesos atuais) + salva no IndexedDB. */
export async function fineTuneModel(tf: TfModule, model: tfTypes.LayersModel, rows: TrainRow[]): Promise<void> {
  if (rows.length === 0) return;
  await fitRows(tf, model, rows, ONLINE_EPOCHS);
  await saveQuietly(model);
}

async function fitRows(tf: TfModule, model: tfTypes.LayersModel, rows: TrainRow[], epochs: number): Promise<void> {
  const ds = toDataset(tf, rows, Math.min(32, rows.length));
  await model.fitDataset(ds, {
    epochs,
    verbose: 0,
    callbacks: {
      // Persiste a CADA epoch: reiniciando a página, o modelo recarregado do
      // IndexedDB é sempre o mais recente treinado (nunca o pré-treino cru).
      onEpochEnd: async () => {
        await saveQuietly(model);
      },
    },
  });
}

/** Salva no IndexedDB; falha (quota/modo privado) nunca quebra a apuração. */
async function saveQuietly(model: tfTypes.LayersModel): Promise<void> {
  try {
    await model.save(IDB_URL);
  } catch {
    // Fail-Safe: o modelo em memória continua valendo p/ a sessão.
  }
}

/** Apaga o checkpoint do IndexedDB e limpa o singleton em memória. */
export async function resetSavedModel(tf: TfModule): Promise<void> {
  try {
    await tf.io.removeModel(IDB_URL);
  } catch {
    // Fail-Safe: nada salvo ou IDB indisponível — segue p/ rebuild.
  }
  if (cached) {
    try {
      cached.dispose();
    } catch {
      // dispose nunca quebra o reset.
    }
  }
  cached = null;
  pretrained = false;
}

export type { FirstTurnBaseline };
export { PRETRAIN_EPOCHS, ONLINE_EPOCHS, IDB_URL };
export function isPretrained(): boolean {
  return pretrained;
}
