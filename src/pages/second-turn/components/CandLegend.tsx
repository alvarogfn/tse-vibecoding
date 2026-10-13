import { Avatar } from '@/components/Avatar';
import { fmtInt } from '@/lib/tse.js';
import type { Candidate } from '@/lib/tse.js';
import { fmtPct } from '@/helpers/election.js';

export function CandLegend({ cands, colors }: { cands: Candidate[]; colors: Record<string, string> }): React.JSX.Element {
  if (!cands?.length) return <div className="hint">Aguardando dados do 2º turno…</div>;
  return (
    <div className="st-legend">
      {cands.map((c) => (
        <div key={c.numero} className="st-leg-item" title={`${c.nomeFull} · ${c.partido} · ${fmtInt(c.vap)} votos`}>
          <span className="dot" style={{ background: colors[c.numero] ?? '#a1a1aa', width: 10, height: 10 }} />
          <Avatar src={c.foto} name={c.nomeUrna} />
          <span className="st-leg-name">{c.nomeUrna}</span>
          <span className="st-leg-party">
            {c.partido} · {c.numero}
          </span>
          <b className="st-leg-pct">{fmtPct(c.pvapNum)}</b>
        </div>
      ))}
    </div>
  );
}
