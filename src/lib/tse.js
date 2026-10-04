// Branch GERAL: panorama completo — sem allowlist, sem fixos (todos ranqueados)
export const RACES = [
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
export const COLUMNS = [
  { key: 'pres', titulo: 'Presidente', races: ['pres-br'] },
  { key: 'govmg', titulo: 'Governador MG', races: ['gov-mg'] },
  { key: 'govsp', titulo: 'Governador SP', races: ['gov-sp'] },
  { key: 'fed', titulo: 'Dep. Federal', races: ['depfed-mg'] },
  { key: 'est', titulo: 'Dep. Estadual', races: ['depest-mg'] },
  { key: 'sen', titulo: 'Senado MG · ranking', races: ['sen-mg'], rankingOnly: true },
]

export function fotoUrl(race, sqcand) {
  return `https://resultados.tse.jus.br/oficial/${race.ciclo}/${race.ele}/fotos/${race.ufFoto}/${sqcand}.jpeg`
}

function b64UrlDecodeToJson(b64) {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/')
  const pad = norm + '='.repeat((4 - (norm.length % 4)) % 4)
  const bin = atob(pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const text = new TextDecoder('utf-8').decode(bytes)
  return JSON.parse(text)
}

export async function fetchRaceJson(url) {
  const res = await fetch(url + `?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = (await res.text()).trim()
  const parts = text.split('.')
  if (parts.length < 2) throw new Error('JWS inválido')
  return b64UrlDecodeToJson(parts[1])
}

// Achata carg/agr/par/cand -> lista de candidatos (+ partidos, vagas, QE)
export function parseRace(race, raw) {
  const carg = (raw.carg && raw.carg[0]) || {}
  const out = []
  const partidos = {} // n/sigla -> { n, sg, tvtn, tvtl, tvan }
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
          nomeUrna: c.nmu || c.nm,
          nomeFull: c.nm,
          partido: sg,
          partidoNum: pn,
          vap: toInt(c.vap),
          pvap: c.pvap || '0,00', // string pt-BR (oficial TSE)
          pvapNum: parseFloat(String(c.pvapn || c.pvap || '0').replace(',', '.')) || 0,
          seq: c.seq,
          foto: fotoUrl(race, c.sqcand),
        })
      }
    }
  }
  out.sort((a, b) => b.vap - a.vap)
  const v = raw.v || {}
  // % oficial do TSE (pvap) é calculada sobre vvc — manter a mesma base
  const validos = toInt(v.vvc || v.vv || v.vnom || 0)
  const totalVotos = toInt(v.tv || 0)
  const vagas = parseInt(carg.nv || '0', 10) || 0
  // QE oficial vem no carg.qe; fallback = validos / vagas
  const qeApi = toInt(carg.qe)
  const qe = qeApi > 0 ? qeApi : vagas > 0 && validos > 0 ? Math.floor(validos / vagas) : 0
  const filtered = race.allow && race.allow.length
    ? out.filter((c) => race.allow.includes(c.numero))
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
export function calcQuociente(meta, partidos, partidoNum) {
  const qe = meta?.qe || 0
  const vagas = meta?.vagas || 0
  const validos = meta?.validos || 0
  const p = partidos?.[String(partidoNum)]
  const partyVotes = p ? p.tvan || p.tvtn || 0 : 0
  const legenda = p ? p.tvtl || 0 : 0
  const qp = qe > 0 ? Math.floor(partyVotes / qe) : 0
  // faltam p/ a próxima cadeira (com QP=0, é a 1ª)
  const faltam = qe > 0 ? Math.max(0, qe * (qp + 1) - partyVotes) : 0
  const pctQE = qe > 0 ? (partyVotes / qe) * 100 : 0
  const atingiu = qp >= 1
  return { qe, vagas, validos, partyVotes, legenda, qp, faltam, pctQE, atingiu, sigla: p?.sg || '' }
}

export function sharePct(vap, validos) {
  if (!validos) return 0
  return (vap / validos) * 100
}

export const UFS = [
  ['ac', 'Acre'], ['al', 'Alagoas'], ['ap', 'Amapá'], ['am', 'Amazonas'],
  ['ba', 'Bahia'], ['ce', 'Ceará'], ['df', 'Distrito Federal'], ['es', 'Espírito Santo'],
  ['go', 'Goiás'], ['ma', 'Maranhão'], ['mt', 'Mato Grosso'], ['ms', 'Mato Grosso do Sul'],
  ['mg', 'Minas Gerais'], ['pa', 'Pará'], ['pb', 'Paraíba'], ['pr', 'Paraná'],
  ['pe', 'Pernambuco'], ['pi', 'Piauí'], ['rj', 'Rio de Janeiro'], ['rn', 'Rio Grande do Norte'],
  ['rs', 'Rio Grande do Sul'], ['ro', 'Rondônia'], ['rr', 'Roraima'], ['sc', 'Santa Catarina'],
  ['sp', 'São Paulo'], ['se', 'Sergipe'], ['to', 'Tocantins'],
]

// Quociente do MISSÃO (14) num estado p/ dep federal (6) ou estadual (7).
// Retorna {uf, ok, found, ...calcQuociente, parsed} — ok:false em 404 (ex. DF estadual).
export async function fetchMissaoUF(uf, cargo) {
  const url = `https://resultados.tse.jus.br/oficial/ele2026/6259/dados/${uf}/${uf}-c${String(cargo).padStart(4, '0')}-e006259-u.jws`
  const raw = await fetchRaceJson(url)
  const parsed = parseRace({ ele: '6259', ciclo: 'ele2026', ufFoto: uf }, raw)
  const found = !!parsed.partidos['14']
  const q = calcQuociente(parsed.meta, parsed.partidos, '14')
  return { uf, ok: true, found, parsed, ...q }
}

function toInt(x) {
  if (x == null) return 0
  if (typeof x === 'number') return Math.floor(x)
  return parseInt(String(x).replace(/\./g, ''), 10) || 0
}

const PALETTE = [
  '#facc15', '#ffffff', '#fbbf24', '#fb923c', '#fde68a',
  '#ca8a04', '#e7e5e4', '#a16207', '#f97316', '#fef08a',
]

export function colorFor(numero, index) {
  // cores estáveis por número; fallback por índice
  let h = 0
  const s = String(numero)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length] || PALETTE[index % PALETTE.length]
}

export function fmtInt(n) {
  return Number(n || 0).toLocaleString('pt-BR')
}

export function parseBrInt(s) {
  if (s == null) return 0
  return parseInt(String(s).replace(/\./g, ''), 10) || 0
}
