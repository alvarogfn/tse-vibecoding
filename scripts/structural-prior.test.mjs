import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStructuralPrior } from '../src/lib/election-predictor/structural-prior.ts';
import { runStructuralBacktest } from '../src/lib/election-predictor/backtest.ts';
import {
  aggregateStatePolls,
  parseStatePollsCsv,
} from '../src/lib/election-predictor/prior-data.ts';

const EPS = 1e-6;

function close(actual, expected, label = 'valor') {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= EPS,
    `${label}: esperado ${expected}, obtido ${actual}`,
  );
}

function baseInput(overrides = {}) {
  return {
    firstTurnFinal: [
      { uf: 'AA', lula: 60, flavio: 40, validos: 100 },
      { uf: 'BB', lula: 30, flavio: 70, validos: 300 },
    ],
    firstTurnCurve: [
      { counted: 10, lulaDuel: 30 },
      { counted: 100, lulaDuel: 37.5 },
    ],
    polls: [{ lula: 40 }, { lula: 42 }],
    ...overrides,
  };
}

test('prior: duelo nacional, delta e âncoras', () => {
  const prior = buildStructuralPrior(baseInput());

  close(prior.nationalFinalDuel, 37.5, 'duelo nacional');
  close(prior.nationalShare1T, 37.5, 'share nacional L+F');
  close(prior.ufCount, 2, 'ufCount');
  close(prior.pollMean, 41, 'média das pesquisas');
  close(prior.nationalDelta, 3.5, 'delta nacional');
  close(prior.ufDuel('aa'), 60, 'duelo AA');
  close(prior.ufDuel('BB'), 30, 'duelo BB');
  close(prior.ufValidVotes('AA') ?? NaN, 100, 'válidos AA');
  close(prior.ufValidVotes('BB') ?? NaN, 300, 'válidos BB');
  assert.equal(prior.ufValidVotes('ZZ'), null);
  close(prior.ufAnchor('AA'), 63.5, 'âncora AA');
  close(prior.ufAnchor('BB'), 33.5, 'âncora BB');
  assert.equal(prior.ufDuel('ZZ'), null);
  assert.equal(prior.ufAnchor('ZZ'), null);
});

test('prior: correção azul interpola e zera em 100%', () => {
  const prior = buildStructuralPrior(baseInput());

  close(prior.biasAt(0), 7.5, 'viés em 0');
  close(prior.biasAt(10), 7.5, 'viés em 10');
  close(prior.biasAt(55), 3.75, 'viés em 55');
  close(prior.biasAt(100), 0, 'viés em 100');
  close(prior.biasAt(150), 0, 'viés acima de 100');
  close(prior.curveAt(0), 30, 'curva em 0');
  close(prior.curveAt(55), 33.75, 'curva em 55');
  close(prior.curveAt(100), 37.5, 'curva em 100');
});

test('prior: normaliza o nível da curva para o duelo bottom-up', () => {
  const prior = buildStructuralPrior(
    baseInput({
      firstTurnCurve: [
        { counted: 0, lulaDuel: 30 },
        { counted: 100, lulaDuel: 40 },
      ],
    }),
  );

  close(prior.biasAt(0), 10, 'viés em 0 após normalizar');
  close(prior.biasAt(100), 0, 'viés em 100 após normalizar');
});

test('prior: projeta UF com blend e corrige o live', () => {
  const prior = buildStructuralPrior(baseInput());
  const projection = prior.project({ uf: 'AA', counted: 30, lulaShare: 50 });

  assert.ok(projection);
  close(projection.blend, 0.5, 'blend');
  close(projection.correctedLive, 55.83333333333333, 'live corrigido');
  close(projection.estimate, 59.666666666666664, 'estimativa');
  close(projection.weight, 100, 'peso');
  assert.equal(projection.source, 'live');
});

test('prior: sem live (ou counted 0) cai na âncora', () => {
  const prior = buildStructuralPrior(baseInput());
  const idle = prior.project({ uf: 'AA', counted: 30, lulaShare: null });
  assert.ok(idle);
  close(idle.estimate, 63.5, 'estimativa idle');
  assert.equal(idle.correctedLive, null);
  close(idle.blend, 0, 'blend idle');
  assert.equal(idle.source, 'anchor');

  const zero = prior.project({ uf: 'AA', counted: 0, lulaShare: 50 });
  assert.ok(zero);
  close(zero.estimate, 63.5, 'estimativa em 0%');
  close(zero.blend, 0, 'blend em 0%');
  assert.equal(zero.source, 'anchor');
});

