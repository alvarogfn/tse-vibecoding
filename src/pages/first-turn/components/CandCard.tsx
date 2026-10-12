import { colorFor, sharePct, fmtInt } from '../../../lib/tse.js'
import type { Candidate } from '../../../lib/tse.js'
import { Avatar } from '../../../components/Avatar.js'
import { fmtPct } from './utils.js'

export interface CandCardProps {
  c: Candidate;
  i: number;
  validos?: number | null;
  total?: number | null;
  pos?: number | null;
  onClick?: () => void;
  selected?: boolean;
  onPin?: () => void;
  isPinned?: boolean;
}

export function CandCard({ c, i, validos, total, pos, onClick, selected, onPin, isPinned }: CandCardProps) {
  const pctCalc = sharePct(c.vap, validos || total)
  return (
    <div
      className={`${onClick ? 'cand-clickable' : 'cand'}${selected ? ' cand-selected' : ''}`}
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
          className={isPinned ? 'pin-btn-on' : 'pin-btn'}
          title={isPinned ? 'Desafixar (sai do gráfico e do header)' : 'Fixar no header e no gráfico'}
          onClick={(e) => { e.stopPropagation(); onPin() }}
        >
          {isPinned ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}
