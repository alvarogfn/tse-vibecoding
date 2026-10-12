import FuzzySearch from 'fuzzy-search'
import type { Candidate, ParsedRace } from '../../../lib/tse.js'
import type { Snapshot } from '../../../lib/history.js'

export type Metric = 'pct' | 'votos'

export interface BrazilMeta {
  loading: boolean;
  done: number;
  total: number;
  at: string | null;
}

export const AXIS = '#a1a1aa'
export const GRID = '#27272a'

export function fmtPct(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

// Busca aproximada (typo-tolerant) sobre a lista; sem query retorna tudo
export function fuzzyFilter(list: Candidate[], query: string, keys: string[]): Candidate[] {
  const q = (query || '').trim()
  if (!q) return list
  try {
    return new FuzzySearch<Candidate>(list, keys, { caseSensitive: false, sort: true }).search(q)
  } catch {
    const lq = q.toLowerCase()
    return list.filter((c) =>
      keys.some((k) => String((c as unknown as Record<string, unknown>)[k] ?? '').toLowerCase().includes(lq)),
    )
  }
}

export function shareFromSnap(snap: Snapshot | null | undefined, numero: string): number | null {
  if (!snap) return null
  if (snap.share && snap.share[numero] != null) return snap.share[numero] as number
  const v = snap.votes?.[numero]
  if (v == null) return null
  const denom = snap.validos || snap.total
  if (denom) return (v / denom) * 100
  if (snap.pct && snap.pct[numero] != null) return snap.pct[numero] as number
  return null
}

// 100% apurado = seções totalizadas (pst) chegou a 100
export function isComplete(parsed: ParsedRace | null | undefined): boolean {
  const s = parsed?.meta?.s
  if (!s) return false
  return parseFloat(String(s.pstn ?? s.pst ?? '0').replace(',', '.')) >= 100
}
