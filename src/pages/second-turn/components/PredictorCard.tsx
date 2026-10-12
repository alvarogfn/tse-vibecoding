import { useMemo, useState } from 'react';
import { Chart as ChartJS, Decimation, Legend, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import type { ChartDataset, ChartOptions, LegendItem, ScriptableLineSegmentContext, TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useElectionPredictor } from '@/lib/election-predictor/index.js';
import type { PredictorSeries } from '@/lib/election-predictor/index.js';
import { fmtPct } from '@/helpers/election.js';

// Fail-Safe contract: snapshots idle/loading/error viram placeholder textual —
// o card nunca quebra os mapas nem suspende; só ready monta o gráfico.
// Registro local dos pedaços do Chart.js usados aqui (sem side-effect global).
ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, Decimation);

const AXIS = '#a1a1aa';
const GRID = '#27272a';
const INK = '#fafafa';
const TOOLTIP_BG = '#09090b';

// x onde o segmento começa (ctx.p0.parsed.x); a partir de `counted` é projeção.
const segStartX = (ctx: ScriptableLineSegmentContext): number => {
  const p0 = ctx.p0 as unknown as { parsed?: { x?: unknown } };
  const x = Number(p0?.parsed?.x ?? 0);
  return Number.isFinite(x) ? x : 0;
};

// Último ponto da projeção (x = 100): o número que o modelo crava no fim.
function finalEstimate(s: PredictorSeries | undefined): number | null {
  if (s == null || s.estimate.length === 0) return null;
  const last = s.estimate[s.estimate.length - 1];
  return last?.y ?? null;
}

// Linha curta p/ o summary + aria-label ("Flávio 51,20% × Lula 48,80% · lidera …").
function nationalsText(series: PredictorSeries[]): string | null {
  const f = series.find((s) => s.kind === 'br-flavio');
  const l = series.find((s) => s.kind === 'br-lula');
  const pf = finalEstimate(f);
  const pl = finalEstimate(l);
  if (pf == null || pl == null) return null;
  const leader =
    pf === pl ? 'empate técnico' : pf > pl ? `lidera ${f?.label ?? 'Flávio'}` : `lidera ${l?.label ?? 'Lula'}`;
  return `${f?.label ?? 'Flávio'} ${fmtPct(pf)} × ${l?.label ?? 'Lula'} ${fmtPct(pl)} · ${leader}`;
}

