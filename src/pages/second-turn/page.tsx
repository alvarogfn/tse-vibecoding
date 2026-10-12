import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { UFS, fmtInt } from '@/lib/tse.js';
import {
  BRAZIL_SVG_URL,
  MG_SVG_URL,
  MICRO_GRAY,
  ROUND2_LIVE,
  USE_ROUND2_GEO,
  JAIR_BLUE,
  LULA_RED,
} from '@/lib/second-turn.js';
import { finalistColor, fmtPct, hasRealCount } from '@/helpers/election.js';
import { useSvgMap } from '@/hooks/use-svg-map';
import { usePolling } from '@/hooks/use-polling';
import { useSecondTurnTop } from '@/pages/second-turn/hooks/use-second-turn-top';
import { useUfRacesFindAll } from '@/pages/second-turn/hooks/use-uf-races-find-all';
import { useMgGeo } from '@/pages/second-turn/hooks/use-mg-geo';
import { CandLegend } from '@/pages/second-turn/components/CandLegend';
import { BrazilMap } from '@/pages/second-turn/components/BrazilMap';
import { MinasMap } from '@/pages/second-turn/components/MinasMap';
import { MapCard } from '@/pages/second-turn/components/MapCard';
import { PredictorCard } from '@/pages/second-turn/components/PredictorCard';
import { pushPredictorInputs, useElectionPredictor } from '@/lib/election-predictor/index.js';
import type { PredictorInputs, PredictorUfInput } from '@/lib/election-predictor/index.js';

