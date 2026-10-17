import React from 'react';

export interface MunPathProps {
  id: string;
  d: string;
  fill: string;
  titleText: string;
  highlighted: boolean;
  onHover: (id: string | null) => void;
}

// Contorno + preenchimento dos municípios. `fill="transparent"` (em vez de
// `none`) fazia o interior capturar o hover — com `none`, só a borda de 320un
// reagia e o hover caía no path da micro (sem handler), piscando ou nunca
// disparando. Agora o fill é a cor do vencedor local (ou o cinza sem dados).
// Memoizado: o hover re-renderiza só os dois paths afetados, não os 853.
export const MunPath = React.memo(function MunPath({ id, d, fill, titleText, highlighted, onHover }: MunPathProps): React.JSX.Element {
  return (
    <path
      d={d}
      fill={fill}
      stroke={highlighted ? '#facc15' : '#0a0a0a'}
      strokeWidth={highlighted ? 900 : 320}
      style={{ cursor: 'default' }}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      <title>{titleText}</title>
    </path>
  );
});
