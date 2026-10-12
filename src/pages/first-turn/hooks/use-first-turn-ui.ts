import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Metric } from '../../../helpers/election.js'

export interface FirstTurnUIResult {
  open: Record<string, boolean>;
  toggleOpen: (key: string) => void;
  search: Record<string, string>;
  setSearch: Dispatch<SetStateAction<Record<string, string>>>;
  pinned: Record<string, string[]>;
  togglePin: (raceId: string, key: string) => void;
  metric: Metric;
  setMetric: Dispatch<SetStateAction<Metric>>;
}

// Estado puramente de UI do 1º turno: nada aqui busca rede.
export function useFirstTurnUI(): FirstTurnUIResult {
  const [open, setOpen] = useState<Record<string, boolean>>({}) // { [candKey]: true } — vários QE abertos
  const toggleOpen = useCallback((key: string) => setOpen((p) => ({ ...p, [key]: !p[key] })), [])
  const [search, setSearch] = useState<Record<string, string>>({}) // { [raceId]: query } — busca por nome na coluna
  const [metric, setMetric] = useState<Metric>('pct')
  const [pinned, setPinned] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem('tse-pinned-v1') || '{}') as Record<string, string[]>
    } catch {
      return {} as Record<string, string[]>
    }
  }) // { [raceId]: [candKey] } — só fixados vão ao gráfico + header
  useEffect(() => {
    try {
      localStorage.setItem('tse-pinned-v1', JSON.stringify(pinned))
    } catch { /* sem persistência */ }
  }, [pinned])
  const togglePin = useCallback((raceId: string, key: string) => {
    setPinned((p) => {
      const arr = (p[raceId] || []).filter((k) => k !== key)
      if (!(p[raceId] || []).includes(key)) arr.push(key)
      return { ...p, [raceId]: arr }
    })
  }, [])

  return { open, toggleOpen, search, setSearch, pinned, togglePin, metric, setMetric }
}
