import { calcQuociente, fmtInt } from '@/lib/tse.js'
import type { Candidate, ParsedRace } from '@/lib/tse.js'

export interface CeDetailProps {
  parsed: ParsedRace;
  cand: Candidate;
}

export function CeDetail({ parsed, cand }: CeDetailProps) {
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
