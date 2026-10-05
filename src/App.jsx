import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line, Pie } from 'react-chartjs-2'
import { Virtuoso } from 'react-virtuoso'
import FuzzySearch from 'fuzzy-search'
import { RACES, COLUMNS, UFS, fetchRaceJson, fetchMissaoUF, fetchUFCargos, aggregateParties, parseRace, colorFor, partyColor, fmtInt, calcQuociente, sharePct } from './lib/tse.js'
import { loadHistory, appendSnapshot, clearHistory, hashVotes } from './lib/history.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

const REFRESH_MS = 5000
const AXIS = '#a1a1aa'
const GRID = '#27272a'

function fmtPct(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

// Busca aproximada (typo-tolerant) sobre a lista; sem query retorna tudo
function fuzzyFilter(list, query, keys) {
  const q = (query || '').trim()
  if (!q) return list
  try {
    return new FuzzySearch(list, keys, { caseSensitive: false, sort: true }).search(q)
  } catch {
    const lq = q.toLowerCase()
    return list.filter((c) => keys.some((k) => String(c[k] || '').toLowerCase().includes(lq)))
  }
}

function Avatar({ src, name }) {
  const [err, setErr] = useState(false)
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  if (err) return <div className="avatar-fallback">{initials}</div>
  return <img className="avatar" src={src} alt={name} loading="lazy" onError={() => setErr(true)} />
}

function shareFromSnap(snap, numero) {
  if (!snap) return null
  if (snap.share && snap.share[numero] != null) return snap.share[numero]
  const v = snap.votes?.[numero]
  if (v == null) return null
  const denom = snap.validos || snap.total
  if (denom) return (v / denom) * 100
  if (snap.pct && snap.pct[numero] != null) return snap.pct[numero]
  return null
}

function RaceChart({ visible, history, metric }) {
  const pts = history || []
  const labels = pts.map((s) => s.label)
  const datasets = visible.map((c, i) => ({
    label: `${c.numero} ${c.nomeUrna}`,
    data: pts.map((s) =>
      metric === 'pct' ? shareFromSnap(s, c.numero) : (s.votes?.[c.numero] ?? null)
    ),
    borderColor: colorFor(c.numero, i),
    backgroundColor: colorFor(c.numero, i),
    tension: 0.25,
    pointRadius: 0,
    borderWidth: 1.5,
    spanGaps: true,
  }))
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 }, color: '#fafafa' } },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            metric === 'pct'
              ? ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.y)}`
              : ` ${ctx.dataset.label}: ${fmtInt(ctx.parsed.y)} votos`,
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 8 }, maxTicksLimit: 4, color: AXIS }, grid: { color: GRID } },
      y: {
        ticks: {
          font: { size: 8 },
          maxTicksLimit: 5,
          color: AXIS,
          callback: (v) => (metric === 'pct' ? `${Number(v).toFixed(1)}%` : fmtInt(v)),
        },
        grid: { color: GRID },
      },
    },
  }
  if (!pts.length) return <div className="hint">Sem histórico ainda.</div>
  return <Line data={{ labels, datasets }} options={options} />
}

function Summary({ meta }) {
  const s = meta?.s || {}
  const txt = `${s.pst || '-'}% urnas · ${fmtInt(meta?.validos)} válidos · ${fmtInt(meta?.v?.tv)} votos`
  const full = `Seções ${fmtInt(s.st)}/${fmtInt(s.ts)} · Eleitorado ${fmtInt(meta?.e?.te)} · Comparec. ${fmtInt(meta?.e?.c)} · Brancos ${fmtInt(meta?.v?.vb)} · Nulos ${fmtInt(meta?.v?.vn ?? meta?.v?.tvn)}`
  return <div className="summary" title={full}>{txt}</div>
}

function QuocienteLine({ parsed }) {
  const parties = [...new Set((parsed.candidatos || []).map((c) => c.partidoNum))]
  return (
    <>
      {parties.map((pn) => {
        const q = calcQuociente(parsed.meta, parsed.partidos, pn)
        const full = `Partido ${fmtInt(q.partyVotes)} (legenda ${fmtInt(q.legenda)}) · QE ${fmtInt(q.qe)} · QP floor(${fmtInt(q.partyVotes)}/${fmtInt(q.qe)})=${q.qp} · Vagas ${q.vagas}`
        return (
          <div key={pn} className={`summary ${q.atingiu ? 'ok' : 'bad'}`} title={full}>
            {q.sigla || pn}: {q.atingiu ? `${q.qp} cadeira(s)` : `0 · faltam ${fmtInt(q.faltam)} (${fmtPct(q.pctQE)} QE)`}
          </div>
        )
      })}
    </>
  )
}

function CandCard({ c, i, validos, total, pos, onClick, selected, onPin, isPinned }) {
  const pctCalc = sharePct(c.vap, validos || total)
  return (
    <div
      className={`cand${onClick ? ' clickable' : ''}${selected ? ' selected' : ''}`}
      title={`${c.nomeFull} · TSE ${c.pvap}%${onClick ? ' · clique p/ ver cadeiras do partido' : ''}`}
      onClick={onClick}
    >
      <Avatar src={c.foto} name={c.nomeUrna} />
      <div className="cand-mid">
        <div className="cand-name">
          {pos != null && <span className="pos">{pos}º </span>}
          <span className="dot" style={{ background: colorFor(c.numero, i) }} />{c.nomeUrna}
        </div>
        <div className="cand-party">{c.partido} – {c.numero}</div>
      </div>
      <div className="cand-pct">
        <b>{fmtPct(pctCalc)}</b>
        <span>{fmtInt(c.vap)}</span>
      </div>
      {onPin && (
        <button
          className={`pin-btn${isPinned ? ' on' : ''}`}
          title={isPinned ? 'Desafixar (sai do gráfico e do header)' : 'Fixar no header e no gráfico'}
          onClick={(e) => { e.stopPropagation(); onPin() }}
        >
          {isPinned ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}

function CeDetail({ parsed, cand }) {
  const q = calcQuociente(parsed.meta, parsed.partidos, cand.partidoNum)
  const min = Math.ceil(q.qe * 0.1)
  const okMin = q.qe > 0 && cand.vap >= min
  return (
    <div className="ce-detail" title={`Partido ${fmtInt(q.partyVotes)} votos (legenda ${fmtInt(q.legenda)}) · QE ${fmtInt(q.qe)} · QP ${q.qp}`}>
      {q.sigla || cand.partido}: <b>{q.atingiu ? `${q.qp} cadeira(s)` : '0 cadeiras'} pelo QE</b>
      {' '}· partido {fmtInt(q.partyVotes)} votos · QE {fmtInt(q.qe)}
      {' '}· {q.atingiu ? `faltam ${fmtInt(q.faltam)} p/ a próxima` : `faltam ${fmtInt(q.faltam)} p/ a 1ª`}
      {' '}· candidato {fmtInt(cand.vap)} votos (10% QE = {fmtInt(min)}: {okMin ? 'tem' : 'não tem'})
      {' '}· parcial {parsed.meta.hg}
    </div>
  )
}

const UFNAME = Object.fromEntries(UFS)

function MissCard({ uf, r }) {
  const name = UFNAME[uf] || uf.toUpperCase()
  if (!r.ok) {
    return (
      <div className="cand" title={`${name} — arquivo indisponível no TSE`}>
        <div className="cand-mid">
          <div className="cand-name">{name}</div>
          <div className="cand-party">sem dados</div>
        </div>
      </div>
    )
  }
  if (!r.found) {
    return (
      <div className="cand" title={`${name} — MISSÃO sem candidatura apurada`}>
        <div className="cand-mid">
          <div className="cand-name">{name}</div>
          <div className="cand-party">sem candidatura</div>
        </div>
      </div>
    )
  }
  return (
    <div
      className="cand"
      title={`${name} — MISSÃO ${fmtInt(r.partyVotes)} votos (legenda ${fmtInt(r.legenda)}) · QE ${fmtInt(r.qe)} · QP ${r.qp} · ${r.vagas} vagas`}
    >
      <div className="cand-mid">
        <div className="cand-name">{name}</div>
        <div className="cand-party">{fmtInt(r.partyVotes)} votos · QE {fmtInt(r.qe)}</div>
      </div>
      <div className="cand-pct">
        <b>{r.atingiu ? `${r.qp} cad.` : '0'}</b>
        <span>{r.atingiu ? `+${fmtInt(r.faltam)} prox` : `faltam ${fmtInt(r.faltam)}`}</span>
      </div>
    </div>
  )
}

function PartyCard({ p }) {
  const seats = (p.fed?.qp || 0) + (p.est?.qp || 0) + (p.sen?.seats || 0)
  const topName = (t) => (t ? `${t.nome} ${fmtInt(t.vap)} (${t.numero})` : '—')
  const fedTxt = p.fed ? `${p.fed.qp} cad · top ${topName(p.fed.top)}` : null
  const estTxt = p.est ? `${p.est.qp} cad · top ${topName(p.est.top)}` : null
  const senTxt = p.sen ? `${p.sen.seats}/${p.sen.vagas} · top ${topName(p.sen.top)}` : null
  const row = (label, txt) => (
    <div className="party-row">
      {label} · {txt == null ? <span className="party-top">s/dados</span> : <b>{txt}</b>}
    </div>
  )
  return (
    <div
      className="party"
      title={`${p.sg} — Fed ${p.fed ? `${fmtInt(p.fed.votes)} votos, QP ${p.fed.qp}` : 's/dados'} · Est ${p.est ? `${fmtInt(p.est.votes)} votos, QP ${p.est.qp}` : 's/dados'} · Sen ${p.sen ? `${p.sen.seats}/${p.sen.vagas}` : 's/dados'}`}
    >
      <div className="party-name">{p.sg} – {p.pn} · <b>{seats} cad.</b></div>
      {row('Fed', fedTxt)}
      {row('Est', estTxt)}
      {row('Sen', senTxt)}
    </div>
  )
}

function UFColumn({ uf, name, data, at }) {
  const parties = useMemo(() => {
    if (!data) return []
    let agg = []
    try {
      agg = aggregateParties(data)
    } catch {
      return []
    }
    const seatsOf = (p) => (p.fed?.qp || 0) + (p.est?.qp || 0) + (p.sen?.seats || 0)
    const votesOf = (p) => (p.fed?.votes || 0) + (p.est?.votes || 0)
    return agg.sort((a, b) => seatsOf(b) - seatsOf(a) || votesOf(b) - votesOf(a))
  }, [data])
  const totalSeats = parties.reduce((a, p) => a + (p.fed?.qp || 0) + (p.est?.qp || 0) + (p.sen?.seats || 0), 0)
  return (
    <section className="column">
      <div className="col-title">{name}</div>
      <div className="summary" title="Cadeiras pelo QP (fed/est) + top vagas (sen) — parcial">
        {data ? <><b>{totalSeats} cad.</b> · {parties.length} partidos · {at || ''}</> : 'carregando…'}
      </div>
      <div className="cards scroll" style={{ flex: 1, minHeight: 60 }}>
        {parties.map((p) => (
          <PartyCard key={p.pn} p={p} />
        ))}
      </div>
    </section>
  )
}

// Uma coluna com erro nunca mais apaga o painel inteiro
class ColGuard extends React.Component {
  constructor(p) {
    super(p)
    this.state = { err: null }
  }
  static getDerivedStateFromError(err) {
    return { err: String(err?.message || err) }
  }
  render() {
    if (this.state.err) {
      return (
        <section className="column">
          <div className="col-title">{this.props.title}</div>
          <div className="err">Falha nesta coluna: {this.state.err}</div>
        </section>
      )
    }
    return this.props.children
  }
}

function BrazilColumn({ ufs, meta }) {
  const rows = useMemo(() => {
    const map = {}
    for (const [uf] of UFS) {
      const d = ufs[uf]
      if (!d) continue
      let agg = []
      try {
        agg = aggregateParties(d)
      } catch {
        continue
      }
      for (const p of agg) {
        const e = map[p.pn] || (map[p.pn] = { pn: p.pn, sg: p.sg, fed: 0, est: 0, sen: 0, votes: 0 })
        e.fed += p.fed?.qp || 0
        e.est += p.est?.qp || 0
        e.sen += p.sen?.seats || 0
        e.votes += (p.fed?.votes || 0) + (p.est?.votes || 0)
      }
    }
    const arr = Object.values(map)
    const tot = (r) => r.fed + r.est + r.sen
    return arr.sort((a, b) => tot(b) - tot(a) || b.votes - a.votes)
  }, [ufs])
  const totalSeats = rows.reduce((a, r) => a + r.fed + r.est + r.sen, 0)
  const pieFor = (get) => {
    const items = rows.filter((r) => get(r) > 0).sort((a, b) => get(b) - get(a))
    const top = items.slice(0, 5)
    const rest = items.slice(5)
    if (rest.length) {
      top.push({
        pn: 'outros',
        sg: 'Outros',
        __seats: rest.reduce((a, r) => a + get(r), 0),
      })
    }
    return {
      labels: top.map((r) => r.sg),
      datasets: [{
        data: top.map((r) => (r.pn === 'outros' ? r.__seats : get(r))),
        backgroundColor: top.map((r, i) => (r.pn === 'outros' ? '#52525b' : partyColor(r.pn, i))),
        borderColor: '#000',
        borderWidth: 1,
      }],
    }
  }
  const pieOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'right', labels: { boxWidth: 8, font: { size: 9 }, color: '#fafafa' } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed} cad.` } },
    },
  }
  const pies = [
    ['FED · cadeiras por partido', pieFor((r) => r.fed)],
    ['EST · cadeiras por partido', pieFor((r) => r.est)],
    ['SEN · cadeiras por partido', pieFor((r) => r.sen)],
  ]
  return (
    <section className="column">
      <div className="col-title">Partidos · Brasil</div>
      <div className="summary" title="Soma nacional: QPs (fed/est) + top vagas (sen) — parcial">
        <b>{totalSeats} cad.</b> · {rows.length} partidos · {meta.loading ? `lendo ${meta.done}/${meta.total}…` : `atualizado ${meta.at || '—'}`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
        {pies.map(([label, data]) => (
          <div key={label}>
            <div className="chart-title" style={{ marginTop: 0 }}>{label}</div>
            <div style={{ height: 170, position: 'relative' }}>
              {data.labels.length ? <Pie data={data} options={pieOpts} /> : <div className="hint" style={{ textAlign: 'center' }}>—</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="cards scroll" style={{ flex: 1, minHeight: 60 }}>
        {rows.map((r) => (
          <div
            key={r.pn}
            className="party"
            title={`${r.sg} — Fed ${r.fed} cad · Est ${r.est} cad · Sen ${r.sen} cad · ${fmtInt(r.votes)} votos (fed+est)`}
          >
            <div className="party-name">{r.sg} – {r.pn} · <b>{r.fed + r.est + r.sen} cad.</b></div>
            <div className="party-row">Fed · <b>{r.fed} cad.</b></div>
            <div className="party-row">Est · <b>{r.est} cad.</b></div>
            <div className="party-row">Sen · <b>{r.sen} cad.</b></div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MissaoCol({ titulo, data, meta }) {
  const [q, setQ] = useState('')
  const pool = UFS.map(([uf]) => ({ uf, name: UFNAME[uf] || uf, r: data[uf] })).filter((x) => x.r)
  const rows = fuzzyFilter(pool, q, ['name', 'uf'])
  const okCount = pool.filter((x) => x.r.ok && x.r.found).length
  const totalQP = pool.reduce((a, x) => a + (x.r.ok && x.r.found ? x.r.qp : 0), 0)
  const sorted = [...rows].sort((a, b) => {
    const qa = a.r.ok && a.r.found ? a.r.qp : -1
    const qb = b.r.ok && b.r.found ? b.r.qp : -1
    if (qb !== qa) return qb - qa
    return (b.r.pctQE || -1) - (a.r.pctQE || -1)
  })
  return (
    <section className="column">
      <div className="col-title">{titulo}</div>
      <input
        className="search"
        placeholder="Buscar estado…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="summary" title="Soma dos quocientes partidários do MISSÃO apurados até agora (parcial)">
        MISSÃO: <b>{totalQP} cadeira(s)</b> · {okCount} UFs · {meta.loading ? `lendo ${meta.done}/${meta.total}…` : `atualizado ${meta.at || '—'}`}
      </div>
      <div className="cards scroll" style={{ flex: 1, minHeight: 60 }}>
        {sorted.map(({ uf, r }) => (
          <MissCard key={uf} uf={uf} r={r} />
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const [data, setData] = useState({})
  const [errors, setErrors] = useState({})
  const [history, setHistory] = useState({})
  const [loading, setLoading] = useState(true)
  const [auto, setAuto] = useState(true)
  const [metric, setMetric] = useState('pct')
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000)
  const [refreshMs, setRefreshMs] = useState(REFRESH_MS)
  const [open, setOpen] = useState({}) // { [candKey]: true } — vários QE abertos
  const toggleOpen = useCallback((key) => setOpen((p) => ({ ...p, [key]: !p[key] })), [])
  const [search, setSearch] = useState({}) // { [raceId]: query } — busca por nome na coluna
  const [missao, setMissao] = useState({ fed: {}, est: {}, at: null, loading: true, done: 0, total: UFS.length * 2 })
  const [ufs, setUfs] = useState({}) // { [uf]: {fed, est, sen} } — 1 coluna por estado
  const [ufsMeta, setUfsMeta] = useState({ loading: true, done: 0, total: UFS.length, at: null })
  const [pinned, setPinned] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tse-pinned-v1') || '{}')
    } catch {
      return {}
    }
  }) // { [raceId]: [candKey] } — só fixados vão ao gráfico + header
  const pinnedRef = useRef({})
  useEffect(() => {
    pinnedRef.current = pinned
    try {
      localStorage.setItem('tse-pinned-v1', JSON.stringify(pinned))
    } catch { /* sem persistência */ }
  }, [pinned])
  const togglePin = useCallback((raceId, key) => {
    setPinned((p) => {
      const arr = (p[raceId] || []).filter((k) => k !== key)
      if (!(p[raceId] || []).includes(key)) arr.push(key)
      return { ...p, [raceId]: arr }
    })
  }, [])
  const fetchingRef = useRef(false)
  const raceById = useMemo(() => Object.fromEntries(RACES.map((r) => [r.id, r])), [])

  useEffect(() => {
    loadHistory().then((h) => setHistory(h || {}))
  }, [])

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    const nextData = {}
    const nextErr = {}
    for (const race of RACES) {
      try {
        const raw = await fetchRaceJson(race.url)
        const parsed = parseRace(race, raw)
        nextData[race.id] = parsed
        // geral: histórico do top 15 + fixados (gráfico: fixados ou top 10)
        if (race.tipo !== 'senado') {
          const byKey = new Map(parsed.candidatos.map((c) => [c.key, c]))
          const wanted = new Map()
          for (const c of parsed.candidatos.slice(0, 15)) wanted.set(c.key, c)
          for (const k of pinnedRef.current[race.id] || []) {
            const c = byKey.get(k)
            if (c) wanted.set(k, c)
          }
          const snapCands = [...wanted.values()]
          const votes = {}
          const pctTse = {}
          const share = {}
          const names = {}
          for (const c of snapCands) {
            votes[c.numero] = c.vap
            pctTse[c.numero] = c.pvapNum
            share[c.numero] = sharePct(c.vap, parsed.meta.validos || parsed.meta.totalVotos)
            names[c.numero] = c.nomeUrna
          }
          const label = `${parsed.meta.ht || parsed.meta.hg || new Date().toLocaleTimeString('pt-BR')}`
          const snap = {
            t: Date.now(),
            label,
            hg: parsed.meta.hg,
            dg: parsed.meta.dg,
            hash: hashVotes(snapCands),
            votes,
            pct: pctTse,
            share,
            names,
            validos: parsed.meta.validos,
            total: parsed.meta.totalVotos,
            secoes: parsed.meta?.s?.st,
          }
          const updated = await appendSnapshot(race.id, snap)
          if (updated) setHistory(updated)
        }
      } catch (err) {
        nextErr[race.id] = String(err?.message || err)
      }
    }
    setData((prev) => ({ ...prev, ...nextData }))
    setErrors(nextErr)
    setLoading(false)
    setCountdown(refreshMs / 1000)
    fetchingRef.current = false
  }, [refreshMs])

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => {
      setCountdown((c) => (c <= 1 ? refreshMs / 1000 : c - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [auto, refreshMs])

  // fetch em timer próprio (updater acima é puro — só display)
  useEffect(() => {
    if (!auto) return
    const id = setInterval(fetchAll, refreshMs)
    return () => clearInterval(id)
  }, [auto, refreshMs, fetchAll])

  // 27 estados × 3 cargos (81 arquivos) — ciclo lento separado, 180s, lotes de 5
  const fetchUFs = useCallback(async () => {
    const out = {}
    for (let i = 0; i < UFS.length; i += 5) {
      const batch = UFS.slice(i, i + 5)
      const res = await Promise.all(batch.map(async ([uf]) => [uf, await fetchUFCargos(uf)]))
      for (const [uf, r] of res) out[uf] = { ...r, at: new Date().toLocaleTimeString('pt-BR') }
      setUfs((prev) => ({ ...prev, ...out }))
      setUfsMeta({ loading: true, done: Math.min(i + 5, UFS.length), total: UFS.length, at: null })
    }
    setUfsMeta({ loading: false, done: UFS.length, total: UFS.length, at: new Date().toLocaleTimeString('pt-BR') })
  }, [])

  useEffect(() => {
    fetchUFs()
  }, [fetchUFs])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(fetchUFs, 180000)
    return () => clearInterval(id)
  }, [auto, fetchUFs])

  // MISSÃO em todos os estados (54 arquivos) — ciclo lento separado, 120s
  const fetchMissao = useCallback(async () => {
    const jobs = []
    for (const [uf] of UFS) {
      jobs.push(['fed', uf, 6], ['est', uf, 7])
    }
    const out = { fed: {}, est: {} }
    for (let i = 0; i < jobs.length; i += 8) {
      const batch = jobs.slice(i, i + 8)
      const res = await Promise.all(
        batch.map(async ([k, uf, cargo]) => {
          try {
            return [k, uf, await fetchMissaoUF(uf, cargo)]
          } catch {
            return [k, uf, { uf, ok: false }]
          }
        })
      )
      for (const [k, uf, r] of res) out[k][uf] = r
      setMissao((m) => ({ ...m, done: Math.min(i + 8, jobs.length) }))
    }
    setMissao({ ...out, at: new Date().toLocaleTimeString('pt-BR'), loading: false, done: jobs.length, total: jobs.length })
  }, [])

  useEffect(() => {
    fetchMissao()
  }, [fetchMissao])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(fetchMissao, 120000)
    return () => clearInterval(id)
  }, [auto, fetchMissao])

  // Mantém Higor (1420) e Luana (14000) fixados por padrão (só se nunca fixou nada)
  const didDefaultPin = useRef(false)
  useEffect(() => {
    if (didDefaultPin.current) return
    try {
      if (localStorage.getItem('tse-pinned-v1') != null) {
        didDefaultPin.current = true
        return
      }
    } catch { /* sem localStorage */ }
    const fed = data['depfed-mg']?.ranking?.find((c) => c.numero === '1420')
    const est = data['depest-mg']?.ranking?.find((c) => c.numero === '14000')
    if (fed && est) {
      didDefaultPin.current = true
      setPinned({ 'depfed-mg': [fed.key], 'depest-mg': [est.key] })
    }
  }, [data])

  const totalHistoryPoints = useMemo(
    () => Object.values(history).reduce((a, arr) => a + (arr?.length || 0), 0),
    [history]
  )

  function effHistFor(raceId) {
    const parsed = data[raceId]
    const cands = parsed?.candidatos || []
    const hist = history[raceId] || []
    if (hist.length > 0) return hist
    if (!cands.length) return []
    return [
      {
        label: parsed?.meta?.ht || parsed?.meta?.hg || 'agora',
        votes: Object.fromEntries(cands.map((c) => [c.numero, c.vap])),
        share: Object.fromEntries(cands.map((c) => [c.numero, sharePct(c.vap, parsed.meta.validos)])),
        pct: Object.fromEntries(cands.map((c) => [c.numero, c.pvapNum])),
        validos: parsed.meta.validos,
        total: parsed.meta.totalVotos,
      },
    ]
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Apuração 2026 — Tempo real</h1>
        <div className="sub">panorama geral · fixe ☆ p/ ver o gráfico · {refreshMs / 1000}s</div>
        <div className="spacer" />
        <span className="badge">{auto ? `${countdown}s` : 'pausado'}</span>
        <span className="badge">{totalHistoryPoints} pts</span>
        <select
          className="select small"
          value={refreshMs}
          title="Intervalo de atualização"
          onChange={(e) => {
            const v = Number(e.target.value)
            setRefreshMs(v)
            setCountdown(v / 1000)
          }}
        >
          <option value={1000}>1s</option>
          <option value={3000}>3s</option>
          <option value={5000}>5s</option>
          <option value={10000}>10s</option>
        </select>
        <button className="btn ghost small" onClick={() => setMetric(metric === 'votos' ? 'pct' : 'votos')}>
          {metric === 'votos' ? 'votos' : '%'}
        </button>
        <button className="btn ghost small" onClick={() => setAuto(!auto)}>{auto ? 'Pausar' : 'Retomar'}</button>
        <button className="btn small" onClick={fetchAll} disabled={loading}>{loading ? '...' : 'Atualizar'}</button>
        <button
          className="btn ghost small"
          onClick={async () => {
            if (confirm('Limpar histórico do IndexedDB?')) setHistory(await clearHistory())
          }}
        >
          Limpar
        </button>
      </div>

      <div className="wrap">
        <div className="grid-races">
          {COLUMNS.map((col) => (
            <section key={col.key} className="column">
              <div className="col-title">{col.titulo}</div>
              {col.races.map((raceId) => {
                const race = raceById[raceId]
                const parsed = data[raceId]
                const list = parsed?.ranking || parsed?.candidatos || []
                const isProp = race.tipo === 'proporcional'
                const effHist = col.rankingOnly ? [] : effHistFor(raceId)
                const byKey = new Map(list.map((c) => [c.key, c]))
                const pinKeys = pinned[raceId] || []
                const pinnedCands = pinKeys.map((k) => byKey.get(k)).filter(Boolean)
                const rankPos = new Map(list.map((c, idx) => [c.key, idx + 1]))
                const query = search[raceId] || ''
                const filtered = fuzzyFilter(list, query, ['nomeUrna', 'nomeFull', 'numero', 'partido'])
                const top10 = list.slice(0, 10)
                const chartCands = pinnedCands.length ? pinnedCands : top10
                return (
                  <div key={raceId} className="sub-race" style={{ flex: 1, minHeight: 0 }}>
                    <div className="race-head">
                      <h2>{race.titulo}</h2>
                      <div className="meta">{parsed ? `${parsed.meta.hg}${effHist.length ? ` · ${effHist.length}` : ''}` : '…'}</div>
                    </div>
                    {errors[raceId] && !parsed && <div className="err">{errors[raceId]}</div>}
                    {parsed && <Summary meta={parsed.meta} />}
                    <input
                      className="search"
                      placeholder="Buscar nome…"
                      value={search[raceId] || ''}
                      onChange={(e) => setSearch((p) => ({ ...p, [raceId]: e.target.value }))}
                    />
                    {!col.rankingOnly && pinnedCands.length > 0 && (
                      <div className="cards" style={{ flex: 'none', maxHeight: 230, overflowY: 'auto', marginBottom: 6 }}>
                        <div className="chart-title">Fixados · {pinnedCands.length}</div>
                        {pinnedCands.map((c) => (
                          <Fragment key={c.key}>
                            <CandCard
                              c={c} i={0}
                              validos={parsed?.meta?.validos} total={parsed?.meta?.totalVotos}
                              pos={rankPos.get(c.key)}
                              onClick={isProp ? () => toggleOpen(c.key) : undefined}
                              selected={isProp && !!open[c.key]}
                              onPin={() => togglePin(raceId, c.key)}
                              isPinned
                            />
                            {isProp && open[c.key] && <div style={{ marginTop: 4 }}><CeDetail parsed={parsed} cand={c} /></div>}
                          </Fragment>
                        ))}
                      </div>
                    )}
                    {!col.rankingOnly && pinnedCands.length > 0 && (
                      <>
                        <div className="chart-title">Fixados ({pinnedCands.length}) · {metric === 'pct' ? '% s/ válidos' : 'votos'} · {effHist.length} pts</div>
                        <div className="chart-box" style={{ flex: 'none', height: 150 }}>
                          <RaceChart visible={chartCands} history={effHist} metric={metric} />
                        </div>
                      </>
                    )}
                    {!col.rankingOnly && (
                      <div className="chart-title">Ranking geral · {list.length}</div>
                    )}
                    <div style={{ flex: 1, minHeight: 60 }}>
                      <Virtuoso
                        style={{ height: '100%' }}
                        data={filtered}
                        computeItemKey={(_idx, c) => c.key}
                        itemContent={(i, c) => (
                          <>
                            <div style={{ paddingBottom: 4 }}>
                              <CandCard
                                c={c} i={i}
                                validos={parsed?.meta?.validos} total={parsed?.meta?.totalVotos}
                                pos={rankPos.get(c.key)}
                                onClick={isProp ? () => toggleOpen(c.key) : undefined}
                                selected={isProp && !!open[c.key]}
                                onPin={col.rankingOnly ? undefined : () => togglePin(raceId, c.key)}
                                isPinned={pinKeys.includes(c.key)}
                              />
                              {isProp && open[c.key] && <div style={{ marginTop: 4 }}><CeDetail parsed={parsed} cand={c} /></div>}
                            </div>
                          </>
                        )}
                      />
                    </div>
                  </div>
                )
              })}
            </section>
          ))}
          <BrazilColumn ufs={ufs} meta={ufsMeta} />
          {UFS.map(([uf, name]) => (
            <ColGuard key={`${uf}-${ufs[uf]?.at || 'loading'}`} title={name}>
              <UFColumn uf={uf} name={name} data={ufs[uf]} at={ufs[uf]?.at || ufsMeta.at} />
            </ColGuard>
          ))}
          <MissaoCol titulo="Missão · QE Estaduais" data={missao.est} meta={missao} />
          <MissaoCol titulo="Missão · QE Federais" data={missao.fed} meta={missao} />
        </div>

        <div className="footer">Panorama geral + cadeiras por partido/UF + QE MISSÃO · fixe ☆ p/ filtrar o gráfico · {refreshMs / 1000}s · UFs 180s · missão 120s</div>
      </div>
    </div>
  )
}
