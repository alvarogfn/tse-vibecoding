import React from 'react';

export interface MunPathProps {
  id: string;
  d: string;
  titleText: string;
  highlighted: boolean;
  onHover: (id: string | null) => void;
}

// Contorno dos municípios. `fill="transparent"` (em vez de `none`) faz o interior
// do município capturar o hover — com `none`, só a borda de 320un reagia e o hover
// caía no path da micro (sem handler), piscando ou nunca disparando.
// Memoizado: o hover re-renderiza só os dois paths afetados, não os 853.
export const MunPath = React.memo(function MunPath({ id, d, titleText, highlighted, onHover }: MunPathProps): React.JSX.Element {
  return (
    <path
      d={d}
      fill="transparent"
      stroke={highlighted ? '#facc15' : '#52525b'}
      strokeWidth={highlighted ? 900 : 320}
      style={{ cursor: 'default' }}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      <title>{titleText}</title>
    </path>
  );
});
