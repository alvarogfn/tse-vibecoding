import FuzzySearch from 'fuzzy-search';
import { LULA_RED, JAIR_BLUE } from '@/lib/second-turn.js';
import { partyColor, sharePct } from '@/lib/tse.js';
import type { Candidate, ParsedRace } from '@/lib/tse.js';
import type { UFWinner } from '@/lib/second-turn.js';
import type { HistoryMap, Snapshot } from '@/lib/history.js';

// Contratos compartilhados (tipos puros, sem lifecycle).
export type Metric = 'pct' | 'votos';

export interface BrazilMeta {
  loading: boolean;
  done: number;
  total: number;
  at: string | null;
}

export function fmtPct(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

/**
 * Percentual pt-BR ("12,34" ou 12.5) → number. Ao contrário de parseBrInt,
 * NÃO remove pontos de milhar: percentual 0–100 nunca tem milhar, e
 * "12.5" (ponto decimal) viraria 125 (L1).
 */
export function parseBrPct(s: string | number | null | undefined): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  return parseFloat(String(s ?? '').replace(',', '.')) || 0;
}

/** Cor fixa da disputa presidencial: Flávio Bolsonaro = azul, Lula = vermelho. Puro. */
export function finalistColor(c: Candidate, i: number): string {
  // Identidade estável primeiro (número da urna); nome como fallback (M2).
  const num = String(c.numero ?? '');
  if (num === '13') return LULA_RED;
  if (num === '22') return JAIR_BLUE;
  const name = `${c.nomeUrna || ''} ${c.nomeFull || ''}`.toUpperCase();
  if (name.includes('LULA')) return LULA_RED;
  if (name.includes('JAIR') || name.includes('BOLSONARO')) return JAIR_BLUE;
  return partyColor(c.partidoNum, i);
}

// Busca aproximada (typo-tolerant) sobre a lista; sem query retorna tudo. Puro.
export function fuzzyFilter(list: Candidate[], query: string, keys: string[]): Candidate[] {
  const q = (query || '').trim();
  if (!q) return list;
  try {
    return new FuzzySearch<Candidate>(list, keys, { caseSensitive: false, sort: true }).search(q);
  } catch {
    const lq = q.toLowerCase();
    return list.filter((c) =>
      keys.some((k) => String((c as unknown as Record<string, unknown>)[k] ?? '').toLowerCase().includes(lq)),
    );
  }
}

export function shareFromSnap(snap: Snapshot | null | undefined, numero: string): number | null {
  if (!snap) return null;
  if (snap.share && snap.share[numero] != null) return snap.share[numero] as number;
  const v = snap.votes?.[numero];
  if (v == null) return null;
  const denom = snap.validos || snap.total;
  if (denom) return (v / denom) * 100;
  if (snap.pct && snap.pct[numero] != null) return snap.pct[numero] as number;
  return null;
}

// 100% apurado = seções totalizadas (pst) chegou a 100. Puro.
export function isComplete(parsed: ParsedRace | null | undefined): boolean {  const s = parsed?.meta?.s;
  if (!s) return false;
  return parseFloat(String(s.pstn ?? s.pst ?? '0').replace(',', '.')) >= 100;
}

/**
 * O vencedor da UF é "real" (apurado) só com urna contada ou voto registrado.
 * Sem isso, vap zerado elegeria o 1º finalista da lista — o mapa inteiro
 * ficava azul com 0% apurado. Puro.
 */
export function hasRealCount(w: UFWinner | null | undefined): boolean {
  if (!w) return false;
  return parseBrPct(w.pst) > 0 || (w.vap ?? 0) > 0;
}

/**
 * Histórico efetivo de uma disputa: série do IndexedDB ou fallback de um ponto
 * com os dados atuais. Puro — o hook embrulha em useCallback com (data, history).
 */
export function buildEffectiveHistory(
  data: Record<string, ParsedRace>,
  history: HistoryMap,
  raceId: string,
): Snapshot[] {
  const parsed = data[raceId];
  const cands = parsed?.candidatos || [];
  const hist = history[raceId] || [];
  if (hist.length > 0) return hist;
  if (!cands.length || !parsed) return [];
  return [
    {
      label: parsed.meta?.ht || parsed.meta?.hg || 'agora',
      votes: Object.fromEntries(cands.map((c) => [c.numero, c.vap])),
      share: Object.fromEntries(cands.map((c) => [c.numero, sharePct(c.vap, parsed.meta.validos)])),
      pct: Object.fromEntries(cands.map((c) => [c.numero, c.pvapNum])),
      validos: parsed.meta.validos,
      total: parsed.meta.totalVotos,
    },
  ];
}
