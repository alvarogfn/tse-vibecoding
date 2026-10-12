import { MicroPath } from '@/pages/second-turn/components/MicroPath';
import { MunPath } from '@/pages/second-turn/components/MunPath';
import { fmtPct } from '@/helpers/election.js';
import type { Candidate } from '@/lib/tse.js';
import type { SvgPath } from '@/lib/second-turn.js';

interface MinasMapProps {
  microPaths: SvgPath[];
  munPaths: SvgPath[];
  microFill: (microId: string) => string;
  winnersByMicro: Record<string, string>;
  mgTop2Shown: Candidate[];
  microNames: Record<string, string>;
  names: Record<string, string>;
  munToMicro: Record<string, string>;
  hoverMun: string | null;
  onHover: (id: string | null) => void;
}

// Camada do mapa de Minas Gerais: micros (preenchimento) + municípios (contorno/hover). Pura.
export function MinasMap({
  microPaths,
  munPaths,
  microFill,
  winnersByMicro,
  mgTop2Shown,
  microNames,
  names,
  munToMicro,
  hoverMun,
  onHover,
}: MinasMapProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 258000 200000" className="st-svg" role="img" aria-label="Mapa de Minas Gerais por microrregião">
      {microPaths.map((p) => {
        const winNum = winnersByMicro[p.id];
        const win = winNum ? mgTop2Shown.find((c) => String(c.numero) === String(winNum)) : undefined;
        const microNome = microNames[p.id] || p.id.replace('micro_', 'Micro ');
        return (
          <MicroPath
            key={p.id}
            id={p.id}
            d={p.d}
            fill={microFill(p.id)}
            titleText={`Micro ${microNome}${win ? ` · ${win.nomeUrna} ${fmtPct(win.pvapNum)}` : ' · sem dados do 2º turno'}`}
          />
        );
      })}
      {munPaths.map((p) => {
        const ibge = p.id.replace('mun_', '');
        const nome = names[ibge] || `IBGE ${ibge}`;
        const microId = munToMicro[ibge];
        const microNome = (microId && microNames[microId]) || '';
        const winNum = (microId && winnersByMicro[microId]) || null;
        const win = winNum ? mgTop2Shown.find((c) => String(c.numero) === String(winNum)) : undefined;
        return (
          <MunPath
            key={p.id}
            id={p.id}
            d={p.d}
            highlighted={hoverMun === p.id}
            onHover={onHover}
            titleText={`${nome}${microNome ? ` · Micro ${microNome}` : ''}${win ? ` · ${win.nomeUrna}` : ''}`}
          />
        );
      })}
    </svg>
  );
}
