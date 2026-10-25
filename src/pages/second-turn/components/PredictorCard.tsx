import { useMemo, useState } from 'react';
import { Chart as ChartJS, Decimation, Legend, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import type { ChartDataset, ChartOptions, LegendItem, ScriptableLineSegmentContext, TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useElectionPredictor, retrainPredictorFromScratch } from '@/lib/election-predictor/index.js';
import type { PredictorSeries } from '@/lib/election-predictor/index.js';
import { fmtPct } from '@/helpers/election.js';
import { REGIONS, ufRegionOf } from '@/helpers/regions.js';

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

// Cabeçalho do card + botão de retreino (usado nos 4 estados do snapshot).
interface PredictorTitleProps {
  busy: boolean;
  zoom: boolean;
  onToggleZoom: () => void;
}

function PredictorTitle({ busy, zoom, onToggleZoom }: PredictorTitleProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div className="col-title flex-1">Previsão · 2º turno (TF.js)</div>
      <label
        className="flex items-center gap-1 text-[11px] text-zinc-400 cursor-pointer select-none whitespace-nowrap"
        title="Zoom no trecho já apurado; desligado mostra 0–100%"
      >
        <input
          type="checkbox"
          aria-label="Zoom na apuração"
          checked={zoom}
          onChange={onToggleZoom}
          className="accent-[#facc15] h-3.5 w-3.5 cursor-pointer"
        />
        Zoom
      </label>
      <button
        type="button"
        className="btn-ghost-sm"
        disabled={busy}
        aria-label="Retreinar modelo do zero"
        title="Apaga o modelo salvo e retreina do zero (só 2T já apurado)"
        onClick={() => {
          if (confirm('Apagar o modelo salvo e retreinar do zero?')) retrainPredictorFromScratch();
        }}
      >
        Retreinar
      </button>
    </div>
  );
}

