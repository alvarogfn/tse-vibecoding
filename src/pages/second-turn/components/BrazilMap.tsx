import { USE_ROUND2_GEO } from '../../../lib/second-turn.js';
import { fmtPct } from '../../../helpers/election.js';
import type { SvgPath, UFWinner } from '../../../lib/second-turn.js';

interface BrazilMapProps {
  paths: SvgPath[];
  fill: (pathId: string) => string;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  winners: Record<string, UFWinner>;
}

// Camada do mapa do Brasil (preenchimento por UF). Pura: sem fetch, sem estado.
export function BrazilMap({ paths, fill, hoverId, onHover, winners }: BrazilMapProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 612.51611 639.04297" className="st-svg" role="img" aria-label="Mapa do Brasil">
      {paths.map((p) => {
        const uf = p.id.replace('BR-', '').toLowerCase();
        const w = winners[uf];
        return (
          <path
            key={p.id}
            d={p.d}
            fill={fill(p.id)}
            fillOpacity={hoverId === p.id ? 1 : 0.9}
            stroke={hoverId === p.id ? '#facc15' : '#0a0a0a'}
            strokeWidth={hoverId === p.id ? 2.2 : 1}
            style={{ cursor: 'default', transition: 'fill-opacity .15s' }}
            onMouseEnter={() => onHover(p.id)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{`${p.title} (${uf.toUpperCase()})${USE_ROUND2_GEO && w ? ` · ${w.nome} ${fmtPct(w.pvapNum)}` : ' · sem dados do 2º turno'}`}</title>
          </path>
        );
      })}
    </svg>
  );
}
