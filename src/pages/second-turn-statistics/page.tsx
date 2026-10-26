import { useMemo } from 'react';
import { Link } from 'react-router';

import { fmtPct } from '@/helpers/election.js';
import { ROUND2_LIVE } from '@/lib/second-turn.js';
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
