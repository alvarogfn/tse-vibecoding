import { useMemo } from 'react'
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'
import { Pie } from 'react-chartjs-2'
import { UFS, aggregateParties, partyColor, fmtInt } from '../../../lib/tse.js'
import type { AggParty, UFData } from '../../../lib/tse.js'
import type { BrazilMeta } from './utils.js'

export interface BrazilColumnProps {
  ufs: Record<string, UFData>;
  meta: BrazilMeta;
}

interface BrazilRow {
  pn: string;
  sg: string;
  fed: number;
  est: number;
  sen: number;
  votes: number;
}

export function BrazilColumn({ ufs, meta }: BrazilColumnProps) {
  const rows = useMemo(() => {
    const map: Record<string, BrazilRow> = {}
    for (const [uf] of UFS) {
      const d = ufs[uf]
      if (!d) continue
      let agg: AggParty[] = []
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
    const tot = (r: BrazilRow): number => r.fed + r.est + r.sen
    return arr.sort((a, b) => tot(b) - tot(a) || b.votes - a.votes)
  }, [ufs])
  const totalSeats = rows.reduce((a, r) => a + r.fed + r.est + r.sen, 0)
  const pieFor = (get: (r: BrazilRow) => number): ChartData<'pie'> => {
    const items = rows.filter((r) => get(r) > 0).sort((a, b) => get(b) - get(a))
    const top: Array<BrazilRow & { __seats?: number }> = items.slice(0, 5)
    const rest = items.slice(5)
    if (rest.length) {
      top.push({
        pn: 'outros',
        sg: 'Outros',
        fed: 0,
        est: 0,
        sen: 0,
        votes: 0,
        __seats: rest.reduce((a, r) => a + get(r), 0),
      })
    }
    return {
      labels: top.map((r) => r.sg),
      datasets: [{
        data: top.map((r) => (r.pn === 'outros' ? (r.__seats ?? 0) : get(r))),
        backgroundColor: top.map((r, i) => (r.pn === 'outros' ? '#52525b' : partyColor(r.pn, i))),
        borderColor: '#000',
        borderWidth: 1,
      }],
    }
  }
  const pieOpts: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'right', labels: { boxWidth: 8, font: { size: 9 }, color: '#fafafa' } },
      tooltip: { callbacks: { label: (ctx: TooltipItem<'pie'>) => ` ${ctx.label}: ${ctx.parsed} cad.` } },
    },
  }
  const pies: Array<[string, ChartData<'pie'>]> = [
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
              {data.labels?.length ? <Pie data={data} options={pieOpts} /> : <div className="hint" style={{ textAlign: 'center' }}>—</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="cards-scroll" style={{ flex: 1, minHeight: 60 }}>
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
