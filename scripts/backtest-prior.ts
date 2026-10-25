/**
 * Auditoria + replay do prior estrutural 1T → 2T.
 *
 * Roda com o Node nativo (type stripping), sem build:
 *   node scripts/backtest-prior.ts
 *
 * O replay é in-sample: usa o desvio da própria curva 1T como "live" de cada
 * UF. Ele valida a mecânica (bias, blend, bottom-up), NÃO a acurácia do 2T.
 * Snapshots reais do 2T podem usar `countedByUf` (cada UF tem seu próprio
 * percentual apurado) e `liveByUf`. Com `finalByUf` real, o mesmo harness
 * produz o backtest out-of-sample.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStructuralPrior } from '../src/lib/election-predictor/structural-prior.ts';
import {
  aggregateStatePolls,
  parseStatePollsCsv,
  parseStructuralPriorInput,
} from '../src/lib/election-predictor/prior-data.ts';
import { runStructuralBacktest } from '../src/lib/election-predictor/backtest.ts';
import type {
  FirstTurnCurvePoint,
  FirstTurnFinal,
} from '../src/lib/election-predictor/structural-prior.ts';
import type {
  FirstTurnFinalRaw,
  TableRaw,
} from '../src/lib/election-predictor/prior-data.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function close(actual: number, expected: number, label: string): void {
  if (
    !Number.isFinite(actual) ||
    !Number.isFinite(expected) ||
    Math.abs(actual - expected) > 1e-6
  ) {
    throw new Error(`${label}: esperado ${expected}, obtido ${actual}`);
  }
}

function requireMinimum(label: string, actual: number, expected: number): void {
  if (!Number.isFinite(actual) || actual < expected) {
    throw new Error(`${label}: esperado >= ${expected}, obtido ${actual}`);
  }
}

function curveAt(points: readonly FirstTurnCurvePoint[], counted: number): number | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.counted - b.counted);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  const x = Math.min(100, Math.max(0, counted));
  if (x <= first.counted) return first.lulaDuel;
  if (x >= last.counted) return last.lulaDuel;
  for (let index = 1; index < sorted.length; index += 1) {
    const right = sorted[index];
    if (!right || x > right.counted) continue;
    const left = sorted[index - 1];
    if (!left) return right.lulaDuel;
    const span = right.counted - left.counted;
    if (!(span > 0)) return right.lulaDuel;
    const t = (x - left.counted) / span;
    return left.lulaDuel + (right.lulaDuel - left.lulaDuel) * t;
  }
  return last.lulaDuel;
}

function nationalDuelOf(final: FirstTurnFinal): number | null {
  const total = final.lula + final.flavio;
  if (!(total > 0)) return null;
  return (100 * final.lula) / total;
}

const firstTurnFinalRaw = readJson<FirstTurnFinalRaw>(
  resolve(root, 'public/temp-data/first-turn-2026.json'),
);
const votacaoBrasil = readJson<TableRaw>(
  resolve(root, 'public/1-turn-data/votacao-brasil.json'),
);
const resumoGeral = readJson<TableRaw>(
  resolve(root, 'public/1-turn-data/resumo-geral.json'),
);
const nationalPollsCsv = readFileSync(
  resolve(root, 'public/pesquisas-nacional.csv'),
  'utf8',
);
const statePollsCsv = readFileSync(
  resolve(root, 'public/pesquisas-estado.csv'),
  'utf8',
);

const input = parseStructuralPriorInput({
  firstTurnFinal: firstTurnFinalRaw,
  votacaoBrasil,
  resumoGeral,
  nationalPollsCsv,
  statePollsCsv,
});
const prior = buildStructuralPrior(input);
const priorBase = buildStructuralPrior({
  ...input,
  pollsByUf: undefined,
  statePollWeight: 0,
});
const statePolls = statePollsCsv ? parseStatePollsCsv(statePollsCsv) : [];
const stateAggregates = aggregateStatePolls(statePolls);
const statePollByUf = new Map(stateAggregates.map((poll) => [poll.uf, poll]));
const usedStatePolls = stateAggregates.reduce((sum, poll) => sum + poll.polls, 0);

requireMinimum('UFs do 1T', prior.ufCount, 27);
requireMinimum('pontos da curva 1T', input.firstTurnCurve.length, 50);
requireMinimum('pesquisas nacionais', input.polls?.length ?? 0, 50);
requireMinimum('pesquisas estaduais lidas', statePolls.length, 18);
requireMinimum('UFs com poll estadual', stateAggregates.length, 10);

const brTop = firstTurnFinalRaw.br?.top ?? [];
const brLula = Number(brTop.find((row) => String(row.numero ?? '') === '13')?.pvap);
const brFlavio = Number(brTop.find((row) => String(row.numero ?? '') === '22')?.pvap);
const brDuel =
  Number.isFinite(brLula) && Number.isFinite(brFlavio) && brLula + brFlavio > 0
    ? (100 * brLula) / (brLula + brFlavio)
    : null;

const rawCurveFinal = input.firstTurnCurve[input.firstTurnCurve.length - 1]?.lulaDuel ?? null;
const curveShift =
  rawCurveFinal == null ? null : prior.nationalFinalDuel - rawCurveFinal;

console.log('Prior estrutural 1T → 2T');
console.log(
  `UFs: ${input.firstTurnFinal.length} | pontos da curva 1T: ${input.firstTurnCurve.length} | pesquisas nacionais: ${input.polls?.length ?? 0}`,
);
console.log(`1T share L+F (referência):      ${fmt(prior.nationalShare1T)}% Lula no duelo`);
console.log(`1T base bottom-up (base delta): ${fmt(prior.nationalFinalDuel)}% Lula (média por válidos)`);
console.log(`1T oficial BR (com exterior):   ${fmt(brDuel)}% Lula no duelo`);
console.log(`Curva 1T final:                 ${fmt(rawCurveFinal)}% | ajuste de nível: ${fmt(curveShift)} pp`);
console.log(`Média das pesquisas:            ${fmt(prior.pollMean)}% Lula | delta nacional: ${fmt(prior.nationalDelta)} pp`);
console.log(
  `Pesquisas estaduais:            ${statePolls.length} lidas | ${usedStatePolls} usadas | UFs: ${stateAggregates.length} | peso: ${fmt(prior.statePollWeight, 2)} | blend: ${fmt(prior.blendSpan, 0)}%`,
);
console.log(
  'Nota: a base do delta é a média bottom-up por votos válidos (para a agregação 2T); o share L+F é diagnóstico.',
);

console.log('\nCorreção de viés 1T (curva azul → final):');
for (const counted of [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100]) {
  console.log(
    `  ${fmt(counted, 0).padStart(3)}% apurado → ${fmt(prior.biasAt(counted)).padStart(6)} pp`,
  );
}

console.log('\nPrior por UF (1T, poll estadual e âncora 2T):');
const ufRows = input.firstTurnFinal.map((row) => {
  const poll = statePollByUf.get(row.uf);
  const duel = prior.ufDuel(row.uf);
  return {
    UF: row.uf,
    '1T Lula': fmt(duel),
    'Poll estado': poll ? fmt(poll.lula) : '—',
    n: poll?.polls ?? '',
    'Última': poll?.latestDate ?? '—',
    'Âncora 2T': fmt(prior.ufAnchor(row.uf)),
    'Δ poll-1T': poll && duel != null ? fmt(poll.lula - duel) : '—',
    'Válidos 1T': row.validos.toLocaleString('pt-BR'),
  };
});
console.table(ufRows);

const pollUfs = stateAggregates.filter((poll) =>
  input.firstTurnFinal.some((row) => row.uf === poll.uf),
);
if (pollUfs.length > 0) {
  console.log('\nSensibilidade do peso do poll estadual no anchor:');
  const weights = [0, 0.25, 0.5, 0.75, 1];
  console.table(
    pollUfs.map((poll) => {
      const base = priorBase.ufAnchor(poll.uf) ?? poll.lula;
      const row: Record<string, string> = {
        UF: poll.uf,
        '1T+delta': fmt(base),
        Poll: fmt(poll.lula),
      };
      for (const weight of weights) {
        row[`w=${weight}`] = fmt(base + weight * (poll.lula - base));
      }
      return row;
    }),
  );
}

close(prior.biasAt(100), 0, 'viés em 100%');
for (const row of input.firstTurnFinal) {
  if (prior.ufAnchor(row.uf) == null) {
    throw new Error(`UF sem âncora: ${row.uf}`);
  }
}

const anchorInputs = input.firstTurnFinal.map((row) => ({
  uf: row.uf,
  counted: 0,
  lulaShare: null,
}));
const anchorRun = prior.projectAll(anchorInputs);
let anchorWeighted = 0;
let anchorWeight = 0;
let anchorSimple = 0;
let anchorCount = 0;
for (const row of input.firstTurnFinal) {
  const anchor = prior.ufAnchor(row.uf);
  if (anchor == null) continue;
  anchorWeighted += anchor * row.validos;
  anchorWeight += row.validos;
  anchorSimple += anchor;
  anchorCount += 1;
}
const expectedAnchorNational =
  anchorWeight > 0
    ? anchorWeighted / anchorWeight
    : anchorCount > 0
      ? anchorSimple / anchorCount
      : prior.nationalFinalDuel + prior.nationalDelta;
close(
  anchorRun.national ?? Number.NaN,
  expectedAnchorNational,
  'agregado das âncoras com polls',
);

const anchorRunBase = priorBase.projectAll(anchorInputs);
close(
  anchorRunBase.national ?? Number.NaN,
  priorBase.nationalFinalDuel + priorBase.nationalDelta,
  'agregado das âncoras sem polls estaduais',
);

const finalByUf: Record<string, number> = {};
for (const row of input.firstTurnFinal) {
  const duel = nationalDuelOf(row);
  if (duel != null) finalByUf[row.uf] = duel;
}

const replayCutoffs = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const rawFinal = rawCurveFinal;
const snapshots =
  rawFinal == null
    ? []
    : replayCutoffs.map((counted) => {
        const rawAtCutoff = curveAt(input.firstTurnCurve, counted) ?? rawFinal;
        const deviation = rawAtCutoff - rawFinal;
        const liveByUf: Record<string, number> = {};
        for (const row of input.firstTurnFinal) {
          const duel = nationalDuelOf(row);
          if (duel != null) liveByUf[row.uf] = duel + deviation;
        }
        return { counted, liveByUf };
      });

console.log(
  '\nReplay de mecânica (in-sample, NÃO é validação preditiva): cada UF segue o desvio da curva 1T; a correção deve recuperar o duelo 1T.',
);
console.log('Usa o prior SEM polls estaduais para isolar bias + blend + bottom-up.');

if (snapshots.length > 0) {
  const report = runStructuralBacktest(priorBase, finalByUf, snapshots);
  console.table(
    report.cutoffs.map((cutoff) => ({
      Corte: `${fmt(cutoff.counted, 0)}%`,
      UFs: cutoff.n,
      'Live n': cutoff.liveN,
      'MAE mec.': fmt(cutoff.modelMae),
      'MAE âncora': fmt(cutoff.anchorMae),
      'MAE live': fmt(cutoff.liveMae),
      'MAE mec./live': fmt(cutoff.modelMaeLive),
      'Nacional 1T': fmt(cutoff.national?.actual),
      'Nacional mec.': fmt(cutoff.national?.model),
    })),
  );
  for (const cutoff of report.cutoffs) {
    if (cutoff.modelMae > 0.1) {
      throw new Error(
        `Replay divergiu em ${fmt(cutoff.counted, 0)}%: MAE ${fmt(cutoff.modelMae)}`,
      );
    }
  }
  console.log(
    `MAE geral do replay: mecânica ${fmt(report.overall.modelMae)} pp | âncora ${fmt(report.overall.anchorMae)} pp | live ${fmt(report.overall.liveMae)} pp | mecânica/live ${fmt(report.overall.modelMaeLive)} pp`,
  );
}

console.log('\nOK mecânico: prior, bias, blend e agregação consistentes.');
console.log('Isto NÃO é acurácia nem probabilidade de vitória.');
console.log('Aguardando snapshots reais do 2T por UF (counted/share por UF) + resultado final para o backtest out-of-sample.');
