// Branch GERAL: panorama completo — sem allowlist, sem fixos (todos ranqueados)

export type RaceTipo = 'majoritario' | 'proporcional' | 'senado';

/** Entrada mínima que parseRace/fotoUrl realmente consomem. */
export interface RaceInput {
  ele: string;
  ciclo: string;
  ufFoto: string;
  id?: string;
  titulo?: string;
  subtitulo?: string;
  url?: string;
  tipo?: string;
  allow?: string[];
}

export interface Race {
  id: string;
  ele: string;
  ciclo: string;
  ufFoto: string;
  titulo: string;
  subtitulo: string;
  url: string;
  tipo: RaceTipo;
  allow?: string[];
}

export interface RaceColumn {
  key: string;
  titulo: string;
  races: string[];
  rankingOnly?: boolean;
}

// ---------------------------------------------------------------------------
// TSE raw payload (dado externo): tipos estruturais pragmáticos, tudo opcional.
// Campos desconhecidos/dinâmicos caem em `unknown` via índice.
// ---------------------------------------------------------------------------

export interface TseCandRaw {
  n?: string | number | null;
  sqcand?: string | number | null;
  nmu?: string | null;
  nm?: string | null;
  vap?: string | number | null;
  pvap?: string | null;
  pvapn?: string | number | null;
  seq?: string | number | null;
  [k: string]: unknown;
}

export interface TseParRaw {
  sg?: string | null;
  n?: string | number | null;
  tvtn?: string | number | null;
  tvtl?: string | number | null;
  tvan?: string | number | null;
  cand?: TseCandRaw[] | null;
  [k: string]: unknown;
}

export interface TseAgrRaw {
  par?: TseParRaw[] | null;
  [k: string]: unknown;
}

export interface TseCargRaw {
  agr?: TseAgrRaw[] | null;
  nv?: string | number | null;
  qe?: string | number | null;
  [k: string]: unknown;
}

export interface TseVotesRaw {
  vvc?: string | number | null;
  vv?: string | number | null;
  vnom?: string | number | null;
  tv?: string | number | null;
  vb?: string | number | null;
  vn?: string | number | null;
  tvn?: string | number | null;
  tvb?: string | number | null;
  [k: string]: unknown;
}

export interface TseSecsRaw {
  st?: string | number | null;
  ts?: string | number | null;
  pst?: string | number | null;
  pstn?: string | number | null;
  [k: string]: unknown;
}

export interface TseElectRaw {
  te?: string | number | null;
  c?: string | number | null;
  [k: string]: unknown;
}

