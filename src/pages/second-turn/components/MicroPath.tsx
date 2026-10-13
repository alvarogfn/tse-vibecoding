import React from 'react';

export interface MicroPathProps {
  d: string;
  fill: string;
  titleText: string;
}

// Camada das microrregiões (preenchimento). Memoizado: não re-renderiza no hover.
export const MicroPath = React.memo(function MicroPath({ d, fill, titleText }: MicroPathProps): React.JSX.Element {
  return (
    <path d={d} fill={fill} fillOpacity={0.92} stroke="#0a0a0a" strokeWidth={900} style={{ transition: 'fill .3s' }}>
      <title>{titleText}</title>
    </path>
  );
});
