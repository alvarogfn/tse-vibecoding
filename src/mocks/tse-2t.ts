/**
 * mocks/tse-2t — dados mockados do 2º turno (ele 6258) p/ simular a apuração.
 *
 * Finais plausíveis = 1T transferido (Datafolha 46/32): lulaFinal = lula1T +
 * 0.32 × pool eliminado. A progressão avança 1 tick por request do arquivo
 * nacional (requests das UFs só LEEM o tick — senão a varredura de 27
 * arquivos pularia p/ 100% de uma vez). Determinístico por (uf, tick).
 */

// [validos1T, eleitorado, lula1T, flavio1T]
const UF: Record<string, [number, number, number, number]> = {
  ac: [469066, 613742, 28.73, 64.56],
  al: [1818856, 2442126, 54.73, 40.45],
  am: [2170763, 2798611, 48.23, 45.0],
  ap: [464858, 576988, 45.71, 45.67],
  ba: [8560291, 11312752, 66.17, 28.53],
  ce: [5617814, 6996545, 63.29, 31.27],
  df: [1772808, 2258320, 38.11, 51.31],
  es: [2251078, 2991650, 37.76, 54.78],
  go: [3827823, 5080590, 31.06, 53.6],
  ma: [4010439, 5183115, 63.99, 30.9],
  mg: [11976235, 16372372, 43.33, 48.24],
  ms: [1490278, 2024430, 34.68, 58.6],
  mt: [1993288, 2637801, 29.18, 65.15],
  pa: [4863172, 6262397, 49.91, 44.5],
  pb: [2513747, 3248531, 61.31, 33.07],
  pe: [5601017, 7223450, 63.45, 31.03],
  pi: [2146394, 2704758, 70.99, 24.09],
  pr: [6585243, 8613657, 31.2, 59.91],
  rj: [9369700, 12857648, 39.41, 53.01],
  rn: [2071898, 2659825, 59.75, 34.77],
  ro: [968059, 1265893, 25.89, 67.45],
  rr: [325545, 401521, 22.86, 71.06],
  rs: [6423046, 8522545, 35.73, 55.64],
  sc: [4500897, 5734651, 25.04, 66.65],
  se: [1364196, 1740135, 62.75, 30.63],
  sp: [24882948, 34122892, 38.2, 51.93],
  to: [930447, 1182023, 43.42, 50.44],
};

let tick = 0;

/** Avança a apuração (chamado 1× por request do arquivo nacional). */
export function advance(): void {
  tick += 1;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const ptbr = (v: number): string => v.toFixed(2).replace('.', ',');

interface UfSnapshot {
  uf: string;
  counted: number;
  lulaShare: number;
  lulaV: number;
  flavioV: number;
  validos: number;
  eleitorado: number;
}

function snapshot(uf: string): UfSnapshot | null {
  const row = UF[uf];
  if (!row) return null;
  const [validosF, eleitorado, lula1T, flavio1T] = row;
  const start = 4 + hash(uf) * 10;
  const step = 4 + hash(`${uf}:step`) * 5;
  const counted = Math.min(100, start + tick * step);
  const elim = Math.max(0, 100 - lula1T - flavio1T);
  const lulaFinal = clamp(lula1T + 0.32 * elim, 2, 98);
  // Oscilação inicial que some com a apuração (flutuação da entrada das urnas).
  const wobble = (hash(`${uf}:${tick}`) - 0.5) * 6 * (1 - counted / 100);
  const lulaShare = clamp(lulaFinal + wobble, 1, 99);
  const validos = Math.round(validosF * (counted / 100));
  const lulaV = Math.round((validos * lulaShare) / 100);
  return { uf, counted, lulaShare, lulaV, flavioV: validos - lulaV, validos, eleitorado };
}

function b64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Envelopa o payload no formato JWS que o fetchRaceJson espera. */
export function jws(payload: unknown): string {
  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${b64url(payload)}.mock`;
}

interface CandInput {
  n: string;
  sqcand: string;
  nmu: string;
  nm: string;
  vap: number;
  share: number;
  seq: string;
  sg: string;
}

function toCand(c: CandInput): Record<string, unknown> {
  return {
    n: c.n,
    sqcand: c.sqcand,
    nmu: c.nmu,
    nm: c.nm,
    vap: c.vap,
    pvap: ptbr(c.share),
    pvapn: Number(c.share.toFixed(2)),
    seq: c.seq,
  };
}

function payloadFor(scope: string, snaps: UfSnapshot[]): Record<string, unknown> {
  let lulaV = 0;
  let flavioV = 0;
  let validos = 0;
  let eleitorado = 0;
  let countedSum = 0;
  for (const s of snaps) {
    lulaV += s.lulaV;
    flavioV += s.flavioV;
    validos += s.validos;
    eleitorado += s.eleitorado;
    countedSum += s.counted;
  }
  const counted = snaps.length > 0 ? countedSum / snaps.length : 0;
  const lulaShare = validos > 0 ? (lulaV / validos) * 100 : 0;
  const flavioShare = validos > 0 ? (flavioV / validos) * 100 : 0;
  const vb = Math.round(validos * 0.019);
  const vn = Math.round(validos * 0.031);
  const tv = validos + vb + vn;
  const ts = Math.max(1, Math.round(validos / 280));
  const st = Math.round((ts * counted) / 100);
  const now = new Date();
  return {
    carg: [
      {
        agr: [
          {
            par: [
              {
                sg: 'PT',
                n: '13',
                tvtn: lulaV,
                tvtl: 0,
                tvan: lulaV,
                cand: [
                  toCand({ n: '13', sqcand: '0', nmu: 'LULA', nm: 'LUIZ INACIO LULA DA SILVA', vap: lulaV, share: lulaShare, seq: '1', sg: 'PT' }),
                ],
              },
              {
                sg: 'PL',
                n: '22',
                tvtn: flavioV,
                tvtl: 0,
                tvan: flavioV,
                cand: [
                  toCand({
                    n: '22', sqcand: '0', nmu: 'FLAVIO BOLSONARO', nm: 'FLAVIO NANTES BOLSONARO', vap: flavioV, share: flavioShare, seq: '2', sg: 'PL',
                  }),
                ],
              },
            ],
          },
        ],
        nv: '0',
        qe: '0',
      },
    ],
    hg: now.toLocaleTimeString('pt-BR', { hour12: false }),
    dg: now.toLocaleDateString('pt-BR'),
    dt: now.toLocaleDateString('pt-BR'),
    ht: now.toLocaleTimeString('pt-BR', { hour12: false }),
    s: { st: String(st), ts: String(ts), pst: ptbr(counted) },
    e: { te: String(eleitorado), c: String(Math.round(eleitorado * 0.79 * (counted / 100))) },
    v: { vvc: String(validos), tv: String(tv), vb: String(vb), vn: String(vn), tvn: String(vn) },
    scope,
  };
}

/** Payload do arquivo nacional (agregado bottom-up das 27 UFs no tick atual). */
export function nationalPayload(): string {
  const snaps: UfSnapshot[] = [];
  for (const uf of Object.keys(UF)) {
    const s = snapshot(uf);
    if (s) snaps.push(s);
  }
  return jws(payloadFor('br', snaps));
}

/** Payload de uma UF (null = fora do catálogo mockado). */
export function ufPayload(uf: string): string | null {
  const s = snapshot(uf.toLowerCase());
  if (!s) return null;
  return jws(payloadFor(s.uf, [s]));
}
