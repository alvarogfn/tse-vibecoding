import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { UFS, fetchRaceJson, parseRace, partyColor, fmtInt } from '../lib/tse.js'
import type { Candidate, ParsedRace, Race } from '../lib/tse.js'

const BASE: string = import.meta.env.BASE_URL || '/'
const BRAZIL_SVG_URL = `${BASE}maps/brazil.svg`
const MG_SVG_URL = `${BASE}maps/minas-gerais.svg`
const MG_MUN_URL = `${BASE}data/mg-municipios.json` // cache em JSON bruto (IBGE; ver tarefa 3)

const RACE_PRES: Race = {
  id: 'pres-br-2t',
  ele: '6257',
  ciclo: 'ele2026',
  ufFoto: 'br',
  titulo: 'Presidente',
  subtitulo: 'Eleição Ordinária Federal - 2026',
  url: 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.jws',
  tipo: 'majoritario',
}
const RACE_PRES_MG: Race = {
  id: 'pres-mg-2t',
  ele: '6257',
  ciclo: 'ele2026',
  ufFoto: 'br', // fotos dos presidenciáveis ficam na pasta nacional
  titulo: 'Presidente em MG',
  subtitulo: 'Eleição Ordinária Federal - 2026',
  url: 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/mg/mg-c0001-e006257-u.jws',
  tipo: 'majoritario',
}

// Sem endpoints do 2º turno por UF: tudo em cinza claro (mesma regra das micros de MG).
// O pipeline (fetchUFs → ufWinners) continua ativo; quando os endpoints saírem,
// basta ligar USE_ROUND2_GEO para pintar cada UF de azul/vermelho pelo vencedor local.
const USE_ROUND2_GEO = false
// Cores fixas da disputa presidencial: Flávio Bolsonaro = azul, Lula = vermelho
const JAIR_BLUE = '#2563eb'
const LULA_RED = '#dc2626'
// Sem endpoints do 2º turno por microrregião: tudo em cinza claro
const MICRO_GRAY = '#d4d4d8'

function finalistColor(c: Candidate, i: number): string {
  const name = `${c.nomeUrna || ''} ${c.nomeFull || ''}`.toUpperCase()
  if (name.includes('LULA')) return LULA_RED
  if (name.includes('JAIR') || name.includes('BOLSONARO')) return JAIR_BLUE
  return partyColor(c.partidoNum, i)
}

