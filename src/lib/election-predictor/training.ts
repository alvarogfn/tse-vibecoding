import type * as tfTypes from '@tensorflow/tfjs';
import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import { buildAnalyticModel } from '@/lib/election-predictor/analytic-model.js';
import { fetchFirstTurnBaselines } from '@/lib/election-predictor/baselines.js';
import type { FirstTurnBaseline } from '@/lib/election-predictor/baselines.js';
import { pretrainRows, toDataset } from '@/lib/election-predictor/dataset.js';
import type { TrainRow } from '@/lib/election-predictor/dataset.js';

const IDB_URL = 'indexeddb://election-predictor-v1';
const PRETRAIN_EPOCHS = 25;
const ONLINE_EPOCHS = 5;

let cached: tfTypes.LayersModel | null = null;
let pretrained = false;

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
  const baselines = await fetchFirstTurnBaselines().catch(() => null);
  if (baselines && baselines.length > 0) {
    await fitRows(tf, model, pretrainRows(baselines), PRETRAIN_EPOCHS);
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

export type { FirstTurnBaseline };
export { PRETRAIN_EPOCHS, ONLINE_EPOCHS, IDB_URL };
export function isPretrained(): boolean {
  return pretrained;
}
