import { fmtInt } from '../../../lib/tse.js'
import type { AggParty } from '../../../lib/tse.js'

export interface PartyCardProps {
  p: AggParty;
}

export function PartyCard({ p }: PartyCardProps) {
  const seats = (p.fed?.qp || 0) + (p.est?.qp || 0) + (p.sen?.seats || 0)
  const topName = (t: { nome: string; numero: string; vap: number } | null | undefined): string => (t ? `${t.nome} ${fmtInt(t.vap)} (${t.numero})` : '—')
  const fedTxt = p.fed ? `${p.fed.qp} cad · top ${topName(p.fed.top)}` : null
  const estTxt = p.est ? `${p.est.qp} cad · top ${topName(p.est.top)}` : null
  const senTxt = p.sen ? `${p.sen.seats}/${p.sen.vagas} · top ${topName(p.sen.top)}` : null
  const row = (label: string, txt: string | null): React.JSX.Element => (
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
