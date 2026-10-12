import localforage from 'localforage';
import type { SessionPoint } from '@/lib/election-predictor/dataset.js';

// Instância isolada (NÃO usa localforage.config global: a página do 1º turno
// configura outro storeName no mesmo DB e reconfigurar quebraria as leituras).
const store = localforage.createInstance({
  name: 'tse-vibecoding',
  storeName: 'election_predictor_2t',
});

const KEY = 'election-predictor-snapshots-v1';
const PER_UF_CAP = 200;

export type SnapshotSeries = Record<string, SessionPoint[]>;

/**
 * Séries 2T da sessão persistidas — mesmo padrão da página do 1º turno
 * (history.ts): ao reiniciar a página, o fine-tune retoma de onde parou em
 * vez de recomeçar do zero. Fail-Safe: IDB indisponível → memória apenas.
 */
export async function loadSnapshotSeries(): Promise<SnapshotSeries> {
  try {
    const v = await store.getItem<SnapshotSeries>(KEY);
    if (v && typeof v === 'object') return v;
  } catch {
    // privado/cheio/bloqueado — segue sem cache.
  }
  return {};
}

export async function saveSnapshotSeries(series: SnapshotSeries): Promise<void> {
  try {
    const trimmed: SnapshotSeries = {};
    for (const [uf, pts] of Object.entries(series)) {
      trimmed[uf] = Array.isArray(pts) ? pts.slice(-PER_UF_CAP) : [];
    }
    await store.setItem(KEY, trimmed);
  } catch {
    // quota/privado — a sessão em memória continua valendo.
  }
}

export async function clearSnapshotSeries(): Promise<void> {
  try {
    await store.removeItem(KEY);
  } catch {
    // sem IDB, nada a limpar.
  }
}