export interface TseRawPayload {
  carg?: TseCargRaw[] | null;
  hg?: string | null;
  dg?: string | null;
  dt?: string | null;
  ht?: string | null;
  s?: TseSecsRaw | null;
  e?: TseElectRaw | null;
  v?: TseVotesRaw | null;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Modelos internos (parseados)
// ---------------------------------------------------------------------------

export interface Candidate {
  key: string;
  numero: string;
  sqcand: string;
  nomeUrna: string;
  nomeFull: string;
  partido: string;
  partidoNum: string;
  vap: number;
  pvap: string;
  pvapNum: number;
  seq: string | number | undefined;
  foto: string;
}

export interface PartyVotes {
  n: string;
  sg: string;
  tvtn: number;
  tvtl: number;
  tvan: number;
}

export interface ParsedMeta {
  hg: string | null | undefined;
  dg: string | null | undefined;
  dt: string | null | undefined;
  ht: string | null | undefined;
  s: TseSecsRaw;
  e: TseElectRaw;
  v: TseVotesRaw;
  vagas: number;
  qe: number;
  validos: number;
  totalVotos: number;
}

export interface ParsedRace {
  candidatos: Candidate[];
  ranking: Candidate[];
  todos: number;
  partidos: Record<string, PartyVotes>;
  meta: ParsedMeta;
}

export interface Quociente {
  qe: number;
  vagas: number;
  validos: number;
  partyVotes: number;
  legenda: number;
  qp: number;
  faltam: number;
  pctQE: number;
  atingiu: boolean;
  sigla: string;
}

export interface UFData {
  uf: string;
  fed: ParsedRace | null;
  est: ParsedRace | null;
  sen: ParsedRace | null;
  at?: string | null;
}

export interface AggTop {
  nome: string;
  numero: string;
  vap: number;
}

export interface AggFedEst {
  votes: number;
  legenda: number;
  qp: number;
  qe: number;
  vagas: number;
  top: AggTop | null;
}

export interface AggSen {
  seats: number;
  vagas: number;
  top: AggTop | null;
}

export interface AggParty {
  pn: string;
  sg: string;
  fed: AggFedEst | null;
  est: AggFedEst | null;
  sen: AggSen | null;
}

export const RACES: Race[] = [
  {
    id: 'pres-br',
    ele: '6257',
    ciclo: 'ele2026',
    ufFoto: 'br',
    titulo: 'Presidente',
    subtitulo: 'Eleição Ordinária Federal - 2026',
    url: 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.jws',
    tipo: 'majoritario',
  },
  {
    id: 'gov-mg',
    ele: '6259',
    ciclo: 'ele2026',
    ufFoto: 'mg',
    titulo: 'Governador – MG',
    subtitulo: 'Eleição Ordinária Estadual - 2026',
    url: 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/mg/mg-c0003-e006259-u.jws',
    tipo: 'majoritario',
  },
  {
    id: 'gov-sp',
    ele: '6259',
    ciclo: 'ele2026',
    ufFoto: 'sp',
    titulo: 'Governador – SP',
    subtitulo: 'Eleição Ordinária Estadual - 2026',
    url: 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/sp/sp-c0003-e006259-u.jws',
    tipo: 'majoritario',
  },
  {
    id: 'depfed-mg',
    ele: '6259',
    ciclo: 'ele2026',
    ufFoto: 'mg',
    titulo: 'Deputado Federal – MG',
    subtitulo: 'Eleição Ordinária Estadual - 2026',
    url: 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/mg/mg-c0006-e006259-u.jws',
    tipo: 'proporcional',
  },
  {
    id: 'depest-mg',
    ele: '6259',
    ciclo: 'ele2026',
    ufFoto: 'mg',
    titulo: 'Deputado Estadual – MG',
    subtitulo: 'Eleição Ordinária Estadual - 2026',
    url: 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/mg/mg-c0007-e006259-u.jws',
    tipo: 'proporcional',
  },
  {
    id: 'sen-mg',
    ele: '6259',
    ciclo: 'ele2026',
    ufFoto: 'mg',
    titulo: 'Senador – MG',
    subtitulo: 'Ranking geral · sem filtro · sem gráfico',
    url: 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/mg/mg-c0005-e006259-u.jws',
    tipo: 'senado',
  },
]

// Colunas do painel — gov MG e SP separados (6 colunas, scroll horizontal)
export const COLUMNS: RaceColumn[] = [
  { key: 'pres', titulo: 'Presidente', races: ['pres-br'] },
  { key: 'govmg', titulo: 'Governador MG', races: ['gov-mg'] },
  { key: 'govsp', titulo: 'Governador SP', races: ['gov-sp'] },
  { key: 'fed', titulo: 'Dep. Federal', races: ['depfed-mg'] },
  { key: 'est', titulo: 'Dep. Estadual', races: ['depest-mg'] },
  { key: 'sen', titulo: 'Senado MG · ranking', races: ['sen-mg'], rankingOnly: true },
]

import { HttpError } from '../helpers/http-error.js';
import { decodeJwsPayload } from '../helpers/jws.js';

export function fotoUrl(race: RaceInput, sqcand: string | number): string {
  return `https://resultados.tse.jus.br/oficial/${race.ciclo}/${race.ele}/fotos/${race.ufFoto}/${sqcand}.jpeg`
}

export async function fetchRaceJson(url: string): Promise<TseRawPayload> {
  const res = await fetch(url + `?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status)
  return decodeJwsPayload(await res.text())
}

// Achata carg/agr/par/cand -> lista de candidatos (+ partidos, vagas, QE)
export function parseRace(race: RaceInput, raw: TseRawPayload): ParsedRace {
  const carg: TseCargRaw = (raw.carg && raw.carg[0]) || {}
  const out: Candidate[] = []
  const partidos: Record<string, PartyVotes> = {} // n/sigla -> { n, sg, tvtn, tvtl, tvan }
  for (const agr of carg.agr || []) {
    for (const par of agr.par || []) {
      const sg = par.sg || ''
      const pn = String(par.n)
      if (!partidos[pn]) {
        partidos[pn] = {
          n: pn,
          sg,
          tvtn: toInt(par.tvtn),
          tvtl: toInt(par.tvtl),
          tvan: toInt(par.tvan != null ? par.tvan : par.tvtn),
        }
      }
      for (const c of par.cand || []) {
        out.push({
          key: `${c.n}-${c.sqcand}`,
          numero: String(c.n),
          sqcand: String(c.sqcand),
          nomeUrna: c.nmu || c.nm || '',
          nomeFull: c.nm || '',
          partido: sg,
          partidoNum: pn,
          vap: toInt(c.vap),
          pvap: c.pvap || '0,00', // string pt-BR (oficial TSE)
          pvapNum: parseFloat(String(c.pvapn || c.pvap || '0').replace(',', '.')) || 0,
          seq: c.seq ?? undefined,
          foto: fotoUrl(race, c.sqcand ?? ''),
        })
      }
    }
  }
  out.sort((a, b) => b.vap - a.vap)
  const v: TseVotesRaw = raw.v || {}
  // % oficial do TSE (pvap) é calculada sobre vvc — manter a mesma base
  const validos = toInt(v.vvc ?? v.vv ?? v.vnom ?? 0)
  const totalVotos = toInt(v.tv ?? 0)
  const vagas = parseInt(String(carg.nv ?? '0'), 10) || 0
  // QE oficial vem no carg.qe; fallback = validos / vagas
  const qeApi = toInt(carg.qe)
  const qe = qeApi > 0 ? qeApi : vagas > 0 && validos > 0 ? Math.floor(validos / vagas) : 0
  const filtered = race.allow && race.allow.length
    ? out.filter((c) => race.allow!.includes(c.numero))
    : out
  return {
    candidatos: filtered,
    ranking: out,
    todos: out.length,
    partidos,
    meta: {
      hg: raw.hg,
      dg: raw.dg,
      dt: raw.dt,
      ht: raw.ht,
      s: raw.s || {},
      e: raw.e || {},
      v,
      vagas,
      qe,
      validos,
      totalVotos,
    },
  }
}

// Quociente partidário: QP = floor(votosPartido / QE)
export function calcQuociente(
  meta: ParsedMeta | null | undefined,
  partidos: Record<string, PartyVotes> | null | undefined,
  partidoNum: string,
): Quociente {
  const qe = meta?.qe || 0
  const vagas = meta?.vagas || 0
  const validos = meta?.validos || 0
  const p = partidos?.[String(partidoNum)]
  const partyVotes = p ? (p.tvan ?? p.tvtn ?? 0) : 0
  const legenda = p ? (p.tvtl ?? 0) : 0
  const qp = qe > 0 ? Math.floor(partyVotes / qe) : 0
  // faltam p/ a próxima cadeira (com QP=0, é a 1ª)
  const faltam = qe > 0 ? Math.max(0, qe * (qp + 1) - partyVotes) : 0
  const pctQE = qe > 0 ? (partyVotes / qe) * 100 : 0
  const atingiu = qp >= 1
  return { qe, vagas, validos, partyVotes, legenda, qp, faltam, pctQE, atingiu, sigla: p?.sg || '' }
}

export function sharePct(vap: number | null | undefined, validos: number | null | undefined): number {
  if (!validos) return 0
  return ((vap || 0) / validos) * 100
}

export const UFS: Array<[string, string]> = [
  ['ac', 'Acre'], ['al', 'Alagoas'], ['ap', 'Amapá'], ['am', 'Amazonas'],
  ['ba', 'Bahia'], ['ce', 'Ceará'], ['df', 'Distrito Federal'], ['es', 'Espírito Santo'],
  ['go', 'Goiás'], ['ma', 'Maranhão'], ['mt', 'Mato Grosso'], ['ms', 'Mato Grosso do Sul'],
  ['mg', 'Minas Gerais'], ['pa', 'Pará'], ['pb', 'Paraíba'], ['pr', 'Paraná'],
  ['pe', 'Pernambuco'], ['pi', 'Piauí'], ['rj', 'Rio de Janeiro'], ['rn', 'Rio Grande do Norte'],
  ['rs', 'Rio Grande do Sul'], ['ro', 'Rondônia'], ['rr', 'Roraima'], ['sc', 'Santa Catarina'],
  ['sp', 'São Paulo'], ['se', 'Sergipe'], ['to', 'Tocantins'],
]

// Baixa os 3 cargos de um estado em paralelo (fed 6, est 7, sen 5). Cargo ausente (ex. DF estadual) vira null.
export async function fetchUFCargos(uf: string): Promise<UFData> {
  const jobs: Array<['fed' | 'est' | 'sen', number]> = [['fed', 6], ['est', 7], ['sen', 5]]
  const out: UFData = { uf, fed: null, est: null, sen: null }
  const res = await Promise.all(
    jobs.map(async ([key, cargo]): Promise<['fed' | 'est' | 'sen', ParsedRace | null]> => {
      const url = `https://resultados.tse.jus.br/oficial/ele2026/6259/dados/${uf}/${uf}-c${String(cargo).padStart(4, '0')}-e006259-u.jws`
      try {
        const raw = await fetchRaceJson(url)
        return [key, parseRace({ ele: '6259', ciclo: 'ele2026', ufFoto: uf }, raw)]
      } catch {
        return [key, null]
      }
    })
  )
  for (const [key, parsed] of res) out[key] = parsed
  return out
}

