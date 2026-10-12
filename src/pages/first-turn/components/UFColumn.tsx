import { useMemo } from 'react'
import { aggregateParties } from '../../../lib/tse.js'
import type { AggParty, UFData } from '../../../lib/tse.js'
import { PartyCard } from './PartyCard.js'

export interface UFColumnProps {
  uf: string;
  name: string;
  data: UFData | null | undefined;
  at?: string | null;
}

export function UFColumn({ name, data, at }: UFColumnProps) {
  const parties = useMemo(() => {
    if (!data) return [] as AggParty[]
    let agg: AggParty[] = []
    try {
      agg = aggregateParties(data)
    } catch {
      return [] as AggParty[]
    }
    const seatsOf = (p: AggParty): number => (p.fed?.qp || 0) + (p.est?.qp || 0) + (p.sen?.seats || 0)
    const votesOf = (p: AggParty): number => (p.fed?.votes || 0) + (p.est?.votes || 0)
    return agg.sort((a, b) => seatsOf(b) - seatsOf(a) || votesOf(b) - votesOf(a))
  }, [data])
  const totalSeats = parties.reduce((a, p) => a + (p.fed?.qp || 0) + (p.est?.qp || 0) + (p.sen?.seats || 0), 0)
  return (
    <section className="column">
      <div className="col-title">{name}</div>
      <div className="summary" title="Cadeiras pelo QP (fed/est) + top vagas (sen) — parcial">
        {data ? <><b>{totalSeats} cad.</b> · {parties.length} partidos · {at || ''}</> : 'carregando…'}
      </div>
      <div className="cards-scroll" style={{ flex: 1, minHeight: 60 }}>
        {parties.map((p) => (
          <PartyCard key={p.pn} p={p} />
        ))}
      </div>
    </section>
  )
}
