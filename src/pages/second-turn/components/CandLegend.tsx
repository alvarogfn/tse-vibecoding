import { Avatar } from '@/components/Avatar';
import { fmtInt } from '@/lib/tse.js';
import type { Candidate } from '@/lib/tse.js';
import { JAIR_BLUE, LULA_RED } from '@/lib/second-turn.js';
import { fmtPct, marginColor } from '@/helpers/election.js';

export function CandLegend({ cands, colors }: { cands: Candidate[]; colors: Record<string, string> }): React.JSX.Element {
  if (!cands?.length) return <div className="hint">Aguardando dados do 2º turno…</div>;
  const lula = cands.find((c) => String(c.numero) === '13');
  const flavio = cands.find((c) => String(c.numero) === '22');
  const leftName = lula?.nomeUrna || 'Lula';
  const rightName = flavio?.nomeUrna || 'Flávio';
  const leftColor = colors['13'] ?? LULA_RED;
  const rightColor = colors['22'] ?? JAIR_BLUE;
  const leftPale = marginColor(leftColor, 50);
  const rightPale = marginColor(rightColor, 50);
  return (
    <div className="flex-none w-full">
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
      <div
        className="flex-none mb-[6px]"
        title="Cor = % do vencedor na disputa entre os dois finalistas · 50% = tom claro do vencedor · 60% ou mais = cor cheia"
      >
        <div
          className="h-1.5 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${leftColor} 0%, ${leftColor} 40%, ${leftPale} 50%, ${rightPale} 50%, ${rightColor} 60%, ${rightColor} 100%)`,
          }}
        />
        <div className="flex justify-between text-[10px] text-muted leading-none mt-0.5">
          <span>{leftName} 100%</span>
          <span>50%</span>
          <span>{rightName} 100%</span>
        </div>
        <div className="text-center text-[10px] text-muted leading-none mt-0.5">50% tom claro · 60%+ cor cheia</div>
      </div>
    </div>
  );
}
