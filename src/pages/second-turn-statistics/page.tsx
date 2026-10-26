import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { fmtPct } from '@/helpers/election.js';
import { BASE, ROUND2_LIVE } from '@/lib/second-turn.js';
import { UFS, fmtInt, parseBrInt } from '@/lib/tse.js';
import { useSecondTurnTop } from '@/pages/second-turn/hooks/use-second-turn-top.js';
import { useUfRacesFindAll } from '@/pages/second-turn/hooks/use-uf-races-find-all.js';

const BU_DATASET =
  'https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna';
const RDV_DATASET =
  'https://dadosabertos.tse.jus.br/dataset/resultados-2026-arquivos-transmitidos-para-totalizacao';

interface SummaryCardProps {
  label: string;
  value: string;
  detail?: string;
}

function SummaryCard({ label, value, detail }: SummaryCardProps): React.JSX.Element {
  return (
    <div className="bg-card border border-line rounded-lg px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.5px] text-muted">{label}</div>
      <div className="text-[20px] font-extrabold text-accent leading-tight">{value}</div>
      {detail ? <div className="text-[10px] text-muted">{detail}</div> : null}
    </div>
  );
}

function pct(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}

function fmtSigned(value: number): string {
  const abs = Math.abs(value);
  const text = abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}`;
}

interface FirstTurnCandidate {
  numero: string;
  nome: string;
  partido: string;
  votos: number;
  pvap: number;
}

interface FirstTurnSnapshot {
  validos: number;
  brancos: number;
  nulos: number;
  comparecimento: number;
  abstencoes: number;
  aptos: number;
  lula: number;
  flavio: number;
  others: FirstTurnCandidate[];
  othersTotal: number;
}

interface FirstTurnBrRaw {
  br?: {
    validos?: string | number;
    eleitorado?: string | number;
    top?: Array<{
      numero?: string | number;
      nomeUrna?: string;
      partido?: string;
      votos?: string | number;
      pvap?: string | number;
    }>;
  };
}

interface SummaryTableRaw {
  columns: string[];
  data: Record<string, Array<string | number | null>>;
}

function lastValue(
  table: SummaryTableRaw,
  column: string,
): number {
  const values = table.data[column];
  const last = values?.[values.length - 1];
  return parseBrInt(last ?? 0);
}

export default function SecondTurnStatistics(): React.JSX.Element {
  const { pres, presErr, loading: topLoading, refetch: refetchTop } = useSecondTurnTop();
  const topNumeros = useMemo(
    () => (pres?.candidatos || []).slice(0, 2).map((candidate) => String(candidate.numero)),
    [pres],
  );
  const {
    ufStats,
    ufWinners,
    ufMeta,
    loading: ufLoading,
    error: ufErr,
    refetch: refetchUFs,
  } = useUfRacesFindAll(topNumeros, ROUND2_LIVE && !!pres);

  const loading = topLoading || ufLoading;
  const error = presErr ?? ufErr ?? null;

  const [firstTurn, setFirstTurn] = useState<FirstTurnSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch(`${BASE}temp-data/first-turn-2026.json`).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<FirstTurnBrRaw>;
      }),
      fetch(`${BASE}1-turn-data/resumo-geral.json`).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SummaryTableRaw>;
      }),
    ])
      .then(([rawFirst, summary]) => {
        if (!alive) return;
        const first = rawFirst.br;
        const top = first?.top ?? [];
        const lula = top.find((candidate) => String(candidate.numero) === '13');
        const flavio = top.find((candidate) => String(candidate.numero) === '22');
        const lulaVotos = parseBrInt(lula?.votos);
        const flavioVotos = parseBrInt(flavio?.votos);
        const validos = parseBrInt(first?.validos);
        const others = top
          .filter((candidate) => {
            const numero = String(candidate.numero ?? '');
            return numero !== '13' && numero !== '22';
          })
          .map((candidate) => ({
            numero: String(candidate.numero ?? ''),
            nome: candidate.nomeUrna ?? String(candidate.numero ?? ''),
            partido: candidate.partido ?? '',
            votos: parseBrInt(candidate.votos),
            pvap: Number(candidate.pvap ?? 0),
          }))
          .sort((a, b) => b.votos - a.votos);
        const comparecimento = lastValue(summary, 'qt_comparecimento');
        const aptos = lastValue(summary, 'qt_aptos');
        setFirstTurn({
          validos,
          brancos: lastValue(summary, 'qt_votos_brancos'),
          nulos: lastValue(summary, 'qt_votos_nulos'),
          comparecimento,
          abstencoes: lastValue(summary, 'qt_abstencoes') || Math.max(0, aptos - comparecimento),
          aptos,
          lula: lulaVotos,
          flavio: flavioVotos,
          others,
          othersTotal: Math.max(0, validos - lulaVotos - flavioVotos),
        });
      })
      .catch(() => {
        if (alive) setFirstTurn(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const national = useMemo(() => {
    const meta = pres?.meta;
    const validos = meta?.validos ?? 0;
    const brancos = parseBrInt(meta?.v?.vb);
    const nulos = parseBrInt(meta?.v?.vn);
    const total = validos + brancos + nulos;
    const eleitorado = parseBrInt(meta?.e?.te);
    const comparecimento = parseBrInt(meta?.e?.c);
    const lula = (pres?.candidatos || []).find((candidate) => String(candidate.numero) === '13');
    const flavio = (pres?.candidatos || []).find((candidate) => String(candidate.numero) === '22');
    return {
      validos,
      brancos,
      nulos,
      total,
      eleitorado,
      comparecimento,
      abstencoes: Math.max(0, eleitorado - comparecimento),
      secoes: parseBrInt(meta?.s?.st),
      secoesTotal: parseBrInt(meta?.s?.ts),
      pst: meta?.s?.pst ?? null,
      hg: meta?.hg ?? null,
      lulaVotos: lula?.vap ?? 0,
      flavioVotos: flavio?.vap ?? 0,
      lulaPct: lula?.pvapNum ?? null,
      flavioPct: flavio?.pvapNum ?? null,
    };
  }, [pres]);

  const rows = useMemo(() => {
    return UFS.map(([uf, nome]) => {
      const stat = ufStats[uf];
      const winner = ufWinners[uf];
      const lula = stat?.top.find((candidate) => candidate.numero === '13');
      const flavio = stat?.top.find((candidate) => candidate.numero === '22');
      const total = stat?.totalVotos ?? 0;
      return {
        uf,
        nome,
        stat,
        winner,
        lulaPct: lula?.pvapNum ?? null,
        flavioPct: flavio?.pvapNum ?? null,
        nullPct: stat ? pct(stat.nulos, total) : null,
        blankPct: stat ? pct(stat.brancos, total) : null,
      };
    });
  }, [ufStats, ufWinners]);

  const transfer = useMemo(() => {
    if (!firstTurn) return null;
    const deltaLula = national.lulaVotos - firstTurn.lula;
    const deltaFlavio = national.flavioVotos - firstTurn.flavio;
    const abstentionReduction = firstTurn.abstencoes - national.abstencoes;
    const comparecimentoIncrease =
      national.comparecimento - firstTurn.comparecimento;
    // O TSE reporta abstenções e comparecimento com pequenos ajustes de
    // eleitorado/arredondamento; o delta de comparecimento é o que fecha a
    // identidade contábil. A diferença vai explícita na tabela.
    const abstentionAdjustment = comparecimentoIncrease - abstentionReduction;
    const otherSources =
      comparecimentoIncrease +
      (firstTurn.nulos - national.nulos) +
      (firstTurn.brancos - national.brancos);
    const availableOther = Math.max(0, otherSources);
    const maxLula = Math.min(firstTurn.othersTotal, Math.max(0, deltaLula));
    const minLula = Math.min(maxLula, Math.max(0, deltaLula - availableOther));
    const gainSum = Math.max(0, deltaLula) + Math.max(0, deltaFlavio);
    const scenarioLula =
      gainSum > 0 ? (firstTurn.othersTotal * Math.max(0, deltaLula)) / gainSum : 0;
    const scenarioFlavio = Math.max(0, firstTurn.othersTotal - scenarioLula);
    const scenarioLulaShare =
      firstTurn.othersTotal > 0 ? scenarioLula / firstTurn.othersTotal : 0;
    const scenarioFlavioShare =
      firstTurn.othersTotal > 0 ? scenarioFlavio / firstTurn.othersTotal : 0;
    const listedOthers = firstTurn.others.reduce((sum, candidate) => sum + candidate.votos, 0);
    const extraOthers = Math.max(0, firstTurn.othersTotal - listedOthers);
    // Soma os valores ARREDONDADOS linha a linha para o card e a tabela
    // fecharem no mesmo total (sem diferença de 1-2 votos).
    const scenarioLulaRows =
      firstTurn.others.reduce(
        (sum, candidate) => sum + Math.round(candidate.votos * scenarioLulaShare),
        0,
      ) + Math.round(extraOthers * scenarioLulaShare);
    const scenarioFlavioRows = firstTurn.othersTotal - scenarioLulaRows;
    return {
      deltaLula,
      deltaFlavio,
      otherSources,
      abstentionReduction,
      comparecimentoIncrease,
      abstentionAdjustment,
      availableOther,
      minLula,
      maxLula,
      scenarioLula,
      scenarioFlavio,
      scenarioLulaShare,
      scenarioFlavioShare,
      scenarioLulaRows,
      scenarioFlavioRows,
      extraOthers,
      remainingLula: deltaLula - scenarioLulaRows,
      remainingFlavio: deltaFlavio - scenarioFlavioRows,
      totalAvailable: firstTurn.othersTotal + availableOther,
      absorbed: deltaLula + deltaFlavio,
      residual: firstTurn.othersTotal + availableOther - (deltaLula + deltaFlavio),
    };
  }, [firstTurn, national]);

  const exportCsv = (): void => {
    const header = [
      'UF',
      'Nome',
      'Secoes',
      'Secoes_total',
      'Validos',
      'Brancos',
      'Nulos',
      'Total',
      'Pct_nulos',
      'Pct_brancos',
      'Lula_pct',
      'Flavio_pct',
      'Vencedor',
    ];
    const lines = rows.map((row) => {
      const s = row.stat;
      return [
        row.uf.toUpperCase(),
        row.nome,
        s?.secoes ?? '',
        s?.secoesTotal ?? '',
        s?.validos ?? '',
        s?.brancos ?? '',
        s?.nulos ?? '',
        s?.totalVotos ?? '',
        row.nullPct == null ? '' : row.nullPct.toFixed(4),
        row.blankPct == null ? '' : row.blankPct.toFixed(4),
        row.lulaPct == null ? '' : row.lulaPct.toFixed(4),
        row.flavioPct == null ? '' : row.flavioPct.toFixed(4),
        row.winner?.nome ?? '',
      ].join(',');
    });
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '2-turno-estatisticas-uf.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page page-scroll">
      <div className="topbar">
        <h1>Estatísticas · 2º turno</h1>
        <div className="sub">Boletins de urna, brancos, nulos e comparecimento</div>
        <div className="spacer" />
        <Link className="btn-ghost-sm" to="/2-turno" style={{ textDecoration: 'none' }}>
          2º turno
        </Link>
        <Link className="btn-ghost-sm" to="/1-turno" style={{ textDecoration: 'none' }}>
          1º turno
        </Link>
        <span className="badge">{loading ? 'lendo…' : 'TSE'}</span>
        <button
          className="btn-sm"
          disabled={loading}
          onClick={() => {
            void refetchTop();
            void refetchUFs();
          }}
        >
          {loading ? '…' : 'Atualizar'}
        </button>
      </div>

      <div className="w-full max-w-[1280px] mx-auto p-3 flex flex-col gap-3">
        {error ? <div className="err">{error}</div> : null}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <SummaryCard
            label="Seções totalizadas"
            value={`${fmtInt(national.secoes)}/${fmtInt(national.secoesTotal)}`}
            detail={national.pst ? `${national.pst}% · ${national.hg ?? '—'}` : 'aguardando'}
          />
          <SummaryCard label="Votos válidos" value={fmtInt(national.validos)} detail="nominais" />
          <SummaryCard label="Brancos" value={fmtInt(national.brancos)} detail={fmtPct(pct(national.brancos, national.total))} />
          <SummaryCard label="Nulos" value={fmtInt(national.nulos)} detail={fmtPct(pct(national.nulos, national.total))} />
          <SummaryCard label="Comparecimento" value={fmtInt(national.comparecimento)} detail={fmtPct(pct(national.comparecimento, national.eleitorado))} />
          <SummaryCard label="Abstenções" value={fmtInt(national.abstencoes)} detail={fmtPct(pct(national.abstencoes, national.eleitorado))} />
          <SummaryCard
            label="Lula"
            value={fmtInt(national.lulaVotos)}
            detail={national.lulaPct == null ? '—' : fmtPct(national.lulaPct)}
          />
          <SummaryCard
            label="Flávio"
            value={fmtInt(national.flavioVotos)}
            detail={national.flavioPct == null ? '—' : fmtPct(national.flavioPct)}
          />
        </section>

        <section className="bg-card border border-line rounded-lg p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-accent text-xs font-extrabold uppercase tracking-[0.5px]">
              Transferência 1T → 2T
            </h2>
            <span className="hint">
              2T em {national.pst ?? '—'}% · contabilidade agregada, não voto individual
            </span>
          </div>
          {firstTurn && transfer ? (
            <>
              <p className="text-[11px] leading-[1.55] text-[#e7e5e4] mt-2">
                Os outros candidatos do 1T somaram <b className="text-white">{fmtInt(firstTurn.othersTotal)}</b>{' '}
                votos. No 2T, Lula ganhou <b className="text-white">{fmtSigned(transfer.deltaLula)}</b> e
                Flávio <b className="text-white">{fmtSigned(transfer.deltaFlavio)}</b> em relação ao 1T.
                A diferença também inclui a <b className="text-white">redução de abstenções</b>,
                comparecimento, nulos e brancos — não é possível saber individualmente quem migrou.
              </p>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
                <div className="min-w-0">
                  <h3 className="text-[10px] uppercase tracking-[0.5px] text-muted mb-1">
                    Votos de Renan/Caiado/Zema/Cury/resto → Lula × Flávio
                  </h3>
                  <p className="text-[10px] text-muted mb-2">
                    Cenário uniforme do bloco: {fmtPct(transfer.scenarioLulaShare * 100)} para
                    Lula e {fmtPct(transfer.scenarioFlavioShare * 100)} para Flávio. Não é
                    transferência individual.
                  </p>
                  <div className="overflow-auto max-h-[320px] border border-line rounded-md">
                    <table className="w-full border-collapse text-[11px]">
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-muted text-[10px] uppercase">
                          <th className="text-left p-2 border-b border-line whitespace-nowrap">Candidato 1T</th>
                          <th className="text-right p-2 border-b border-line text-[#fca5a5] whitespace-nowrap">→ Lula</th>
                          <th className="text-right p-2 border-b border-line text-[#93c5fd] whitespace-nowrap">→ Flávio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {firstTurn.others.map((candidate) => {
                          const toLula = Math.round(candidate.votos * transfer.scenarioLulaShare);
                          const toFlavio = candidate.votos - toLula;
                          return (
                            <tr key={candidate.numero} className="border-b border-line/60 last:border-0">
                              <td className="p-2">
                                <div className="font-extrabold text-white leading-tight">
                                  {candidate.nome}
                                </div>
                                <div className="text-muted text-[10px] leading-tight">
                                  {candidate.partido} · {candidate.numero} · 1T: {fmtInt(candidate.votos)}
                                </div>
                              </td>
                              <td className="p-2 text-right text-[#fca5a5] font-extrabold align-top">
                                {fmtInt(toLula)}
                              </td>
                              <td className="p-2 text-right text-[#93c5fd] font-extrabold align-top">
                                {fmtInt(toFlavio)}
                              </td>
                            </tr>
                          );
                        })}
                        {transfer.extraOthers > 0 ? (
                          <tr className="border-b border-line/60 last:border-0">
                            <td className="p-2">
                              <div className="font-extrabold text-white leading-tight">
                                Resto (não listados)
                              </div>
                              <div className="text-muted text-[10px] leading-tight">
                                outros nomes/legendas · 1T: {fmtInt(transfer.extraOthers)}
                              </div>
                            </td>
                            <td className="p-2 text-right text-[#fca5a5] font-extrabold align-top">
                              {fmtInt(Math.round(transfer.extraOthers * transfer.scenarioLulaShare))}
                            </td>
                            <td className="p-2 text-right text-[#93c5fd] font-extrabold align-top">
                              {fmtInt(transfer.extraOthers - Math.round(transfer.extraOthers * transfer.scenarioLulaShare))}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="min-w-0">
                  <h3 className="text-[10px] uppercase tracking-[0.5px] text-muted mb-1">
                    Balanço de votos
                  </h3>
                  <div className="overflow-hidden border border-line rounded-md">
                    <table className="w-full border-collapse text-[11px]">
                      <tbody>
                        {[
                          ['Outros candidatos 1T', firstTurn.othersTotal],
                          ['Redução de abstenções', transfer.abstentionReduction],
                          [
                            'Ajuste TSE (abstenção → comparecimento)',
                            transfer.abstentionAdjustment,
                          ],
                          ['Aumento de comparecimento', transfer.comparecimentoIncrease],
                          ['Redução de nulos', firstTurn.nulos - national.nulos],
                          ['Redução de brancos', firstTurn.brancos - national.brancos],
                          ['Total disponível', transfer.totalAvailable],
                          ['Ganho Lula', transfer.deltaLula],
                          ['Ganho Flávio', transfer.deltaFlavio],
                          ['Total absorvido', transfer.absorbed],
                          ['Resíduo', transfer.residual],
                        ].map(([label, value]) => (
                          <tr key={String(label)} className="border-b border-line/60 last:border-0">
                            <td className="p-2 text-[#e7e5e4]">{label}</td>
                            <td className="p-2 text-right font-extrabold text-white whitespace-nowrap">
                              {fmtSigned(Number(value))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                <div className="bg-black/30 border border-line rounded-md p-2">
                  <div className="text-[10px] uppercase tracking-[0.5px] text-muted">
                    Lula · outros candidatos
                  </div>
                  <div className="text-[17px] font-extrabold text-accent">
                    {fmtInt(transfer.minLula)}–{fmtInt(transfer.maxLula)}
                  </div>
                  <div className="hint">
                    faixa possível; o limite inferior assume que toda a redução de
                    abstenção/comparecimento, nulos e brancos foi para Lula
                  </div>
                </div>
                <div className="bg-black/30 border border-line rounded-md p-2">
                  <div className="text-[10px] uppercase tracking-[0.5px] text-muted">
                    Cenário proporcional ao ganho
                  </div>
                  <div className="text-[17px] font-extrabold text-accent">
                    {fmtInt(Math.round(transfer.scenarioLula))} para Lula
                  </div>
                  <div className="hint">
                    {fmtInt(Math.round(transfer.scenarioFlavio))} para Flávio · não é dado individual
                  </div>
                </div>
                <div className="bg-black/30 border border-line rounded-md p-2">
                  <div className="text-[10px] uppercase tracking-[0.5px] text-muted">
                    Resto do ganho de Lula
                  </div>
                  <div className="text-[17px] font-extrabold text-accent">
                    {fmtSigned(Math.round(transfer.remainingLula))}
                  </div>
                  <div className="hint">
                    redução de abstenção/comparecimento + nulos/brancos − parte dos outros
                  </div>
                </div>
              </div>

              <h3 className="text-[10px] uppercase tracking-[0.5px] text-muted mt-4 mb-1">
                Abstenções, nulos e brancos · 1T × 2T
              </h3>
              <div className="overflow-auto border border-line rounded-md">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="text-muted text-[10px] uppercase">
                      <th className="text-left p-2 border-b border-line">Indicador</th>
                      <th className="text-right p-2 border-b border-line">1T</th>
                      <th className="text-right p-2 border-b border-line">2T</th>
                      <th className="text-right p-2 border-b border-line">Δ</th>
                      <th className="text-right p-2 border-b border-line">% 1T</th>
                      <th className="text-right p-2 border-b border-line">% 2T</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Abstenções', firstTurn.abstencoes, national.abstencoes, firstTurn.aptos, national.eleitorado],
                      ['Nulos', firstTurn.nulos, national.nulos, firstTurn.validos + firstTurn.brancos + firstTurn.nulos, national.total],
                      ['Brancos', firstTurn.brancos, national.brancos, firstTurn.validos + firstTurn.brancos + firstTurn.nulos, national.total],
                      ['Comparecimento', firstTurn.comparecimento, national.comparecimento, firstTurn.aptos, national.eleitorado],
                      ['Válidos', firstTurn.validos, national.validos, firstTurn.validos + firstTurn.brancos + firstTurn.nulos, national.total],
                    ].map(([label, first, second, firstTotal, secondTotal]) => {
                      const firstNumber = Number(first);
                      const secondNumber = Number(second);
                      const firstBase = Number(firstTotal);
                      const secondBase = Number(secondTotal);
                      return (
                        <tr key={String(label)} className="border-b border-line/60 last:border-0">
                          <td className="p-2 text-[#e7e5e4]">{label}</td>
                          <td className="p-2 text-right">{fmtInt(firstNumber)}</td>
                          <td className="p-2 text-right">{fmtInt(secondNumber)}</td>
                          <td className="p-2 text-right font-extrabold text-white">
                            {fmtSigned(secondNumber - firstNumber)}
                          </td>
                          <td className="p-2 text-right">{fmtPct(pct(firstNumber, firstBase))}</td>
                          <td className="p-2 text-right">{fmtPct(pct(secondNumber, secondBase))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="hint mt-2">
                A faixa de Lula é uma identidade contábil: o ganho dele menos o que veio da
                redução de abstenção/comparecimento, nulos e brancos. Não identifica eleitor
                individual nem intenção de voto.
              </div>
            </>
          ) : (
            <div className="hint mt-2">Carregando os totais do 1º turno…</div>
          )}
        </section>

        <section className="bg-card border border-line rounded-lg p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-accent text-xs font-extrabold uppercase tracking-[0.5px]">
              Por UF · totalização agregada
            </h2>
            <button className="btn-ghost-sm" onClick={exportCsv}>
              Baixar CSV
            </button>
          </div>
          <div className="hint mt-1">
            {ufMeta.done}/{ufMeta.total} arquivos de UF · linha “—”; a UF ainda não trouxe
            votos. Os dados ao vivo são agregados por UF; o detalhe por seção está nos
            arquivos BU abaixo.
          </div>
          <div className="overflow-auto max-h-[62vh] mt-2 border border-line rounded-md">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-muted text-[10px] uppercase">
                  <th className="text-left p-2 border-b border-line">UF</th>
                  <th className="text-right p-2 border-b border-line">Seções</th>
                  <th className="text-right p-2 border-b border-line">Válidos</th>
                  <th className="text-right p-2 border-b border-line">Brancos</th>
                  <th className="text-right p-2 border-b border-line">Nulos</th>
                  <th className="text-right p-2 border-b border-line">% nulos</th>
                  <th className="text-right p-2 border-b border-line">Lula</th>
                  <th className="text-right p-2 border-b border-line">Flávio</th>
                  <th className="text-left p-2 border-b border-line">Vencedor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const s = row.stat;
                  return (
                    <tr key={row.uf} className="border-b border-line/60 last:border-0">
                      <td className="p-2 font-extrabold text-white whitespace-nowrap">
                        {row.uf.toUpperCase()}
                        <span className="text-muted font-normal"> · {row.nome}</span>
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {s ? `${fmtInt(s.secoes)}/${fmtInt(s.secoesTotal)}` : '—'}
                      </td>
                      <td className="p-2 text-right">{s ? fmtInt(s.validos) : '—'}</td>
                      <td className="p-2 text-right">{s ? fmtInt(s.brancos) : '—'}</td>
                      <td className="p-2 text-right">{s ? fmtInt(s.nulos) : '—'}</td>
                      <td className="p-2 text-right">{row.nullPct == null ? '—' : fmtPct(row.nullPct)}</td>
                      <td className="p-2 text-right">{row.lulaPct == null ? '—' : fmtPct(row.lulaPct)}</td>
                      <td className="p-2 text-right">{row.flavioPct == null ? '—' : fmtPct(row.flavioPct)}</td>
                      <td className="p-2 whitespace-nowrap">
                        {row.winner ? `${row.winner.nome} (${row.winner.partido})` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-card border border-line rounded-lg p-3">
            <h2 className="text-accent text-xs font-extrabold uppercase tracking-[0.5px]">
              Nulos por número digitado
            </h2>
            <p className="text-[11px] leading-[1.55] text-[#e7e5e4] mt-2">
              O <b className="text-white">Boletim de Urna (BU)</b> registra apenas o total de
              votos nulos. O número apertado — 14, 17, 39, 00 etc. — fica no{' '}
              <b className="text-white">Registro Digital do Voto (RDV)</b>.
            </p>
            <p className="text-[11px] leading-[1.55] text-[#e7e5e4] mt-2">
              O TSE já publicou BU/RDV do <b className="text-white">1º turno</b>. Para o{' '}
              <b className="text-white">2º turno</b>, os arquivos ainda não apareceram no
              Portal de Dados Abertos. Esta página não inventa os números: quando os ZIPs
              forem publicados, o agregado por número entra aqui.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <a className="btn-ghost-sm" href={BU_DATASET} target="_blank" rel="noreferrer">
                Dataset BU
              </a>
              <a className="btn-ghost-sm" href={RDV_DATASET} target="_blank" rel="noreferrer">
                Dataset RDV
              </a>
            </div>
          </div>

          <div className="bg-card border border-line rounded-lg p-3">
            <h2 className="text-accent text-xs font-extrabold uppercase tracking-[0.5px]">
              Todos os boletins de urna
            </h2>
            <p className="text-[11px] leading-[1.55] text-[#e7e5e4] mt-2">
              A página ao vivo usa a totalização <b className="text-white">agregada por UF</b>.
              Os <b className="text-white">499.248 boletins/seções</b> ficam nos ZIPs de BU por
              UF, com votos por candidato, brancos, nulos, comparecimento e abstenções.
            </p>
            <p className="text-[11px] leading-[1.55] text-[#e7e5e4] mt-2">
              Para o 2º turno, o TSE ainda não publicou esses ZIPs. O painel acima usa os
              arquivos agregados que já estão no ar; a tabela por seção será adicionada
              quando os BUs do 2T forem disponibilizados.
            </p>
            <div className="hint mt-3">
              Cobertura atual: {ufMeta.done}/{ufMeta.total} UFs lidas
              {ufMeta.at ? ` · ${ufMeta.at}` : ''}.
            </div>
          </div>
        </section>

        <div className="hint">
          Fonte: TSE — resultados ao vivo (agregado por UF) e Portal de Dados Abertos
          (BU/RDV). Brancos e nulos são calculados sobre válidos + brancos + nulos.
        </div>
      </div>
    </div>
  );
}
