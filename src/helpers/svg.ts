import type { SvgPath } from '@/lib/second-turn.js';

/** Extrai paths por prefixo de id de um SVG em texto. Puro (DOMParser, sem lifecycle). */
export function parseSvgPaths(xmlText: string, prefix: string): SvgPath[] {
  const doc = new DOMParser().parseFromString(xmlText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error(`SVG inválido (prefixo ${prefix})`);
  const nodes = [...doc.querySelectorAll('path')].filter((p) => (p.getAttribute('id') || '').startsWith(prefix));
  return nodes.map((p) => ({
    id: p.getAttribute('id') || '',
    d: p.getAttribute('d') || '',
    title: p.getAttribute('title') || p.getAttribute('id') || '',
  }));
}
