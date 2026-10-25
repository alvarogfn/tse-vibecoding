import type * as tfTypes from '@tensorflow/tfjs';
import type { TfModule } from '@/lib/election-predictor/analytic-model.js';
import { buildAnalyticModel, compileModel } from '@/lib/election-predictor/analytic-model.js';
import { toDataset } from '@/lib/election-predictor/dataset.js';
import type { TrainRow } from '@/lib/election-predictor/dataset.js';
import { INPUT_DIM } from '@/lib/election-predictor/features.js';

// v6: entrada com 7 features do doc + one-hot UF (dim 34). Pesos v5 (dim 30)
// são incompatíveis e viram órfãos. O modelo nasce dos priors analíticos e só
// aprende com os snapshots da apuração.
const IDB_URL = 'indexeddb://election-predictor-v6';
const ONLINE_EPOCHS = 5;

let cached: tfTypes.LayersModel | null = null;
/** Checkpoints de regimes anteriores (v1–v4) — órfãos que só gastam quota (N10). */
let orphansCleaned = false;
/** Fila de treino: fitDataset concorrentes no mesmo singleton se corrompem (N3). */
let trainChain: Promise<void> = Promise.resolve();
/** De onde vieram os pesos: 'indexeddb' | 'checkpoint' | 'analitico'. */
let provenance = 'novo';

/** Origem dos pesos em uso (p/ diagnóstico visível no card). */
export function modelProvenance(): string {
  return provenance;
}

/** Checkpoints antigos (30 features) não podem ser usados com 34. */
function assertInputDim(model: tfTypes.LayersModel): void {
  const dim = model.inputs[0]?.shape?.[1];
  if (dim != null && dim !== INPUT_DIM) {
    throw new Error(`checkpoint com ${dim} features; esperado ${INPUT_DIM}`);
  }
}

/**
 * Modelo pronto: tenta IndexedDB (fit anterior) → checkpoint estático →
 * priors analíticos (sem treino; salva no IDB p/ o fine-tune retomar).
 * Chamadas seguintes retornam o singleton (treino incremental via fineTune).
 */
export async function ensureModel(tf: TfModule): Promise<tfTypes.LayersModel> {
  if (cached) return cached;
  if (!orphansCleaned) {
    orphansCleaned = true;
    void (async (): Promise<void> => {
      for (const url of [
        'indexeddb://election-predictor-v1',
        'indexeddb://election-predictor-v2',
        'indexeddb://election-predictor-v3',
        'indexeddb://election-predictor-v4',
        'indexeddb://election-predictor-v5',
      ]) {
        try {
          await tf.io.removeModel(url);
        } catch {
          // Ausente ou IDB bloqueado — segue.
        }
      }
    })();
  }
  try {
    cached = await tf.loadLayersModel(IDB_URL);
    assertInputDim(cached);
    // Pesos persistidos vêm SEM optimizer: recompilar antes de qualquer
    // fine-tune (senão fitDataset lança e o preditor morre no 1º snapshot).
    compileModel(tf, cached);
    provenance = 'indexeddb';
    return cached;
  } catch {
    // sem modelo salvo — segue p/ checkpoint ou priors analíticos.
  }
  try {
    cached = await tf.loadLayersModel(`${import.meta.env.BASE_URL}models/predictor/model.json`);
    assertInputDim(cached);
    compileModel(tf, cached);
    provenance = 'checkpoint';
    return cached;
  } catch {
    // sem checkpoint publicado — priors analíticos, sem treino.
  }
  const model = buildAnalyticModel(tf);
  await saveQuietly(model);
  provenance = 'analitico';
  cached = model;
  return model;
}

/** Fine-tune online (warm-start nos pesos atuais) + salva no IndexedDB. */
export async function fineTuneModel(tf: TfModule, model: tfTypes.LayersModel, rows: TrainRow[]): Promise<void> {
  if (rows.length === 0) return;
  await fitRows(tf, model, rows, ONLINE_EPOCHS);
  await saveQuietly(model);
}

async function fitRowsInner(tf: TfModule, model: tfTypes.LayersModel, rows: TrainRow[], epochs: number): Promise<void> {
  const ds = toDataset(tf, rows, Math.min(32, rows.length));
  await model.fitDataset(ds, {
    epochs,
    verbose: 0,
    callbacks: {
      // Persiste a CADA epoch: reiniciando a página, o modelo recarregado do
      // IndexedDB é sempre o mais recente treinado.
      onEpochEnd: async () => {
        await saveQuietly(model);
      },
    },
  });
}

// Fits concorrentes no mesmo singleton se corromperiam (N3): serializa numa
// cadeia — o segundo espera o primeiro em vez de intercalar pesos.
async function fitRows(tf: TfModule, model: tfTypes.LayersModel, rows: TrainRow[], epochs: number): Promise<void> {
  const run = trainChain.then(() => fitRowsInner(tf, model, rows, epochs));
  trainChain = run.catch(() => {});
  await run;
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
}

export { ONLINE_EPOCHS, IDB_URL };