function fmtPct(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

export interface SvgPath {
  id: string;
  d: string;
  title: string;
}

async function loadSvgPaths(url: string, prefix: string): Promise<SvgPath[]> {
  const res = await fetch(url, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status} no mapa`)
  const txt = await res.text()
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml')
  const nodes = [...doc.querySelectorAll('path')].filter((p) =>
    (p.getAttribute('id') || '').startsWith(prefix)
  )
  return nodes.map((p) => ({
    id: p.getAttribute('id') || '',
    d: p.getAttribute('d') || '',
    title: p.getAttribute('title') || p.getAttribute('id') || '',
  }))
}

interface SvgMapState {
  paths: SvgPath[];
  error: string | null;
  loading: boolean;
}

function useSvgMap(url: string, prefix: string): SvgMapState {
  const [paths, setPaths] = useState<SvgPath[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    loadSvgPaths(url, prefix)
      .then((p) => alive && (setPaths(p), setError(null)))
      .catch((e: unknown) => alive && setError(String((e as Error)?.message || e)))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [url, prefix])
  return { paths, error, loading }
}

// Converte id de microrregião do IBGE (ex. 31019 + meso 3105) p/ id no SVG (ex. micro_310519)
function svgMicroId(microId: number, mesoId: number): string {
  return `micro_31${String(mesoId % 100).padStart(2, '0')}${String(microId % 100).padStart(2, '0')}`
}

interface IbgeMicroRaw {
  id: number;
  nome: string;
  mesorregiao?: { id: number } | null;
}

interface IbgeMunRaw {
  id: number | string;
  nome: string;
  microrregiao?: (IbgeMicroRaw & { nome: string }) | null;
  [k: string]: unknown;
}

interface MgGeo {
  names: Record<string, string>;
  munMicro: Record<string, string>;
  microNames: Record<string, string>;
}

interface MgGeoState extends MgGeo {
  error: string | null;
  loading: boolean;
}

// Nomes dos municípios + agrupamento mun → micro a partir do cache JSON bruto.
// O ViaCEP não oferece consulta IBGE → nome, então o cache foi gerado da API de
// localidades do IBGE (mesmo formato bruto, 1 request só no build, zero rate-limit em runtime).
function useMgGeo(): MgGeoState {
  const [geo, setGeo] = useState<MgGeo>({ names: {}, munMicro: {}, microNames: {} })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  useEffect(() => {
    let alive = true
    fetch(MG_MUN_URL, { cache: 'force-cache' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} nos municípios`); return r.json() as Promise<IbgeMunRaw[]> })
      .then((data) => {
        if (!alive) return
        const names: Record<string, string> = {}, munMicro: Record<string, string> = {}, microNames: Record<string, string> = {}
        for (const m of data) {
          const ibge = String(m.id)
          names[ibge] = m.nome
          const mi = m.microrregiao || {}
          if ((mi as IbgeMicroRaw).id && (mi as IbgeMicroRaw).mesorregiao) {
            const micro = mi as IbgeMicroRaw & { nome: string; mesorregiao: { id: number } }
            const svgId = svgMicroId(micro.id, micro.mesorregiao.id)
            munMicro[ibge] = svgId
            microNames[svgId] = micro.nome
          }
        }
        setGeo({ names, munMicro, microNames })
        setError(null)
      })
      .catch((e: unknown) => alive && setError(String((e as Error)?.message || e)))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])
  return { ...geo, error, loading }
}

