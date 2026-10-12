import localforage from 'localforage'
import type { Candidate } from './tse.js'

localforage.config({
  name: 'tse-vibecoding',
  storeName: 'tse_history',
})

const KEY = 'tse-history-v1'
const MAX_POINTS = 600

export interface Snapshot {
  t?: number;
  label: string;
  hg?: string | null;
  dg?: string | null;
  hash?: string;
  votes?: Record<string, number>;
  pct?: Record<string, number>;
  share?: Record<string, number>;
  names?: Record<string, string>;
  validos?: number;
  total?: number;
  secoes?: string | number | null;
}

export type HistoryMap = Record<string, Snapshot[]>

export async function loadHistory(): Promise<HistoryMap> {
  try {
    const v = await localforage.getItem<HistoryMap>(KEY)
    return v || {}
  } catch {
    return {}
  }
}

export async function appendSnapshot(raceId: string, snap: Snapshot): Promise<HistoryMap | null> {
  const all = (await loadHistory()) || {}
  const arr = all[raceId] || []
  const last = arr[arr.length - 1]
  // evita duplicar se nada mudou (mesmo hg + mesmos votos) — null = sem push
  if (last && last.hg === snap.hg && last.hash === snap.hash) return null
  arr.push(snap)
  while (arr.length > MAX_POINTS) arr.shift()
  all[raceId] = arr
  await localforage.setItem(KEY, all)
  return all
}

export async function clearHistory(): Promise<HistoryMap> {
  await localforage.removeItem(KEY)
  return {}
}

export function hashVotes(cands: Array<Pick<Candidate, 'numero' | 'vap'>>): string {
  return cands.map((c) => `${c.numero}:${c.vap}`).join('|')
}
