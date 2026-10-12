import { UFS, fetchRaceJson, parseRace } from '@/lib/tse.js';

export interface BaselineCandidate {
  numero: string;
  nomeUrna: string;
  partido: string;
  votos: number;
  pvap: number;
}

export interface FirstTurnBaseline {
  uf: string;
  lula1T: number | null;
  flavio1T: number | null;
  /** Pool eliminado em pp dos válidos: 100 − lula − flavio. */
  eliminated: number | null;
  validos: number;
  eleitorado: number;
  /** Top 6 do 1T na UF (p/ conversão 3º/4º/5º lugares). */
  top: BaselineCandidate[];
}

const FILE_URL = `${import.meta.env.BASE_URL}temp-data/first-turn-2026.json`;
const EVOL_BASE = `${import.meta.env.BASE_URL}1-turn-data/`;

export interface EvolutionPoint {
  counted: number;
  share: number;
}

export interface UfEvolutionPoint extends EvolutionPoint {
  /** Numero do líder naquele instante (p/ saber se a curva é do Lula). */
  numero: string;
}

export interface FirstTurnSeries {
  /** Curva nacional do Lula no 1T: 119 instantes. */
  national: EvolutionPoint[];
  /** Curvas de líder por UF (minúscula): share do líder ± quem era. */
  byUf: Map<string, UfEvolutionPoint[]>;
}

