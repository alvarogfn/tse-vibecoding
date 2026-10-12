import { Fragment, useMemo } from 'react'
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
import { Virtuoso } from 'react-virtuoso'
import { Link } from 'react-router'
import { RACES, COLUMNS, UFS } from '@/lib/tse.js'
import type { Candidate, Race } from '@/lib/tse.js'
import { RaceChart, Summary, CandCard, CeDetail, UFColumn, BrazilColumn, fuzzyFilter } from '@/pages/first-turn/components'
import { useRacesPolling, useUFsSweep, useFirstTurnUI } from '@/pages/first-turn/hooks'
import { ErrorBoundary } from '@/components/ErrorBoundary.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

export default function App(): React.JSX.Element {
  const ui = useFirstTurnUI()
  const { open, toggleOpen, search, setSearch, pinned, togglePin, metric, setMetric } = ui
  const {
    data, errors, loading, refetch: fetchAll,
    auto, setAuto, refreshMs, setRefreshMs, countdown, setCountdown,
    finished, setFinished, totalHistoryPoints, effHistFor, clearHistoryData,
  } = useRacesPolling(pinned)
  const { data: ufs, meta: ufsMeta } = useUFsSweep(auto)
  const raceById = useMemo<Record<string, Race>>(() => Object.fromEntries(RACES.map((r) => [r.id, r])), [])

  return (
    <div className="page">
      <div className="topbar">
        <h1>Apuração 2026 — Tempo real</h1>
        <div className="sub">panorama geral · fixe ☆ p/ ver o gráfico · {refreshMs / 1000}s</div>
        <div className="spacer" />
        <Link className="btn-ghost-sm" to="/2-turno" style={{ textDecoration: 'none' }}>2º turno</Link>
        <span className="badge">{finished ? 'finalizada ✓' : auto ? `${countdown}s` : 'pausado'}</span>
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
        <button className="btn-ghost-sm" onClick={() => setMetric(metric === 'votos' ? 'pct' : 'votos')}>
          {metric === 'votos' ? 'votos' : '%'}
        </button>
        <button className="btn-ghost-sm" onClick={() => { setAuto(!auto); if (!auto) setFinished(false) }}>{auto ? 'Pausar' : 'Retomar'}</button>
        <button className="btn-sm" onClick={fetchAll} disabled={loading}>{loading ? '...' : 'Atualizar'}</button>
        <button
          className="btn-ghost-sm"
          onClick={async () => {
            if (confirm('Limpar histórico do IndexedDB?')) await clearHistoryData()
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
                const byKey = new Map<string, Candidate>(list.map((c) => [c.key, c]))
                const pinKeys = pinned[raceId] || []
                const pinnedCands = pinKeys.map((k) => byKey.get(k)).filter((c): c is Candidate => Boolean(c))
                const rankPos = new Map<string, number>(list.map((c, idx) => [c.key, idx + 1]))
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
                      <Virtuoso<Candidate>
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
            <ErrorBoundary key={`${uf}-${ufs[uf]?.at || 'loading'}`} title={name}>
              <UFColumn uf={uf} name={name} data={ufs[uf]} at={ufs[uf]?.at || ufsMeta.at} />
            </ErrorBoundary>
          ))}
        </div>

        <div className="footer">Panorama geral · fixe ☆ p/ ver o gráfico · {refreshMs / 1000}s · UFs 180s</div>
      </div>
    </div>
  )
}