// Miolo do terceiro card — o <section className="st-card st-full"> vive em page.tsx
// (evita section aninhada). Chama useElectionPredictor() aqui dentro.
export function PredictorCard(): React.JSX.Element {
  const snapshot = useElectionPredictor();
  const busy = snapshot.status === 'loading';
  // Zoom no trecho já apurado. Default ligado: com 0,25% apurado, o eixo
  // 0–100 esmagaria a linha factual contra a borda esquerda.
  const [zoom, setZoom] = useState(true);
  // Regiões visíveis (default: só as 2 nacionais). Um checkbox por região
  // em vez de um geral — 27 finas de uma vez poluem o gráfico.
  const [regions, setRegions] = useState<ReadonlySet<string>>(new Set());
  const toggleRegion = (sigla: string): void => {
    setRegions((prev) => {
      const next = new Set(prev);
      if (next.has(sigla)) next.delete(sigla);
      else next.add(sigla);
      return next;
    });
  };
  const isShown = (s: PredictorSeries): boolean => {
    if (s.kind !== 'uf') return true;
    const r = ufRegionOf(s.id.replace('uf-', ''));
    return r != null && regions.has(r);
  };

  const regionCounts = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const s of snapshot.series) {
      if (s.kind !== 'uf') continue;
      const r = ufRegionOf(s.id.replace('uf-', ''));
      if (r) m[r] = (m[r] ?? 0) + 1;
    }
    return m;
  }, [snapshot.series]);

  // Nomes dos finalistas p/ o tooltip (extraídos das séries nacionais;
  // fallback garante tooltip legível mesmo sem elas).
  const candNames = useMemo<{ flavio: string; lula: string }>(() => {
    const pick = (kind: 'br-flavio' | 'br-lula', fallback: string): string => {
      const label = snapshot.series.find((s) => s.kind === kind)?.label ?? '';
      const after = label.split('·')[1]?.trim();
      return after && after.length > 0 ? after : fallback;
    };
    return { flavio: pick('br-flavio', 'Flávio'), lula: pick('br-lula', 'Lula') };
  }, [snapshot.series]);

  // UM dataset por série (histórico + projeção concatenados, ordenados por x);
  // trecho sólido = apurado, tracejado = projeção. Nacionais sempre visíveis.
  const datasets = useMemo<ChartDataset<'line', { x: number; y: number | null }[]>[]>(
    () =>
      snapshot.series.map((s) => {
        // Separa o trecho factual do projetado com um gap explícito no ponto
        // atual. Sem isso, o primeiro ponto do rollout bottom-up (que preenche
        // as UFs ainda sem voto com o prior) liga no share nacional parcial do
        // TSE e desenha uma queda diagonal enganosa.
        const data =
          s.history.length > 0
            ? [
                ...s.history,
                { x: s.counted, y: null },
                ...s.estimate.filter((point) => point.x > s.counted + 1e-9),
              ]
            : s.estimate;
        return {
          label: s.label,
          data: data.sort((a, b) => a.x - b.x).map((p) => ({ x: p.x, y: p.y })),
          borderColor: s.color,
          backgroundColor: s.color,
          borderWidth: s.width,
          tension: 0.4,
          spanGaps: false,
          // Mostra um ponto em cada snapshot factual (inclusive quando há só
          // um). A projeção continua sem pontos para não poluir.
          pointRadius: (ctx) => {
            const point = data[ctx.dataIndex];
            return point != null && point.y != null && point.x <= s.counted + 1e-9
              ? 2.2
              : 0;
          },
          pointHoverRadius: 3,
          pointHitRadius: 8,
          hidden: s.kind === 'uf' ? !isShown(s) : false,
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
        };
      }),
    [snapshot.series, regions],
  );

  // Trunca o eixo y nos dados visíveis: [w-5, z+5] (w = menor %, z = maior %).
  // Sem isso as linhas ficam esmagadas num 0–100 fixo.
  const yBounds = useMemo<{ min: number; max: number }>(() => {
    let w = Infinity;
    let z = -Infinity;
    for (const s of snapshot.series) {
      if (s.kind === 'uf' && !isShown(s)) continue; // só o que está exibido
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
  }, [snapshot.series, regions]);

  // Apuração nacional corrente: o zoom acompanha o avanço e mantém o trecho
  // apurado em ~1/3 da largura; acima de ~33% o gráfico já abre em 0–100.
  const currentCounted = useMemo(() => {
    const nat = snapshot.series.find((s) => s.kind === 'br-lula' || s.kind === 'br-flavio');
    return nat?.counted ?? 0;
  }, [snapshot.series]);
  const xMax = zoom && currentCounted > 0 ? Math.min(100, Math.max(0.5, currentCounted * 3)) : 100;

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
              return isShown(s);
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
          // O ponto null que separa factual de projeção não deve aparecer
          // como “sem dado” no tooltip.
          filter: (item: TooltipItem<'line'>) => typeof item.parsed.y === 'number',
          callbacks: {
            title: (items: TooltipItem<'line'>[]): string => {
              const x = items[0]?.parsed.x;
              return typeof x === 'number' ? `Apuração ${fmtPct(x)}` : 'Apuração';
            },
            label: (item: TooltipItem<'line'>): string => {
              const y = item.parsed.y;
              if (typeof y !== 'number') return ` ${item.dataset.label ?? ''}: sem dado`;
              // Cada série nacional guarda o share do PRÓPRIO candidato:
              // Flávio = 100 − Lula. Mostre o valor da série, sem trocar o
              // nome pelo vencedor (isso fazia a linha do Flávio aparecer como
              // "Lula 57,66%").
              const s = snapshot.series[item.datasetIndex ?? -1];
              if (s?.kind === 'br-flavio' || s?.kind === 'br-lula') {
                return ` ${s.label}: ${fmtPct(y)}`;
              }
              return ` ${s?.label ?? ''} · ${candNames.lula} ${fmtPct(y)} · ${candNames.flavio} ${fmtPct(100 - y)}`;
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
          max: xMax,
          title: {
            display: true,
            text: xMax < 100 ? `% apuração · zoom 0–${fmtPct(xMax)}` : '% apuração',
            color: AXIS,
            font: { size: 11 },
          },
          ticks: {
            font: { size: 10 },
            maxTicksLimit: 6,
            color: AXIS,
            callback: (v: string | number) => fmtPct(Number(v)),
          },
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
    [snapshot.series, regions, yBounds, candNames, xMax],
  );

  const ariaLabel = useMemo<string>(() => {
    if (snapshot.series.length === 0) {
      return snapshot.status === 'loading'
        ? 'Gráfico de projeção do 2º turno carregando.'
        : 'Gráfico de projeção do 2º turno ainda sem dados. Aguardando início da apuração.';
    }
    const race = nationalsText(snapshot.series);
    const nat = snapshot.series.find((s) => s.kind === 'br-flavio' || s.kind === 'br-lula');
    const counted = nat != null ? fmtPct(nat.counted) : '—';
    const visible = snapshot.series.filter(isShown).length;
    return (
      `Gráfico de projeção do 2º turno. ` +
      (race != null ? `${race}. ` : '') +
      `Apuração nacional ${counted}. ` +
      `${visible} de ${snapshot.series.length} séries visíveis. ` +
      `Eixo x: percentual de apuração. Eixo y: percentual de votos. ` +
      `Linha sólida: apurado. Linha tracejada: projeção.` +
      (xMax < 100 ? ` Zoom na apuração: eixo x de 0 a ${fmtPct(xMax)}.` : '')
    );
  }, [snapshot, regions, xMax]);

  const titleNode = (
    <PredictorTitle
      busy={busy}
      zoom={zoom}
      onToggleZoom={() => setZoom((value) => !value)}
    />
  );

  // Gráfico sempre montado (mesmo sem dados): eixos 0–100 visíveis desde o
  // início; ao chegar a primeira urna os datasets entram sem remontar o card.
  const chartNode = (
    <div className="relative w-full min-w-0 min-h-[260px] h-[clamp(320px,62vh,720px)] max-[900px]:h-[clamp(260px,38vh,420px)]">
      <Line
        data={{ datasets }}
        options={options}
        role="img"
        aria-label={ariaLabel}
        fallbackContent={<p className="hint">{ariaLabel}</p>}
      />
    </div>
  );

  if (snapshot.status === 'idle') {
    return (
      <>
        {titleNode}
        <div className="summary" title="Previsão aguardando apuração" role="status">
          Aguardando início da apuração do 2º turno
        </div>
        {chartNode}
      </>
    );
  }

  // Só some com o gráfico se não há série anterior; no recálculo o chart
  // segue montado (memos seguram as refs) e só o texto indica a fase.
  if (snapshot.status === 'loading' && snapshot.series.length === 0) {
    return (
      <>
        {titleNode}
        <div className="summary" title="Modelo de previsão carregando" role="status">
          Modelo de previsão carregando…
        </div>
        {chartNode}
      </>
    );
  }

  if (snapshot.status === 'error' && snapshot.series.length === 0) {
    return (
      <>
        {titleNode}
        <div className="summary" title="Falha na previsão">
          Não foi possível gerar a previsão
        </div>
        <div className="err" role="alert">
          {snapshot.error || 'Falha ao carregar previsão.'}
        </div>
      </>
    );
  }

  // status === 'ready' (ou 'loading' com séries: recalculando sem desmontar)
  const at = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleTimeString('pt-BR') : '—';
  const race = nationalsText(snapshot.series);
  const recalculating = snapshot.status === 'loading';

  return (
    <>
      {titleNode}
      {snapshot.status === 'error' && (
        <div className="err" role="alert">
          {snapshot.error || 'Falha ao carregar previsão.'} — exibindo última projeção válida.
        </div>
      )}
      <div className="summary" title="Curvas por UF e Brasil">
        {recalculating
          ? `Recalculando projeção${snapshot.phase ? ` · ${snapshot.phase}` : '…'}`
          : `${race ?? 'Projeção por UF e Brasil'} · eixo x = % apuração · eixo y = % de votos`}
      </div>
      {datasets.length ? (
        <>
          <div className="hint flex flex-wrap items-center gap-x-4 gap-y-1 cursor-default select-none">
            {REGIONS.map((r) => (
              <label key={r.sigla} className="flex items-center gap-2 cursor-pointer" title={`Exibe as curvas finas do ${r.label}`}>
                <input
                  type="checkbox"
                  checked={regions.has(r.sigla)}
                  onChange={() => toggleRegion(r.sigla)}
                  className="accent-[#facc15] h-4 w-4 cursor-pointer"
                />
                <span>
                  {r.label} ({regionCounts[r.sigla] ?? 0})
                </span>
              </label>
            ))}
          </div>
          {chartNode}
        </>
      ) : (
        <div className="hint" role="status">
          Sem séries para projetar.
        </div>
      )}
      <div className="hint">
        Atualizado às {at} · linha sólida = apurado · tracejada = projeção
        {currentCounted > 0 && currentCounted < 100
          ? ' · gap no ponto atual = TSE parcial × projeção bottom-up'
          : ''}
        {snapshot.note ? ` · base ${snapshot.note}` : ''}
        {recalculating && snapshot.phase ? ` · ${snapshot.phase}` : ''}
      </div>
    </>
  );
}