test('prior: agregação bottom-up por votos válidos e deduplica UF', () => {
  const prior = buildStructuralPrior(baseInput());
  const run = prior.projectAll([
    { uf: 'AA', counted: 30, lulaShare: 50 },
    { uf: 'BB', counted: 30, lulaShare: 20 },
  ]);

  assert.equal(run.ufs.length, 2);
  close(run.nationalWeight, 400, 'peso nacional');
  close(run.national, 37.166666666666664, 'nacional');
  close(run.ufs.find((uf) => uf.uf === 'BB')?.estimate ?? NaN, 29.666666666666664, 'estimativa BB');

  const dedup = prior.projectAll([
    { uf: 'AA', counted: 0, lulaShare: null },
    { uf: 'aa', counted: 100, lulaShare: 60 },
  ]);
  assert.equal(dedup.ufs.length, 1);
  close(dedup.ufs[0]?.estimate ?? NaN, 60, 'última ocorrência vence');
});

test('prior: poll estadual entra com shrinkage e peso configurável', () => {
  const blended = buildStructuralPrior(
    baseInput({ pollsByUf: { AA: 70, ZZ: 999 } }),
  );
  close(blended.statePollWeight, 0.5, 'peso default');
  close(blended.ufAnchor('AA'), 66.75, 'âncora AA com shrinkage');
  close(blended.ufAnchor('BB'), 33.5, 'âncora BB com delta nacional');
  close(blended.ufPollAvg('AA') ?? NaN, 70, 'poll local AA');
  assert.equal(blended.ufPollAvg('BB'), null);

  const full = buildStructuralPrior(
    baseInput({ pollsByUf: { AA: 70 }, statePollWeight: 1 }),
  );
  close(full.ufAnchor('AA'), 70, 'poll puro');

  const off = buildStructuralPrior(
    baseInput({ pollsByUf: { AA: 70 }, statePollWeight: 0 }),
  );
  close(off.ufAnchor('AA'), 63.5, 'poll ignorado');
});

test('prior: média ponderada e valores inválidos de pesquisa', () => {
  const weighted = buildStructuralPrior(
    baseInput({ polls: [{ lula: 40, weight: 1 }, { lula: 50, weight: 3 }] }),
  );
  close(weighted.pollMean, 47.5, 'média ponderada');

  const invalid = buildStructuralPrior(
    baseInput({ polls: [{ lula: Number.NaN }, { lula: 101 }, { lula: 50 }] }),
  );
  close(invalid.pollMean, 50, 'média ignora inválidos');
});

test('prior: normaliza poll nacional para o duelo Lula×Flávio', () => {
  const prior = buildStructuralPrior(
    baseInput({ polls: [{ lula: 45, flavio: 47 }] }),
  );
  close(prior.pollMean, 48.91304347826087, 'poll normalizado');
  close(prior.nationalDelta, 11.413043478260875, 'delta normalizado');
});

test('prior: distingue share L+F da média bottom-up por válidos', () => {
  const prior = buildStructuralPrior({
    firstTurnFinal: [
      { uf: 'AA', lula: 60, flavio: 40, validos: 100 },
      { uf: 'BB', lula: 30, flavio: 30, validos: 1000 },
    ],
    firstTurnCurve: [],
    polls: [],
  });
  // BB tem 400 votos de outros candidatos; a média por válidos e o share
  // L+F não são a mesma coisa.
  close(prior.nationalFinalDuel, 50.90909090909091, 'média por válidos');
  close(prior.nationalShare1T, 51.42857142857143, 'share L+F');
});

test('prior: live fora de 0–100 é ignorado (não vira 0/100)', () => {
  const prior = buildStructuralPrior(baseInput());
  for (const value of [-5, 150, Number.NaN, Number.POSITIVE_INFINITY]) {
    const projection = prior.project({ uf: 'AA', counted: 50, lulaShare: value });
    assert.ok(projection);
    assert.equal(projection.correctedLive, null);
    assert.equal(projection.source, 'anchor');
    close(projection.estimate, 63.5, 'âncora com live inválido');
  }
});

test('prior: curva vazia não quebra e viés é 0', () => {
  const prior = buildStructuralPrior(baseInput({ firstTurnCurve: [] }));
  close(prior.biasAt(50), 0, 'viés sem curva');
  const projection = prior.project({ uf: 'AA', counted: 100, lulaShare: 60 });
  assert.ok(projection);
  close(projection.estimate, 60, 'live em 100% sem curva');
});