async function fetchEvolFile(name: string): Promise<{ columns: string[]; data: Record<string, number[] | string[]> }> {
  const res = await fetch(`${EVOL_BASE}${name}.json`, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} em 1-turn-data/${name}`);
  return (await res.json()) as { columns: string[]; data: Record<string, number[] | string[]> };
}

const col = (data: Record<string, number[] | string[]>, name: string): Array<number | string> =>
  (data[name] ?? []) as Array<number | string>;
const numAt = (arr: Array<number | string>, i: number): number => {
  const v = arr[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : parseFloat(String(v ?? '').replace(',', '.')) || 0;
};

/**
 * Séries temporais do 1T (arquivos de evolução do TSE em 1-turn-data/):
 * - nacional: share do Lula (nr 13) por instante × % seções totalizadas;
 * - por UF: share do líder por instante (p/ pré-treino da dinâmica local).
 * Falha → null e o pré-treino usa só os finais (baselines).
 */
let seriesCache: Promise<FirstTurnSeries | null> | null = null;

export function fetchFirstTurnSeries(): Promise<FirstTurnSeries | null> {
  if (!seriesCache) seriesCache = loadSeries().catch(() => null);
  return seriesCache;
}

async function loadSeries(): Promise<FirstTurnSeries | null> {
  const [votacao, resumoGeral, resumoUf] = await Promise.all([
    fetchEvolFile('votacao-brasil'),
    fetchEvolFile('resumo-geral'),
    fetchEvolFile('resumo-uf'),
  ]);
  const vTs = col(votacao.data, 'dt_data').map(String);
  const vNr = col(votacao.data, 'nr_votavel');
  const vNom = col(votacao.data, 'qt_votos_nominais');
  const gTs = col(resumoGeral.data, 'dt_data').map(String);
  const gCounted = col(resumoGeral.data, 'pct_secoes_totalizadas');
  const countedByTs = new Map<string, number>();
  gTs.forEach((t, i) => {
    if (!countedByTs.has(t)) countedByTs.set(t, numAt(gCounted, i));
  });
  // Válidos por instante = nominais − branco(95) − nulos(94, 96).
  const BLANK_NULL = new Set([94, 95, 96]);
  const validByTs = new Map<string, number>();
  const lulaByTs = new Map<string, number>();
  for (let i = 0; i < vTs.length; i += 1) {
    const t = vTs[i];
    if (t == null) continue;
    const nr = Number(vNr[i]);
    const votes = numAt(vNom, i);
    validByTs.set(t, (validByTs.get(t) ?? 0) + (BLANK_NULL.has(nr) ? 0 : votes));
    if (nr === 13) lulaByTs.set(t, (lulaByTs.get(t) ?? 0) + votes);
  }
  const national: EvolutionPoint[] = [];
  for (const [t, counted] of countedByTs) {
    const valid = validByTs.get(t) ?? 0;
    if (valid <= 0) continue;
    national.push({ counted, share: ((lulaByTs.get(t) ?? 0) / valid) * 100 });
  }
  national.sort((a, b) => a.counted - b.counted);

  const uTs = col(resumoUf.data, 'dt_data').map(String);
  const uUf = col(resumoUf.data, 'sg_ue_uf').map(String);
  const uCounted = col(resumoUf.data, 'pct_secoes_totalizadas');
  const uShare = col(resumoUf.data, 'pct_votos_lider');
  const uNr = col(resumoUf.data, 'nr_votavel_lider');
  const byUf = new Map<string, UfEvolutionPoint[]>();
  for (let i = 0; i < uTs.length; i += 1) {
    const uf = (uUf[i] ?? '').toLowerCase();
    if (!uf || uf === 'zz') continue;
    const arr = byUf.get(uf) ?? [];
    arr.push({ counted: numAt(uCounted, i), share: numAt(uShare, i), numero: String(uNr[i] ?? '') });
    byUf.set(uf, arr);
  }
  for (const arr of byUf.values()) arr.sort((a, b) => a.counted - b.counted);
  if (national.length === 0 && byUf.size === 0) return null;
  return { national, byUf };
}

function fullName(nmu: string | null | undefined, nm: string | null | undefined): string {
  return `${nmu ?? ''} ${nm ?? ''}`.toUpperCase();
}

function num(x: unknown): number {
  if (typeof x === 'number') return x;
  return parseFloat(String(x ?? '').replace(/\./g, '').replace(',', '.')) || 0;
}

interface TempDataFile {
  ufs?: Record<string, { pst?: unknown; validos?: unknown; eleitorado?: unknown; top?: BaselineCandidate[] }>;
}

/** Extrai lula/flavio/eliminados de um top[] (arquivo ou parse ao vivo). */
function fromTop(uf: string, top: BaselineCandidate[], validos: number, eleitorado: number): FirstTurnBaseline {
  const isLula = (c: BaselineCandidate): boolean => fullName(c.nomeUrna, null).includes('LULA');
  const isFlavio = (c: BaselineCandidate): boolean => {
    const n = fullName(c.nomeUrna, null);
    return n.includes('BOLSONARO') || n.includes('FLAVIO');
  };
  const lula = top.find(isLula);
  const flavio = top.find(isFlavio);
  const lula1T = lula ? num(lula.pvap) : null;
  const flavio1T = flavio ? num(flavio.pvap) : null;
  return {
    uf,
    lula1T,
    flavio1T,
    eliminated: lula1T != null && flavio1T != null ? Math.max(0, 100 - lula1T - flavio1T) : null,
    validos,
    eleitorado,
    top: top.slice(0, 6),
  };
}

/**
 * Finais do 1º turno p/ presidente por UF. Fonte primária: o arquivo
 * `public/temp-data/first-turn-2026.json` (gerado do TSE, commitado);
 * fallback: os arquivos ele6257 ao vivo. Uma chamada por sessão (cache).
 * Falha total → null e o preditor segue só com priors/polls (Fail-Safe).
 */
let cache: Promise<FirstTurnBaseline[] | null> | null = null;

export function fetchFirstTurnBaselines(): Promise<FirstTurnBaseline[] | null> {
  if (!cache) cache = load();
  return cache;
}

async function load(): Promise<FirstTurnBaseline[] | null> {
  const fromFile = await loadFromFile().catch(() => null);
  if (fromFile && fromFile.length > 0) return fromFile;
  return loadLive().catch(() => null);
}

async function loadFromFile(): Promise<FirstTurnBaseline[] | null> {
  const res = await fetch(FILE_URL, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} no temp-data 1T`);
  const json = (await res.json()) as TempDataFile;
  const ufs = json.ufs || {};
  const out = Object.entries(ufs).map(([uf, st]) =>
    fromTop(uf, Array.isArray(st.top) ? st.top : [], num(st.validos), num(st.eleitorado)),
  );
  return out.length > 0 ? out : null;
}

async function loadLive(): Promise<FirstTurnBaseline[] | null> {
  const out: FirstTurnBaseline[] = [];
  for (let i = 0; i < UFS.length; i += 9) {
    const batch = UFS.slice(i, i + 9);
    const rows = await Promise.all(
      batch.map(async ([uf]): Promise<FirstTurnBaseline | null> => {
        try {
          const url =
            `https://resultados.tse.jus.br/oficial/ele2026/6257/dados/${uf}/` +
            `${uf}-c0001-e006257-u.jws`;
          const raw = await fetchRaceJson(url);
          const parsed = parseRace({ ele: '6257', ciclo: 'ele2026', ufFoto: uf }, raw);
          const top: BaselineCandidate[] = (parsed.candidatos || []).slice(0, 6).map((c) => ({
            numero: String(c.numero),
            nomeUrna: c.nomeUrna,
            partido: c.partido,
            votos: c.vap,
            pvap: c.pvapNum,
          }));
          return fromTop(uf, top, parsed.meta.validos || 0, Number(parsed.meta?.e?.te ?? 0) || 0);
        } catch {
          return null;
        }
      }),
    );
    for (const r of rows) if (r) out.push(r);
  }
  return out.length > 0 ? out : null;
}