// Agrega por partido: prop (fed/est) usa QP=floor(partido/QE); senado usa top N vagas (parcial).
// Retorna [{ pn, sg, fed, est, sen }] onde fed/est = {votes, legenda, qp, qe, vagas, top}
// e sen = {seats, vagas, top}. top = {nome, numero, vap} do mais votado.
export function aggregateParties(ufData: UFData): AggParty[] {
  const map: Record<string, AggParty> = {}
  const ensure = (pn: string, sg: string): AggParty => (map[pn] || (map[pn] = { pn, sg, fed: null, est: null, sen: null }))
  for (const cargo of ['fed', 'est'] as const) {
    const p = ufData[cargo]
    if (!p) continue
    const ranking = p.ranking || []
    for (const [pn, info] of Object.entries(p.partidos)) {
      const e = ensure(pn, info.sg)
      const top = ranking.find((c) => c.partidoNum === pn)
      const q = calcQuociente(p.meta, p.partidos, pn)
      e[cargo] = {
        votes: q.partyVotes, legenda: q.legenda, qp: q.qp, qe: q.qe, vagas: q.vagas,
        top: top ? { nome: top.nomeUrna, numero: top.numero, vap: top.vap } : null,
      }
    }
  }
  const s = ufData.sen
  if (s) {
    const sRanking = s.ranking || []
    const vagas = s.meta.vagas || 0
    const winners = new Set(sRanking.slice(0, vagas).map((c) => c.key))
    for (const c of sRanking) {
      const e = ensure(c.partidoNum, c.partido)
      if (!e.sen) e.sen = { seats: 0, vagas, top: { nome: c.nomeUrna, numero: c.numero, vap: c.vap } }
      if (winners.has(c.key) && e.sen) e.sen.seats += 1
    }
  }
  return Object.values(map)
}

