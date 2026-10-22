import { USE_ROUND2_GEO } from '@/lib/second-turn.js';
import { fmtPct, hasRealCount } from '@/helpers/election.js';
import type { SvgPath, UFWinner } from '@/lib/second-turn.js';

interface BrazilMapProps {
  paths: SvgPath[];
  fill: (pathId: string) => string;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  winners: Record<string, UFWinner>;
  /** Nome do vencedor projetado pelo modelo por UF (sem apurado ainda). */
  projected: Record<string, string>;
}

// Camada do mapa do Brasil (preenchimento por UF). Pura: sem fetch, sem estado.
export function BrazilMap({ paths, fill, hoverId, onHover, winners, projected }: BrazilMapProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 612.51611 639.04297" className="st-svg" role="img" aria-label="Mapa do Brasil">
      {paths.map((p) => {
        const uf = p.id.replace('BR-', '').toLowerCase();
        const w = winners[uf];
        const proj = projected[uf];
        const suffix =
          USE_ROUND2_GEO && w && hasRealCount(w)
            ? ` · ${w.nome} ${fmtPct(w.share2 ?? w.pvapNum)}`
            : proj
              ? ` · projeção: ${proj}`
              : ' · sem dados do 2º turno';
        const focused = hoverId === p.id;
        return (
          <path
            key={p.id}
            d={p.d}
            fill={fill(p.id)}
            fillOpacity={focused ? 1 : 0.9}
            stroke={focused ? '#facc15' : '#0a0a0a'}
            strokeWidth={focused ? 2.2 : 1}
            style={{ cursor: 'default', transition: 'fill-opacity .15s' }}
            onMouseEnter={() => onHover(p.id)}
            onMouseLeave={() => onHover(null)}
            tabIndex={0}
            onFocus={() => onHover(p.id)}
            onBlur={() => onHover(null)}
          >
            <title>{`${p.title} (${uf.toUpperCase()})${suffix}`}</title>
          </path>
        );
      })}
    </svg>
  );
}
