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