// Miolo do terceiro card — o <section className="st-card st-full"> vive em page.tsx
// (evita section aninhada). Chama useElectionPredictor() aqui dentro.
export function PredictorCard(): React.JSX.Element {
  const snapshot = useElectionPredictor();
  // UFs escondidas por padrão: 27 linhas finas (na cor do vencedor da UF) viram
  // ruído sobre as 2 nacionais grossas. O toggle opt-in devolve as UFs sem mexer
  // no contrato do módulo (a série não expõe eleitorado, então top-N por
  // eleitorado exigiria mudar o lib — fora de escopo).
  const [showUFs, setShowUFs] = useState<boolean>(false);

  const ufCount = useMemo(() => snapshot.series.filter((s) => s.kind === 'uf').length, [snapshot.series]);

  // UM dataset por série (histórico + projeção concatenados, ordenados por x);
  // trecho sólido = apurado, tracejado = projeção. Nacionais sempre visíveis.
  const datasets = useMemo<ChartDataset<'line', { x: number; y: number | null }[]>[]>(
    () =>
      snapshot.series.map((s) => ({
        label: s.label,
        data: [...s.history, ...s.estimate].sort((a, b) => a.x - b.x).map((p) => ({ x: p.x, y: p.y })),
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: s.width,
        tension: 0.4,
        spanGaps: true,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHitRadius: 8,
        hidden: s.kind === 'uf' ? !showUFs : false,
        segment: {
          // A11y/contraste: o módulo entrega lightColor ≈35% alpha, que some no
          // fundo escuro do card (#101010) — ex. o cinza UF vira ~#3a3a3e.
          // Mantemos a cor sólida (contraste total) e o tracejado sozinho marca
          // a projeção; o contrato do módulo segue intacto (só o Chart ignora
          // lightColor aqui).
          borderColor: (ctx) => (segStartX(ctx) >= s.counted ? s.color : undefined),
          borderDash: (ctx) => (segStartX(ctx) >= s.counted ? [6, 4] : undefined),
          // Só os estados têm linha fina (sólida e tracejada); as nacionais
          // seguem grossas (5) nos dois trechos.
        },
      })),
    [snapshot.series, showUFs],
  );

  // Trunca o eixo y nos dados visíveis: [w-5, z+5] (w = menor %, z = maior %).
  // Sem isso as linhas ficam esmagadas num 0–100 fixo.
  const yBounds = useMemo<{ min: number; max: number }>(() => {
    let w = Infinity;
    let z = -Infinity;
    for (const s of snapshot.series) {
      if (s.kind === 'uf' && !showUFs) continue; // só o que está exibido
      for (const p of s.history) {
        if (typeof p.y === 'number') {
          if (p.y < w) w = p.y;
          if (p.y > z) z = p.y;
        }
      }
      for (const p of s.estimate) {
        if (typeof p.y === 'number') {
          if (p.y < w) w = p.y;
          if (p.y > z) z = p.y;
        }
      }
    }
    if (!Number.isFinite(w) || !Number.isFinite(z)) return { min: 0, max: 100 };
    return { min: Math.max(0, Math.floor(w - 5)), max: Math.min(100, Math.ceil(z + 5)) };
  }, [snapshot.series, showUFs]);

  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      // 29 séries × ~1000 pontos: dizima p/ min-max antes de desenhar (só visual).
      decimation: { enabled: true, algorithm: 'min-max' },
      // Com 29 séries, 'nearest' mostra só o ponto mais próximo; 'index'
      // inundaria o tooltip com 29 linhas por hover.
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      elements: { point: { radius: 0, hoverRadius: 3, hitRadius: 8 } },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 20,
            padding: 12,
            font: { size: 11 },
            color: INK,
            // Ruído off por padrão: a legenda mostra só as 2 nacionais; as UFs
            // entram na legenda quando o usuário opta por vê-las.
            filter: (item: LegendItem): boolean => {
              const s = snapshot.series[item.datasetIndex ?? -1];
              if (s == null) return true;
              return s.kind !== 'uf' || showUFs;
            },
          },
        },
        tooltip: {
          backgroundColor: TOOLTIP_BG,
          borderColor: GRID,
          borderWidth: 1,
          titleColor: INK,
          bodyColor: INK,
          footerColor: AXIS,
          padding: 10,
          titleFont: { size: 11 },
          bodyFont: { size: 11 },
          footerFont: { size: 10 },
          callbacks: {
            title: (items: TooltipItem<'line'>[]): string => {
              const x = items[0]?.parsed.x;
              return typeof x === 'number' ? `Apuração ${fmtPct(x)}` : 'Apuração';
            },
            label: (item: TooltipItem<'line'>): string => {
              const y = item.parsed.y;
              const value = typeof y === 'number' ? fmtPct(y) : 'sem dado';
              return ` ${item.dataset.label ?? ''}: ${value}`;
            },
            footer: (items: TooltipItem<'line'>[]): string => {
              const first = items[0];
              if (first == null) return '';
              const s = snapshot.series[first.datasetIndex];
              if (s == null) return '';
              const x = first.parsed.x;
              return typeof x === 'number' && x >= s.counted ? 'projeção' : 'apurado';
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 100,
          title: { display: true, text: '% apuração', color: AXIS, font: { size: 11 } },
          ticks: { font: { size: 10 }, maxTicksLimit: 6, color: AXIS, callback: (v: string | number) => `${v}%` },
          grid: { color: GRID },
        },
        y: {
          min: yBounds.min,
          max: yBounds.max,
          title: { display: true, text: '% votos', color: AXIS, font: { size: 11 } },
          ticks: { font: { size: 10 }, maxTicksLimit: 6, color: AXIS, callback: (v: string | number) => `${v}%` },
          grid: { color: GRID },
        },
      },
    }),
    [snapshot.series, showUFs, yBounds],
  );

  const ariaLabel = useMemo<string>(() => {
    if (snapshot.status !== 'ready' || snapshot.series.length === 0) {
      return `Previsão do 2º turno: ${snapshot.status}. Gráfico indisponível.`;
    }
    const race = nationalsText(snapshot.series);
    const nat = snapshot.series.find((s) => s.kind === 'br-flavio' || s.kind === 'br-lula');
    const counted = nat != null ? fmtPct(nat.counted) : '—';
    const nationals = snapshot.series.filter((s) => s.kind !== 'uf').length;
    const visible = showUFs ? snapshot.series.length : nationals;
    return (
      `Gráfico de projeção do 2º turno. ` +
      (race != null ? `${race}. ` : '') +
      `Apuração nacional ${counted}. ` +
      `${visible} de ${snapshot.series.length} séries visíveis. ` +
      `Eixo x: percentual de apuração. Eixo y: percentual de votos. ` +
      `Linha sólida: apurado. Linha tracejada: projeção.`
    );
  }, [snapshot, showUFs]);

  if (snapshot.status === 'idle') {
    return (
      <>
        <div className="col-title">Previsão · 2º turno (TF.js)</div>
        <div className="summary" title="Previsão aguardando apuração">
          Aguardando início da apuração do 2º turno
        </div>
        <div className="hint" role="status">
          Aguardando dados do 2º turno…
        </div>
      </>
    );
  }

  if (snapshot.status === 'loading') {
    return (
      <>
        <div className="col-title">Previsão · 2º turno (TF.js)</div>
        <div className="summary" title="Modelo de previsão carregando">
          Modelo de previsão carregando…
        </div>
        <div className="hint" role="status">
          Carregando modelo…
        </div>
      </>
    );
  }

  if (snapshot.status === 'error') {
    return (
      <>
        <div className="col-title">Previsão · 2º turno (TF.js)</div>
        <div className="summary" title="Falha na previsão">
          Não foi possível gerar a previsão
        </div>
        <div className="err" role="alert">
          {snapshot.error || 'Falha ao carregar previsão.'}
        </div>
      </>
    );
  }

  // status === 'ready'
  const at = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleTimeString('pt-BR') : '—';
  const race = nationalsText(snapshot.series);

  return (
    <>
      <div className="col-title">Previsão · 2º turno (TF.js)</div>
      <div className="summary" title="Curvas por UF e Brasil">
        {race ?? 'Projeção por UF e Brasil'} · eixo x = % apuração · eixo y = % de votos
      </div>
      {datasets.length ? (
        <>
          <label className="hint flex items-center gap-2 cursor-pointer select-none" title="Exibe as 27 curvas finas das UFs">
            <input
              type="checkbox"
              checked={showUFs}
              onChange={(e) => setShowUFs(e.target.checked)}
              className="accent-[#facc15] h-4 w-4 cursor-pointer"
            />
            <span>Mostrar UFs ({ufCount})</span>
          </label>
          <div className="relative w-full min-w-0 min-h-[260px] h-[clamp(260px,38vh,420px)]">
            <Line
              data={{ datasets }}
              options={options}
              role="img"
              aria-label={ariaLabel}
              fallbackContent={<p className="hint">{ariaLabel}</p>}
            />
          </div>
        </>
      ) : (
        <div className="hint" role="status">
          Sem séries para projetar.
        </div>
      )}
      <div className="hint">Atualizado às {at} · linha sólida = apurado · tracejada = projeção</div>
    </>
  );
}
