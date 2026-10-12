import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { RACES, fetchRaceJson, parseRace, sharePct } from '../../../lib/tse.js'
import type { Candidate, ParsedRace } from '../../../lib/tse.js'
import { loadHistory, appendSnapshot, clearHistory, hashVotes } from '../../../lib/history.js'
import type { Snapshot, HistoryMap } from '../../../lib/history.js'
import { isComplete } from '../components/utils.js'

const REFRESH_MS = 5000

export interface RacesPollingResult {
  data: Record<string, ParsedRace>;
  errors: Record<string, string>;
  history: HistoryMap;
  loading: boolean;
  refetch: () => Promise<void>;
  auto: boolean;
  setAuto: Dispatch<SetStateAction<boolean>>;
  refreshMs: number;
  setRefreshMs: Dispatch<SetStateAction<number>>;
  countdown: number;
  setCountdown: Dispatch<SetStateAction<number>>;
  finished: boolean;
  setFinished: Dispatch<SetStateAction<boolean>>;
  totalHistoryPoints: number;
  effHistFor: (raceId: string) => Snapshot[];
  clearHistoryData: () => Promise<void>;
}

// Polling das disputas (RACES) + snapshots de histórico + auto/refresh/countdown/finished.
// Mesma forma de { data, error, loading, refetch }: aqui `errors` é por disputa
// porque o painel renderiza o erro dentro de cada coluna.
export function useRacesPolling(pinned: Record<string, string[]>): RacesPollingResult {
  const [data, setData] = useState<Record<string, ParsedRace>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<HistoryMap>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [auto, setAuto] = useState<boolean>(true)
  const [countdown, setCountdown] = useState<number>(REFRESH_MS / 1000)
  const [refreshMs, setRefreshMs] = useState<number>(REFRESH_MS)
  const [finished, setFinished] = useState<boolean>(false) // apuração 100% → para de bater na API
  const pinnedRef = useRef<Record<string, string[]>>({})
  useEffect(() => {
    pinnedRef.current = pinned
  }, [pinned])
  const fetchingRef = useRef<boolean>(false)

  useEffect(() => {
    loadHistory().then((h) => setHistory(h || {}))
  }, [])

  const fetchAll = useCallback(async (): Promise<void> => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    const nextData: Record<string, ParsedRace> = {}
    const nextErr: Record<string, string> = {}
    for (const race of RACES) {
      try {
        const raw = await fetchRaceJson(race.url)
        const parsed = parseRace(race, raw)
        nextData[race.id] = parsed
        // geral: histórico do top 15 + fixados (gráfico: fixados ou top 10)
        if (race.tipo !== 'senado') {
          const byKey = new Map<string, Candidate>(parsed.candidatos.map((c) => [c.key, c]))
          const wanted = new Map<string, Candidate>()
          for (const c of parsed.candidatos.slice(0, 15)) wanted.set(c.key, c)
          for (const k of pinnedRef.current[race.id] || []) {
            const c = byKey.get(k)
            if (c) wanted.set(k, c)
          }
          const snapCands = [...wanted.values()]
          const votes: Record<string, number> = {}
          const pctTse: Record<string, number> = {}
          const share: Record<string, number> = {}
          const names: Record<string, string> = {}
          for (const c of snapCands) {
            votes[c.numero] = c.vap
            pctTse[c.numero] = c.pvapNum
            share[c.numero] = sharePct(c.vap, parsed.meta.validos || parsed.meta.totalVotos)
            names[c.numero] = c.nomeUrna
          }
          const label = `${parsed.meta.ht || parsed.meta.hg || new Date().toLocaleTimeString('pt-BR')}`
          const snap: Snapshot = {
            t: Date.now(),
            label,
            hg: parsed.meta.hg,
            dg: parsed.meta.dg,
            hash: hashVotes(snapCands),
            votes,
            pct: pctTse,
            share,
            names,
            validos: parsed.meta.validos,
            total: parsed.meta.totalVotos,
            secoes: parsed.meta?.s?.st,
          }
          const updated = await appendSnapshot(race.id, snap)
          if (updated) setHistory(updated)
        }
      } catch (err) {
        nextErr[race.id] = String((err as Error)?.message || err)
      }
    }
    setData((prev) => ({ ...prev, ...nextData }))
    setErrors(nextErr)
    setLoading(false)
    setCountdown(refreshMs / 1000)
    // tudo 100% apurado → para os ciclos automáticos
    if (RACES.length && RACES.every((r) => nextData[r.id] && isComplete(nextData[r.id]))) {
      setFinished(true)
      setAuto(false)
    }
    fetchingRef.current = false
  }, [refreshMs])

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => {
      setCountdown((c) => (c <= 1 ? refreshMs / 1000 : c - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [auto, refreshMs])

  // fetch em timer próprio (updater acima é puro — só display)
  useEffect(() => {
    if (!auto) return
    const id = setInterval(fetchAll, refreshMs)
    return () => clearInterval(id)
  }, [auto, refreshMs, fetchAll])

  const totalHistoryPoints = useMemo(
    () => Object.values(history).reduce((a, arr) => a + (arr?.length || 0), 0),
    [history]
  )

  const effHistFor = useCallback((raceId: string): Snapshot[] => {
    const parsed = data[raceId]
    const cands = parsed?.candidatos || []
    const hist = history[raceId] || []
    if (hist.length > 0) return hist
    if (!cands.length) return []
    return [
      {
        label: parsed?.meta?.ht || parsed?.meta?.hg || 'agora',
        votes: Object.fromEntries(cands.map((c) => [c.numero, c.vap])),
        share: Object.fromEntries(cands.map((c) => [c.numero, sharePct(c.vap, parsed.meta.validos)])),
        pct: Object.fromEntries(cands.map((c) => [c.numero, c.pvapNum])),
        validos: parsed.meta.validos,
        total: parsed.meta.totalVotos,
      },
    ]
  }, [data, history])

  const clearHistoryData = useCallback(async (): Promise<void> => {
    setHistory(await clearHistory())
  }, [])

  return {
    data, errors, history, loading, refetch: fetchAll,
    auto, setAuto, refreshMs, setRefreshMs, countdown, setCountdown,
    finished, setFinished, totalHistoryPoints, effHistFor, clearHistoryData,
  }
}