export default function SegundoTurno(): React.JSX.Element {
  const { pres, presMG, presErr, presMGErr, loading, refetch: fetchTop } = useSecondTurnTop();
  const presTop2ForUf = useMemo(() => (pres?.candidatos || []).slice(0, 2).map((c) => String(c.numero)), [pres]);
  const { ufWinners, ufMeta, ufStats, refetch: refetchUFs } = useUfRacesFindAll(presTop2ForUf, ROUND2_LIVE && !!pres);
  // { microId (ex. micro_310519): numero do vencedor na microrregião } — vazio até o TSE publicar o 2º turno
  const [winnersByMicro, setWinnersByMicro] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState<boolean>(true);
  const [hoverUF, setHoverUF] = useState<string | null>(null);
  const [hoverMun, setHoverMun] = useState<string | null>(null);

  void setWinnersByMicro;

  const br = useSvgMap(BRAZIL_SVG_URL, 'BR-');
  const mg = useSvgMap(MG_SVG_URL, 'mun_');
  const mgMicro = useSvgMap(MG_SVG_URL, 'micro_31');
  const mgGeo = useMgGeo();
  const munToMicro = mgGeo.munMicro;

  // Callback estável p/ os MunPaths memoizados não recriarem handlers a cada render
  const handleMunHover = useCallback((id: string | null) => setHoverMun(id), []);

  usePolling(fetchTop, 15000, auto && ROUND2_LIVE);
  // Varredura das UFs em cadência própria (mais lenta): sem isso o mapa do
  // Brasil + preditor congelariam nos primeiros vencedores (H1-página).
  usePolling(refetchUFs, 60000, auto && ROUND2_LIVE);

  const presTop2 = useMemo(() => (pres?.candidatos || []).slice(0, 2), [pres]);
  const mgTop2 = useMemo(() => (presMG?.candidatos || []).slice(0, 2), [presMG]);

  // Sem 2º turno: mostra fotos/nomes (identidade), mas zera apuração, % e votos
  const presTop2Shown = useMemo(
    () => (ROUND2_LIVE ? presTop2 : presTop2.map((c) => ({ ...c, pvapNum: 0, vap: 0, pvap: '0,00' }))),
    [presTop2],
  );
  const mgTop2Shown = useMemo(
    () => (ROUND2_LIVE ? mgTop2 : mgTop2.map((c) => ({ ...c, pvapNum: 0, vap: 0, pvap: '0,00' }))),
    [mgTop2],
  );

  const presColors = useMemo(() => {
    const m: Record<string, string> = {};
    presTop2.forEach((c, i) => {
      m[String(c.numero)] = finalistColor(c, i);
    });
    return m;
  }, [presTop2]);
  const mgColors = useMemo(() => {
    const m: Record<string, string> = {};
    mgTop2.forEach((c, i) => {
      m[String(c.numero)] = finalistColor(c, i);
    });
    return m;
  }, [mgTop2]);

  // Projeção do modelo por UF (final Lula em x=100): pinta o estado com a cor
  // do vencedor projetado até chegar apurado real.
  const { series: predictorSeries } = useElectionPredictor();
  const projected = useMemo(() => {
    const colors: Record<string, string> = {};
    const names: Record<string, string> = {};
    const fullName = (c: { nomeUrna: string; nomeFull: string }): string =>
      `${c.nomeUrna || ''} ${c.nomeFull || ''}`.toUpperCase();
    const lu = presTop2.find((c) => fullName(c).includes('LULA'));
    const fl = presTop2.find((c) => fullName(c).includes('BOLSONARO') || fullName(c).includes('FLAVIO'));
    if (!lu || !fl) return { colors, names };
    for (const s of predictorSeries) {
      if (s.kind !== 'uf') continue;
      const last = s.estimate[s.estimate.length - 1];
      if (last?.y == null) continue;
      const lulaFinal = last.y;
      const win = lulaFinal >= 50 ? lu : fl;
      const uf = s.id.replace('uf-', '');
      colors[uf] = presColors[win.numero] ?? (win === lu ? LULA_RED : JAIR_BLUE);
      // Tooltip/hint exibem "projeção: NOME %" com o % do vencedor projetado.
      names[uf] = `${win.nomeUrna} ${fmtPct(win === lu ? lulaFinal : 100 - lulaFinal)}`;
    }
    return { colors, names };
  }, [predictorSeries, presTop2, presColors]);

  // Fail-Fast contract: inputs do preditor derivam do estado apurado; o push
  // propaga ao store TF.js e erros sobem ao ErrorBoundary (sem try/catch no meio).
  const predictorInputs = useMemo<PredictorInputs>(() => {
    const fullName = (c: { nomeUrna: string; nomeFull: string }): string =>
      `${c.nomeUrna || ''} ${c.nomeFull || ''}`.toUpperCase();
    const lula = presTop2.find((c) => fullName(c).includes('LULA'));
    const flavio = presTop2.find((c) => fullName(c).includes('BOLSONARO') || fullName(c).includes('FLAVIO'));
    void flavio; // outro finalista (2T: 100 − Lula); o contrato só carrega lulaShare.
    const lulaNumero = lula ? String(lula.numero) : null;
    const ufs: PredictorUfInput[] = Object.entries(ufStats).map(([uf, st]) => {
      const lulaShare = lulaNumero ? (st.top.find((t) => String(t.numero) === lulaNumero)?.pvapNum ?? null) : null;
      const winner = ufWinners[uf];
      const input: PredictorUfInput = {
        uf,
        counted: st.pst,
        lulaShare,
        validos: st.validos,
        eleitorado: st.eleitorado,
      };
      const color = winner ? presColors[winner.numero] : undefined;
      if (color) input.color = color;
      return input;
    });
    const nationalCounted = pres ? parseFloat(String(pres.meta?.s?.pst ?? '0').replace(',', '.')) || 0 : 0;
    const nationalShare = lula ? lula.pvapNum : null;
    return { ufs, nationalCounted, nationalShare };
  }, [pres, presTop2, presColors, ufStats, ufWinners]);

  useEffect(() => {
    pushPredictorInputs(predictorInputs);
  }, [predictorInputs]);

  const brFill = useCallback(
    (pathId: string): string => {
      if (!USE_ROUND2_GEO) return MICRO_GRAY;
      const uf = pathId.replace('BR-', '').toLowerCase();
      // 1. vencedor real (com urna apurada); 2. projeção do modelo; 3. cinza.
      const w = ufWinners[uf];
      if (w && hasRealCount(w) && presColors[w.numero]) return presColors[w.numero] as string;
      if (projected.colors[uf]) return projected.colors[uf] as string;
      return MICRO_GRAY;
    },
    [ufWinners, presColors, projected],
  );

  // Cor de cada microrregião pelo vencedor local (azul/vermelho); cinza claro sem dados do 2º turno
  const microFill = useCallback(
    (microId: string): string => {
      const num = winnersByMicro[microId];
      if (num && mgColors[num]) return mgColors[num];
      return MICRO_GRAY;
    },
    [winnersByMicro, mgColors],
  );

  const countedUFs = Object.keys(ufWinners).length;
  // UFs pintadas pela projeção (sem apurado real): informa no hint.
  const projCount = Object.keys(projected.names).filter(
    (uf) => !(ufWinners[uf] && hasRealCount(ufWinners[uf])),
  ).length;

  return (
    <div className="page page-scroll">
      <div className="topbar">
        <h1>2º turno 2026</h1>
        <div className="sub">Presidente · Brasil à esquerda · Minas Gerais à direita</div>
        <div className="spacer" />
        <Link className="btn-ghost-sm" to="/1-turno" style={{ textDecoration: 'none' }}>
          1º turno
        </Link>
        <span className="badge">{!ROUND2_LIVE ? 'aguardando 2T' : loading ? 'lendo…' : auto ? 'auto 15s' : 'pausado'}</span>
        <button className="btn-ghost-sm" onClick={() => setAuto(!auto)}>
          {auto ? 'Pausar' : 'Retomar'}
        </button>
        <button
          className="btn-sm"
          onClick={() => {
            fetchTop();
          }}
          disabled={loading}
        >
          {loading ? '…' : 'Atualizar'}
        </button>
      </div>

      <div className="wrap">
        <div className="st-grid">
          {/* ESQUERDA — BRASIL */}
          <MapCard
            title="Brasil — Presidente · 2º turno"
            summaryTitle={
              pres && ROUND2_LIVE ? `Seções ${pres.meta?.s?.st}/${pres.meta?.s?.ts} · ${pres.meta?.hg}` : 'Aguardando início do 2º turno'
            }
            summary={
              pres ? (
                ROUND2_LIVE ? (
                  <>
                    <b>{pres.meta?.s?.pst || '-'}% urnas</b> · {fmtInt(pres.meta?.validos)} válidos · {pres.meta?.hg || ''} · {countedUFs}/{UFS.length}{' '}
                    UFs
                  </>
                ) : (
                  <>
                    <b>0% urnas</b> · 0 válidos
                  </>
                )
              ) : presErr ? (
                `falha: ${presErr}`
              ) : (
                'carregando…'
              )
            }
            hint={
              hoverUF
                ? (() => {
                    const uf = hoverUF.replace('BR-', '').toLowerCase();
                    const w = ufWinners[uf];
                    if (USE_ROUND2_GEO && w && hasRealCount(w)) {
                      return `${uf.toUpperCase()} · ${w.nome} (${w.partido}) ${fmtPct(w.pvapNum)}`;
                    }
                    const proj = projected.names[uf];
                    return proj
                      ? `${uf.toUpperCase()} · projeção: ${proj}`
                      : `${uf.toUpperCase()} · sem dados do 2º turno`;
                  })()
                : `Flávio Bolsonaro (azul) · Lula (vermelho) · sem dados (cinza) · ${projCount} UFs em projeção · ${ufMeta.done}/${ufMeta.total} UFs${ufMeta.at ? ` · ${ufMeta.at}` : ''}`
            }
          >
            <CandLegend cands={presTop2Shown} colors={presColors} />
            <div className="st-map">
              {br.loading && <div className="hint">Carregando mapa do Brasil…</div>}
              {br.error && <div className="err">{br.error}</div>}
              {!br.loading && !br.error && (
                <BrazilMap
                  paths={br.paths}
                  fill={brFill}
                  hoverId={hoverUF}
                  onHover={setHoverUF}
                  winners={ufWinners}
                  projected={projected.names}
                />
              )}
            </div>
          </MapCard>

          {/* DIREITA — MINAS GERAIS (apuração presidencial no estado) */}
          <MapCard
            title="Minas Gerais — Presidente · 2º turno"
            summaryTitle={
              presMG && ROUND2_LIVE ? `Seções ${presMG.meta?.s?.st}/${presMG.meta?.s?.ts} · ${presMG.meta?.hg}` : 'Aguardando início do 2º turno'
            }
            summary={
              presMG ? (
                ROUND2_LIVE ? (
                  <>
                    <b>{presMG.meta?.s?.pst || '-'}% urnas</b> · {fmtInt(presMG.meta?.validos)} válidos · {presMG.meta?.hg || ''}
                  </>
                ) : (
                  <>
                    <b>0% urnas</b> · 0 válidos
                  </>
                )
              ) : presMGErr ? (
                `falha: ${presMGErr}`
              ) : (
                'carregando…'
              )
            }
            hint={(() => {
              if (!hoverMun) return `${mgMicro.paths.length || '…'} microrregiões · Flávio Bolsonaro (azul) · Lula (vermelho) · sem dados (cinza)`;
              const ibge = hoverMun.replace('mun_', '');
              const nome = mgGeo.names[ibge] || `IBGE ${ibge}`;
              const microId = munToMicro[ibge];
              const microNome = (microId && mgGeo.microNames[microId]) || '';
              return `${nome}${microNome ? ` · Micro ${microNome}` : ''}`;
            })()}
          >
            <CandLegend cands={mgTop2Shown} colors={mgColors} />
            <div className="st-map">
              {(mg.loading || mgMicro.loading) && <div className="hint">Carregando mapa de Minas…</div>}
              {(mg.error || mgMicro.error) && <div className="err">{mg.error || mgMicro.error}</div>}
              {!mg.loading && !mg.error && !mgMicro.loading && !mgMicro.error && (
                <MinasMap
                  microPaths={mgMicro.paths}
                  munPaths={mg.paths}
                  microFill={microFill}
                  winnersByMicro={winnersByMicro}
                  mgTop2Shown={mgTop2Shown}
                  microNames={mgGeo.microNames}
                  names={mgGeo.names}
                  munToMicro={munToMicro}
                  hoverMun={hoverMun}
                  onHover={handleMunHover}
                />
              )}
            </div>
          </MapCard>
        </div>
        <section className="st-card st-full">
          <PredictorCard />
        </section>
        <div className="footer">2º turno · presidente por UF (27 arquivos TSE) · presidente em MG por microrregião (cinza = aguardando endpoint do 2º turno)</div>
      </div>
    </div>
  );
}
