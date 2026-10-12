import { calcQuociente, fmtInt } from '@/lib/tse.js'
import type { ParsedRace } from '@/lib/tse.js'
import { fmtPct } from '@/helpers/election.js'

export interface QuocienteLineProps {
  parsed: ParsedRace;
}

export function QuocienteLine({ parsed }: QuocienteLineProps) {
  const parties = [...new Set((parsed.candidatos || []).map((c) => c.partidoNum))]
  return (
    <>
      {parties.map((pn) => {
        const q = calcQuociente(parsed.meta, parsed.partidos, pn)
        const full = `Partido ${fmtInt(q.partyVotes)} (legenda ${fmtInt(q.legenda)}) · QE ${fmtInt(q.qe)} · QP floor(${fmtInt(q.partyVotes)}/${fmtInt(q.qe)})=${q.qp} · Vagas ${q.vagas}`
        return (
          <div key={pn} className={q.atingiu ? 'summary-ok' : 'summary-bad'} title={full}>
            {q.sigla || pn}: {q.atingiu ? `${q.qp} cadeira(s)` : `0 · faltam ${fmtInt(q.faltam)} (${fmtPct(q.pctQE)} QE)`}
          </div>
        )
      })}
    </>
  )
}