test('prior: sem votos válidos cai na média simples', () => {
  const prior = buildStructuralPrior(
    baseInput({
      firstTurnFinal: [
        { uf: 'AA', lula: 60, flavio: 40, validos: 0 },
        { uf: 'BB', lula: 30, flavio: 70, validos: 0 },
      ],
      polls: [],
    }),
  );
  close(prior.nationalFinalDuel, 45, 'média simples');
  const run = prior.projectAll([
    { uf: 'AA', counted: 0, lulaShare: null },
    { uf: 'BB', counted: 0, lulaShare: null },
  ]);
  close(run.national, 45, 'nacional sem pesos');
  close(run.nationalWeight, 0, 'peso nacional zero');
});

test('prior: blendSpan é validado e limitado a 1–100', () => {
  const short = buildStructuralPrior(baseInput({ blendSpan: 0 }));
  close(short.blendSpan, 60, 'fallback do blendSpan');
  const slow = buildStructuralPrior(baseInput({ blendSpan: 100 }));
  const projection = slow.project({ uf: 'AA', counted: 50, lulaShare: 50 });
  assert.ok(projection);
  close(projection.blend, 0.5, 'blend com span 100');
});

test('backtest: mede modelo, âncora, live e agregação nacional', () => {
  const prior = buildStructuralPrior(baseInput());
  const report = runStructuralBacktest(
    prior,
    { AA: 65, BB: 35 },
    [
      { counted: 0, liveByUf: { AA: 50, BB: 20 } },
      { counted: 100, liveByUf: { AA: 65, BB: 35 } },
    ],
  );

  assert.equal(report.cutoffs.length, 2);
  const first = report.cutoffs[0];
  const second = report.cutoffs[1];
  assert.ok(first && second);

  assert.equal(first.liveN, 2);
  close(first.modelMae, 1.5, 'MAE do modelo em 0%');
  close(first.anchorMae, 1.5, 'MAE da âncora em 0%');
  close(first.liveMae ?? NaN, 15, 'MAE do live em 0%');
  close(first.modelMaeLive ?? NaN, 1.5, 'MAE modelo no subset live');
  close(first.anchorMaeLive ?? NaN, 1.5, 'MAE âncora no subset live');
  close(first.modelRmse, 1.5, 'RMSE do modelo em 0%');
  close(first.national?.actual ?? NaN, 42.5, 'nacional real');
  close(first.national?.model ?? NaN, 41, 'nacional do modelo');
  close(first.national?.anchor ?? NaN, 41, 'nacional da âncora');
  close(first.national?.live ?? NaN, 27.5, 'nacional do live');
  assert.equal(first.modelWinnerHits, 2);
  assert.equal(first.modelWinnerN, 2);

  assert.equal(second.liveN, 2);
  close(second.modelMae, 0, 'MAE do modelo em 100%');
  close(second.anchorMae, 1.5, 'MAE da âncora em 100%');
  close(second.liveMae ?? NaN, 0, 'MAE do live em 100%');
  close(second.modelMaeLive ?? NaN, 0, 'MAE modelo no subset live em 100%');
  close(second.national?.model ?? NaN, 42.5, 'nacional do modelo em 100%');

  close(report.overall.modelMae, 0.75, 'MAE geral do modelo');
  close(report.overall.anchorMae, 1.5, 'MAE geral da âncora');
  close(report.overall.liveMae ?? NaN, 7.5, 'MAE geral do live');
  close(report.overall.modelMaeLive ?? NaN, 0.75, 'MAE geral modelo/live');
  close(report.overall.anchorMaeLive ?? NaN, 1.5, 'MAE geral âncora/live');
});

test('backtest: counted por UF e falha explícita sem dados', () => {
  const prior = buildStructuralPrior(baseInput());
  const report = runStructuralBacktest(
    prior,
    { AA: 65, BB: 35 },
    [
      {
        counted: 100,
        countedByUf: { AA: 0 },
        liveByUf: { AA: 50, BB: 35 },
      },
    ],
  );
  const cutoff = report.cutoffs[0];
  assert.ok(cutoff);
  const aa = cutoff.points.find((point) => point.uf === 'AA');
  const bb = cutoff.points.find((point) => point.uf === 'BB');
  assert.ok(aa && bb);
  assert.equal(aa.counted, 0);
  assert.equal(bb.counted, 100);
  close(aa.estimate, 63.5, 'AA usa a âncora em 0%');
  close(bb.estimate, 35, 'BB usa o live em 100%');

  assert.throws(
    () => runStructuralBacktest(prior, {}, [{ counted: 0, liveByUf: {} }]),
    /finalByUf vazio/,
  );
  assert.throws(() => runStructuralBacktest(prior, { AA: 65 }, []), /snapshots vazio/);
  assert.throws(
    () =>
      runStructuralBacktest(prior, { ZZ: 50 }, [
        { counted: 0, liveByUf: { ZZ: 50 } },
      ]),
    /não casou nenhuma UF/,
  );
});

