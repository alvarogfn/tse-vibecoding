import { fmtInt } from '@/lib/tse.js'
import type { ParsedMeta } from '@/lib/tse.js'

export interface SummaryProps {
  meta: ParsedMeta | null | undefined;
}

export function Summary({ meta }: SummaryProps) {
  const s = meta?.s || {}
  const txt = `${s.pst || '-'}% urnas · ${fmtInt(meta?.validos)} válidos · ${fmtInt(meta?.v?.tv)} votos`
  const full = `Seções ${fmtInt(s.st)}/${fmtInt(s.ts)} · Eleitorado ${fmtInt(meta?.e?.te)} · Comparec. ${fmtInt(meta?.e?.c)} · Brancos ${fmtInt(meta?.v?.vb)} · Nulos ${fmtInt((meta?.v?.vn ?? (meta?.v as Record<string, unknown>)?.['tvn']) as string | number | null | undefined)}`
  return <div className="summary" title={full}>{txt}</div>
}