function toInt(x: string | number | null | undefined): number {
  if (x == null) return 0
  if (typeof x === 'number') return Math.floor(x)
  return parseInt(String(x).replace(/\./g, ''), 10) || 0
}

const PALETTE: string[] = [
  '#facc15', '#ffffff', '#fbbf24', '#fb923c', '#fde68a',
  '#ca8a04', '#e7e5e4', '#a16207', '#f97316', '#fef08a',
]

export function colorFor(numero: string | number, index: number): string {
  // cores estáveis por número; fallback por índice
  let h = 0
  const s = String(numero)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length] || PALETTE[index % PALETTE.length]
}

// Cores usuais das legendas (p/ pizzas e destaques); fallback = colorFor
export const PARTY_COLORS: Record<string, string> = {
  '10': '#003B71', // REPUBLICANOS
  '11': '#0091DA', // PP
  '12': '#004B8D', // PDT
  '13': '#DA291C', // PT
  '14': '#FACC15', // MISSÃO
  '15': '#00A651', // MDB
  '16': '#E30613', // PSTU
  '18': '#009444', // REDE
  '20': '#00A651', // PODE
  '21': '#E30613', // PCB
  '22': '#002776', // PL
  '23': '#EC008C', // CIDADANIA
  '25': '#7B2D8E', // PRD
  '27': '#0091DA', // DC
  '29': '#E30613', // PCO
  '30': '#F26522', // NOVO
  '33': '#7B2D8E', // MOBILIZA
  '36': '#00A651', // AGIR
  '40': '#FDB913', // PSB
  '43': '#078930', // PV
  '44': '#1B2A6B', // UNIÃO
  '45': '#008ACB', // PSDB
  '50': '#D52B1E', // PSOL
  '55': '#0F4C81', // PSD
  '65': '#DA291C', // PCdoB
  '70': '#F26522', // AVANTE
  '77': '#F7941E', // SOLIDARIEDADE
  '80': '#9CA3AF', // UP (cinza — preto some no fundo)
}

export function partyColor(pn: string | number, index = 0): string {
  return PARTY_COLORS[String(pn)] || colorFor(pn, index)
}

export function fmtInt(n: string | number | null | undefined): string {
  return Number(n || 0).toLocaleString('pt-BR')
}

export function parseBrInt(s: string | number | null | undefined): number {
  if (s == null) return 0
  return parseInt(String(s).replace(/\./g, ''), 10) || 0
}