test('state polls: normaliza Totais, ignora inválidos e agrega por UF', () => {
  const csv = `Estado,Instituto,Flavio_Bolsonaro_Pct,Lula_Pct,Tipo_Voto,Data_Publicacao_Coleta,Registro_TSE
SP,X,40,60,Válidos,24/10/2026,
SP,Y,30,60,Totais,17/10/2026,
MG,Z,50,50,Totais,24/10/2026,
XX,Bad,10,90,Válidos,24/10/2026,
SP,Bad,abc,def,Válidos,24/10/2026,`;

  const polls = parseStatePollsCsv(csv);
  assert.equal(polls.length, 3);
  const spTotais = polls.find((poll) => poll.uf === 'SP' && poll.rawLula === 60 && poll.rawFlavio === 30);
  assert.ok(spTotais);
  close(spTotais.lula, 66.66666666666666, 'SP Totais normalizado');

  const simple = aggregateStatePolls(polls, { halfLifeDays: 0 });
  const sp = simple.find((poll) => poll.uf === 'SP');
  const mg = simple.find((poll) => poll.uf === 'MG');
  assert.ok(sp && mg);
  close(sp.lula, 63.333333333333336, 'SP média simples');
  assert.equal(sp.polls, 2);
  assert.equal(sp.latestDate, '24/10/2026');
  close(mg.lula, 50, 'MG normalizado');

  const weighted = aggregateStatePolls(polls, {
    asOf: '2026-10-24',
    halfLifeDays: 14,
  });
  const spWeighted = weighted.find((poll) => poll.uf === 'SP');
  assert.ok(spWeighted);
  assert.ok(spWeighted.lula > 60 && spWeighted.lula < sp.lula, 'recência puxa para o poll novo');
});

test('state polls: asOf corta futuro e poll sem data é ignorado por default', () => {
  const csv = `Estado,Instituto,Flavio_Bolsonaro_Pct,Lula_Pct,Tipo_Voto,Data_Publicacao_Coleta,Registro_TSE
SP,Old,40,60,Válidos,01/10/2026,
SP,Future,20,80,Válidos,24/10/2026,
SP,Undated,50,50,Válidos,Não Informado,`;

  const polls = parseStatePollsCsv(csv);
  assert.equal(polls.length, 3);

  const cut = aggregateStatePolls(polls, {
    asOf: '2026-10-10',
    halfLifeDays: 0,
  });
  assert.equal(cut.length, 1);
  const spCut = cut[0];
  assert.ok(spCut);
  close(spCut.lula, 60, 'só poll até o corte');
  assert.equal(spCut.polls, 1);
  assert.equal(spCut.latestDate, '01/10/2026');

  const withUndated = aggregateStatePolls(polls, {
    asOf: '2026-10-10',
    halfLifeDays: 0,
    includeUndated: true,
  });
  assert.ok(withUndated[0]);
  close(withUndated[0].lula, 55, 'poll datado + sem data');
  assert.equal(withUndated[0].polls, 2);

  const latest = aggregateStatePolls(polls, { halfLifeDays: 0 });
  assert.ok(latest[0]);
  close(latest[0].lula, 70, 'polls datados, sem data excluído');
  assert.equal(latest[0].polls, 2);
});

test('backtest: UF sem live cai na âncora e UF desconhecida é ignorada', () => {
  const prior = buildStructuralPrior(baseInput());
  const report = runStructuralBacktest(
    prior,
    { AA: 65, BB: 35 },
    [{ counted: 50, liveByUf: { AA: 65, ZZ: 99 } }],
  );

  assert.equal(report.cutoffs.length, 1);
  const cutoff = report.cutoffs[0];
  assert.ok(cutoff);
  assert.equal(cutoff.n, 2);
  assert.equal(cutoff.liveN, 1);
  close(cutoff.points.find((point) => point.uf === 'BB')?.estimate ?? NaN, 33.5, 'BB na âncora');
  close(cutoff.liveMae ?? NaN, 0, 'só AA tem live');
  assert.ok((cutoff.modelMaeLive ?? 0) > 0, 'modelo/live usa só AA');
});
