import { useCallback, useEffect, useState } from 'react'
import { UFS, fetchUFCargos } from '@/lib/tse.js'
import type { UFData } from '@/lib/tse.js'
import type { BrazilMeta } from '@/helpers/election.js'

export interface UFsSweepResult {
  data: Record<string, UFData>;
  meta: BrazilMeta;
  loading: boolean;
  refetch: () => Promise<void>;
}

// Varredura dos 27 estados × 3 cargos (81 arquivos) — ciclo lento separado,
// 180s, lotes de 5. Não cabe no useFetch global: são dezenas de URLs com
// decodificação JWS (texto, não JSON) e progresso incremental por lote.
export function useUFsSweep(auto: boolean): UFsSweepResult {
  const [ufs, setUfs] = useState<Record<string, UFData>>({}) // { [uf]: {fed, est, sen} } — 1 coluna por estado
  const [ufsMeta, setUfsMeta] = useState<BrazilMeta>({ loading: true, done: 0, total: UFS.length, at: null })

  const fetchUFs = useCallback(async (): Promise<void> => {
    const out: Record<string, UFData> = {}
    for (let i = 0; i < UFS.length; i += 5) {
      const batch = UFS.slice(i, i + 5)
      const res: Array<[string, UFData]> = await Promise.all(batch.map(async ([uf]): Promise<[string, UFData]> => [uf, await fetchUFCargos(uf)]))
      for (const [uf, r] of res) out[uf] = { ...r, at: new Date().toLocaleTimeString('pt-BR') }
      setUfs((prev) => ({ ...prev, ...out }))
      setUfsMeta({ loading: true, done: Math.min(i + 5, UFS.length), total: UFS.length, at: null })
    }
    setUfsMeta({ loading: false, done: UFS.length, total: UFS.length, at: new Date().toLocaleTimeString('pt-BR') })
  }, [])

  useEffect(() => {
    fetchUFs()
  }, [fetchUFs])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(fetchUFs, 180000)
    return () => clearInterval(id)
  }, [auto, fetchUFs])

  return { data: ufs, meta: ufsMeta, loading: ufsMeta.loading, refetch: fetchUFs }
}
