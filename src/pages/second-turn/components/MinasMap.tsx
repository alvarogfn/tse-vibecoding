import { MunPath } from '@/pages/second-turn/components/MunPath';
import { fmtPct, hasRealCount } from '@/helpers/election.js';
import type { Candidate } from '@/lib/tse.js';
import type { SvgPath, UFWinner } from '@/lib/second-turn.js';

interface MinasMapProps {
  munPaths: SvgPath[];
  /** Cor de cada município pelo vencedor local (ou cinza sem dados). */
  munFill: (munIbge: string) => string;
  /** Vencedor por município (chave = IBGE 7 dígitos, sem prefixo). */
  munWinners: Record<string, UFWinner>;
  mgTop2Shown: Candidate[];
  names: Record<string, string>;
  hoverMun: string | null;
  onHover: (id: string | null) => void;
}

// Camada do mapa de Minas Gerais: municípios pintados pelo vencedor local. Pura.
export function MinasMap({
  munPaths,
  munFill,
  munWinners,
  mgTop2Shown,
  names,
  hoverMun,
  onHover,
}: MinasMapProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 258000 200000" className="st-svg" role="img" aria-label="Mapa de Minas Gerais por município">
      {munPaths.map((p) => {
        const ibge = p.id.replace('mun_', '');
        const nome = names[ibge] || `IBGE ${ibge}`;
        const w = munWinners[ibge];
        const real = w && hasRealCount(w);
        const win = real ? mgTop2Shown.find((c) => String(c.numero) === String(w.numero)) : undefined;
        return (
          <MunPath
            key={p.id}
            id={p.id}
            d={p.d}
            fill={munFill(ibge)}
            highlighted={hoverMun === p.id}
            onHover={onHover}
            titleText={`${nome}${real && w ? ` · ${win?.nomeUrna ?? w.nome} ${fmtPct(w.share2 ?? w.pvapNum)}` : ' · sem dados do 2º turno'}`}
          />
        );
      })}
    </svg>
  );
}
