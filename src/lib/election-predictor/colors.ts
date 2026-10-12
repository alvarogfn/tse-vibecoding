/**
 * election-predictor/colors — visual identity owned by the predictor module.
 *
 * The chart layer must not invent colors: nationals are thick brand lines,
 * UFs are thin neutral lines. `lightColor` is the same hue at ~35% alpha,
 * used by the chart for the dashed "estimate" segment.
 */

export const BR_FLAVIO_COLOR = '#2563eb';
export const BR_LULA_COLOR = '#dc2626';
export const UF_DEFAULT_COLOR = '#a1a1aa';

/** Pastel bem claro p/ as linhas das UFs (atrás das nacionais grossas). */
export const UF_PASTEL_BLUE = '#bfdbfe';
export const UF_PASTEL_RED = '#fecaca';
export const UF_PASTEL_NEUTRAL = '#e4e4e7';

export const BR_WIDTH = 5;
export const UF_WIDTH = 1;

/**
 * Mapeia a cor forte do vencedor local p/ o pastel correspondente.
 * Entrada desconhecida → neutro bem claro (nunca quebra o store).
 */
export function pastelOf(color: string): string {
  const h = color.trim().toLowerCase();
  if (h === BR_FLAVIO_COLOR) return UF_PASTEL_BLUE;
  if (h === BR_LULA_COLOR) return UF_PASTEL_RED;
  if (h === UF_DEFAULT_COLOR) return UF_PASTEL_NEUTRAL;
  return UF_PASTEL_NEUTRAL;
}

/** Alpha applied to the estimate (dashed) segment — ~35%. */
const LIGHT_ALPHA = 0.35;

/**
 * Convert `#rgb` / `#rrggbb` to `rgba(r, g, b, alpha)`.
 * Fail-Safe: unparseable input falls back to a neutral zinc rgba
 * instead of throwing, so one bad color string never breaks the store.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : LIGHT_ALPHA;
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(161, 161, 170, ${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Light (estimate-segment) variant of a series color. */
export function lightOf(color: string): string {
  return hexToRgba(color, LIGHT_ALPHA);
}