function CandLegend({ cands, colors }: { cands: Candidate[]; colors: Record<string, string> }): React.JSX.Element {
  if (!cands?.length) return <div className="hint">Aguardando dados do TSE…</div>
  return (
    <div className="st-legend">
      {cands.map((c) => (
        <div key={c.numero} className="st-leg-item" title={`${c.nomeFull} · ${c.partido} · ${fmtInt(c.vap)} votos`}>
          <span className="dot" style={{ background: colors[c.numero], width: 10, height: 10 }} />
          <img src={c.foto} alt={c.nomeUrna} className="avatar" style={{ width: 22, height: 22 }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <span className="st-leg-name">{c.nomeUrna}</span>
          <span className="st-leg-party">{c.partido} · {c.numero}</span>
          <b className="st-leg-pct">{fmtPct(c.pvapNum)}</b>
        </div>
      ))}
    </div>
  )
}

interface UFWinner {
  numero: string;
  nome: string;
  partido: string;
  pvapNum: number;
  pst?: string | number | null;
  vap: number;
}

interface UFMeta {
  done: number;
  total: number;
  at: string | null;
}

export default function SegundoTurno(): React.JSX.Element {
  const [pres, setPres] = useState<ParsedRace | null>(null)
  const [presMG, setPresMG] = useState<ParsedRace | null>(null) // apuração presidencial no estado de MG (não é governador)
  const [presErr, setPresErr] = useState<string | null>(null)
  const [presMGErr, setPresMGErr] = useState<string | null>(null)
  const [ufWinners, setUfWinners] = useState<Record<string, UFWinner>>({}) // { uf: { numero, nome, pvapNum, pst } }
  // { microId (ex. micro_310519): numero do vencedor na microrregião } — vazio até o TSE publicar o 2º turno
  const [winnersByMicro, setWinnersByMicro] = useState<Record<string, string>>({})
  // { munIbge (ex. 3100104): microId } — preenchido na tarefa 3 (nomes + agrupamento via IBGE)
  const [munToMicro, setMunToMicro] = useState<Record<string, string>>({})
  const [ufMeta, setUfMeta] = useState<UFMeta>({ done: 0, total: UFS.length, at: null })
  const [auto, setAuto] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(true)
  const [hoverUF, setHoverUF] = useState<string | null>(null)
  const [hoverMun, setHoverMun] = useState<string | null>(null)

  void setWinnersByMicro

  const br = useSvgMap(BRAZIL_SVG_URL, 'BR-')
  const mg = useSvgMap(MG_SVG_URL, 'mun_')
  const mgMicro = useSvgMap(MG_SVG_URL, 'micro_31')
  const mgGeo = useMgGeo()

  useEffect(() => { setMunToMicro(mgGeo.munMicro) }, [mgGeo.munMicro])

  const fetchTop = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const raw = await fetchRaceJson(RACE_PRES.url)
      setPres(parseRace(RACE_PRES, raw))
      setPresErr(null)
    } catch (e: unknown) { setPresErr(String((e as Error)?.message || e)) }
    try {
      const raw = await fetchRaceJson(RACE_PRES_MG.url)
      setPresMG(parseRace(RACE_PRES_MG, raw))
      setPresMGErr(null)
    } catch (e: unknown) { setPresMGErr(String((e as Error)?.message || e)) }
    setLoading(false)
  }, [])

  const fetchUFs = useCallback(async (topNumeros: string[]): Promise<void> => {
    // Colore cada UF pelo vencedor entre os 2 finalistas (ou líder local se 2T ainda sem ele próprio)
    const out: Record<string, UFWinner> = {}
    let done = 0
    for (let i = 0; i < UFS.length; i += 4) {
      const batch = UFS.slice(i, i + 4)
      await Promise.all(batch.map(async ([uf]): Promise<void> => {
        const url = `https://resultados.tse.jus.br/oficial/ele2026/6257/dados/${uf}/${uf}-c0001-e006257-u.jws`
        try {
          const raw = await fetchRaceJson(url)
          const parsed = parseRace({ ...RACE_PRES, ufFoto: uf }, raw)
          const cands = parsed.candidatos || []
          let win: Candidate | undefined = cands[0]
          if (topNumeros?.length >= 2) {
            const finalistas = cands.filter((c) => topNumeros.includes(String(c.numero)))
            if (finalistas.length) win = finalistas.sort((a, b) => b.vap - a.vap)[0]
          }
          if (win) out[uf] = { numero: String(win.numero), nome: win.nomeUrna, partido: win.partido, pvapNum: win.pvapNum, pst: parsed.meta?.s?.pst, vap: win.vap }
        } catch { /* UF sem dado — mantém neutra */ }
      }))
      done = Math.min(i + 4, UFS.length)
      setUfMeta({ done, total: UFS.length, at: null })
    }
    setUfWinners(out)
    setUfMeta({ done: UFS.length, total: UFS.length, at: new Date().toLocaleTimeString('pt-BR') })
  }, [])

  useEffect(() => { fetchTop() }, [fetchTop])
  useEffect(() => {
    if (!pres) return
    const top2 = (pres.candidatos || []).slice(0, 2).map((c) => String(c.numero))
    fetchUFs(top2)
  }, [pres, fetchUFs])
  useEffect(() => {
    if (!auto) return
    const id = setInterval(fetchTop, 15000)
    return () => clearInterval(id)
  }, [auto, fetchTop])

  const presTop2 = useMemo(() => (pres?.candidatos || []).slice(0, 2), [pres])
  const mgTop2 = useMemo(() => (presMG?.candidatos || []).slice(0, 2), [presMG])

  const presColors = useMemo(() => {
    const m: Record<string, string> = {}
    presTop2.forEach((c, i) => { m[String(c.numero)] = finalistColor(c, i) })
    return m
  }, [presTop2])
  const mgColors = useMemo(() => {
    const m: Record<string, string> = {}
    mgTop2.forEach((c, i) => { m[String(c.numero)] = finalistColor(c, i) })
    return m
  }, [mgTop2])

  const brFill = useCallback((pathId: string): string => {
    if (!USE_ROUND2_GEO) return MICRO_GRAY
    const uf = pathId.replace('BR-', '').toLowerCase()
    const w = ufWinners[uf]
    if (w && presColors[w.numero]) return presColors[w.numero]
    return MICRO_GRAY
  }, [ufWinners, presColors])

  // Cor de cada microrregião pelo vencedor local (azul/vermelho); cinza claro sem dados do 2º turno
  const microFill = useCallback((microId: string): string => {
    const num = winnersByMicro[microId]
    if (num && mgColors[num]) return mgColors[num]
    return MICRO_GRAY
  }, [winnersByMicro, mgColors])

  const countedUFs = Object.keys(ufWinners).length

  return (
    <div className="page">
      <div className="topbar">
        <h1>2º turno 2026</h1>
        <div className="sub">Presidente · Brasil à esquerda · Minas Gerais à direita</div>
        <div className="spacer" />
        <Link className="btn-ghost-sm" to="/" style={{ textDecoration: 'none' }}>1º turno</Link>
        <span className="badge">{loading ? 'lendo…' : auto ? 'auto 15s' : 'pausado'}</span>
        <button className="btn-ghost-sm" onClick={() => setAuto(!auto)}>{auto ? 'Pausar' : 'Retomar'}</button>
        <button className="btn-sm" onClick={() => { fetchTop() }} disabled={loading}>{loading ? '…' : 'Atualizar'}</button>
      </div>

      <div className="wrap">
        <div className="st-grid">
          {/* ESQUERDA — BRASIL */}
          <section className="st-card">
            <div className="col-title">Brasil — Presidente · 2º turno</div>
            <div className="summary" title={pres ? `Seções ${pres.meta?.s?.st}/${pres.meta?.s?.ts} · ${pres.meta?.hg}` : 'Aguardando TSE'}>
              {pres ? <><b>{pres.meta?.s?.pst || '-'}% urnas</b> · {fmtInt(pres.meta?.validos)} válidos · {pres.meta?.hg || ''} · {countedUFs}/{UFS.length} UFs</> : (presErr ? `falha: ${presErr}` : 'carregando…')}
            </div>
            <CandLegend cands={presTop2} colors={presColors} />
            <div className="st-map">
              {br.loading && <div className="hint">Carregando mapa do Brasil…</div>}
              {br.error && <div className="err">{br.error}</div>}
              {!br.loading && !br.error && (
                <svg viewBox="0 0 612.51611 639.04297" className="st-svg" role="img" aria-label="Mapa do Brasil">
                  {br.paths.map((p) => {
                    const uf = p.id.replace('BR-', '').toLowerCase()
                    const w = ufWinners[uf]
                    void w
                    return (
                      <path
                        key={p.id}
                        d={p.d}
                        fill={brFill(p.id)}
                        fillOpacity={hoverUF === p.id ? 1 : 0.9}
                        stroke={hoverUF === p.id ? '#facc15' : '#0a0a0a'}
                        strokeWidth={hoverUF === p.id ? 2.2 : 1}
                        style={{ cursor: 'default', transition: 'fill-opacity .15s' }}
                        onMouseEnter={() => setHoverUF(p.id)}
                        onMouseLeave={() => setHoverUF(null)}
                      >
                        <title>{`${p.title} (${uf.toUpperCase()})${USE_ROUND2_GEO && w ? ` · ${w.nome} ${fmtPct(w.pvapNum)}` : ' · sem dados do 2º turno'}`}</title>
                      </path>
                    )
                  })}
                </svg>
              )}
            </div>
            <div className="hint">
              {hoverUF
                ? (() => { const uf = hoverUF.replace('BR-', '').toLowerCase(); const w = ufWinners[uf]; return USE_ROUND2_GEO && w ? `${uf.toUpperCase()} · ${w.nome} (${w.partido}) ${fmtPct(w.pvapNum)}` : `${uf.toUpperCase()} · sem dados do 2º turno` })()
                : `Flávio Bolsonaro (azul) · Lula (vermelho) · sem dados (cinza) · ${ufMeta.done}/${ufMeta.total} UFs${ufMeta.at ? ` · ${ufMeta.at}` : ''}`}
            </div>
          </section>

          {/* DIREITA — MINAS GERAIS (apuração presidencial no estado) */}
          <section className="st-card">
            <div className="col-title">Minas Gerais — Presidente · 2º turno</div>
            <div className="summary" title={presMG ? `Seções ${presMG.meta?.s?.st}/${presMG.meta?.s?.ts} · ${presMG.meta?.hg}` : 'Aguardando TSE'}>
              {presMG ? <><b>{presMG.meta?.s?.pst || '-'}% urnas</b> · {fmtInt(presMG.meta?.validos)} válidos · {presMG.meta?.hg || ''}</> : (presMGErr ? `falha: ${presMGErr}` : 'carregando…')}
            </div>
            <CandLegend cands={mgTop2} colors={mgColors} />
            <div className="st-map">
              {(mg.loading || mgMicro.loading) && <div className="hint">Carregando mapa de Minas…</div>}
              {(mg.error || mgMicro.error) && <div className="err">{mg.error || mgMicro.error}</div>}
              {!mg.loading && !mg.error && !mgMicro.loading && !mgMicro.error && (
                <svg viewBox="0 0 258000 200000" className="st-svg" role="img" aria-label="Mapa de Minas Gerais por microrregião">
                  {mgMicro.paths.map((p) => {
                    const winNum = winnersByMicro[p.id]
                    const win = winNum && mgTop2.find((c) => String(c.numero) === String(winNum))
                    const microNome = mgGeo.microNames[p.id] || p.id.replace('micro_', 'Micro ')
                    return (
                      <path
                        key={p.id}
                        d={p.d}
                        fill={microFill(p.id)}
                        fillOpacity={0.92}
                        stroke="#0a0a0a"
                        strokeWidth={900}
                        style={{ transition: 'fill .3s' }}
                      >
                        <title>{`Micro ${microNome}${win ? ` · ${win.nomeUrna} ${fmtPct(win.pvapNum)}` : ' · sem dados do 2º turno'}`}</title>
                      </path>
                    )
                  })}
                  {mg.paths.map((p) => {
                    const ibge = p.id.replace('mun_', '')
                    const nome = mgGeo.names[ibge] || `IBGE ${ibge}`
                    const microId = munToMicro[ibge]
                    const microNome = (microId && mgGeo.microNames[microId]) || ''
                    return (
                      <path
                        key={p.id}
                        d={p.d}
                        fill="none"
                        stroke={hoverMun === p.id ? '#facc15' : '#52525b'}
                        strokeWidth={hoverMun === p.id ? 900 : 320}
                        style={{ cursor: 'default' }}
                        onMouseEnter={() => setHoverMun(p.id)}
                        onMouseLeave={() => setHoverMun(null)}
                      >
                        <title>{`${nome}${microNome ? ` · Micro ${microNome}` : ''}`}</title>
                      </path>
                    )
                  })}
                </svg>
              )}
            </div>
            <div className="hint">
              {(() => {
                if (!hoverMun) return `${mgMicro.paths.length || '…'} microrregiões · Flávio Bolsonaro (azul) · Lula (vermelho) · sem dados (cinza)`
                const ibge = hoverMun.replace('mun_', '')
                const nome = mgGeo.names[ibge] || `IBGE ${ibge}`
                const microId = munToMicro[ibge]
                const microNome = (microId && mgGeo.microNames[microId]) || ''
                return `${nome}${microNome ? ` · Micro ${microNome}` : ''}`
              })()}
            </div>
          </section>
        </div>
        <div className="footer">2º turno · presidente por UF (27 arquivos TSE) · presidente em MG por microrregião (cinza = aguardando endpoint do 2º turno)</div>
      </div>
    </div>
  )
}
