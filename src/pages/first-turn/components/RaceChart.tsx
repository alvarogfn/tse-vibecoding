import type { ChartDataset, ChartOptions, TooltipItem } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { colorFor, fmtInt } from '../../../lib/tse.js'
import type { Candidate } from '../../../lib/tse.js'
import type { Snapshot } from '../../../lib/history.js'
import { fmtPct, shareFromSnap } from '../../../helpers/election.js'
import type { Metric } from '../../../helpers/election.js'

export const AXIS = '#a1a1aa'
export const GRID = '#27272a'

export interface RaceChartProps {
  visible: Candidate[];
  history: Snapshot[];
  metric: Metric;
}

export function RaceChart({ visible, history, metric }: RaceChartProps) {
  const pts = history || []
  const labels = pts.map((s) => s.label)
  const datasets: ChartDataset<'line'>[] = visible.map((c, i) => ({
    label: `${c.numero} ${c.nomeUrna}`,
    data: pts.map((s) =>
      metric === 'pct' ? shareFromSnap(s, c.numero) : (s.votes?.[c.numero] ?? null),
    ),
    borderColor: colorFor(c.numero, i),
    backgroundColor: colorFor(c.numero, i),
    tension: 0.25,
    pointRadius: 0,
    borderWidth: 1.5,
    spanGaps: true,
  }))
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 }, color: '#fafafa' } },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'line'>) =>
            metric === 'pct'
              ? ` ${ctx.dataset.label}: ${fmtPct(ctx.parsed.y)}`
              : ` ${ctx.dataset.label}: ${fmtInt(ctx.parsed.y)} votos`,
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 8 }, maxTicksLimit: 4, color: AXIS }, grid: { color: GRID } },
      y: {
        ticks: {
          font: { size: 8 },
          maxTicksLimit: 5,
          color: AXIS,
          callback: (v: string | number) => (metric === 'pct' ? `${Number(v).toFixed(1)}%` : fmtInt(v)),
        },
        grid: { color: GRID },
      },
    },
  }
  if (!pts.length) return <div className="hint">Sem histórico ainda.</div>
  return <Line data={{ labels, datasets }} options={options} />
}
