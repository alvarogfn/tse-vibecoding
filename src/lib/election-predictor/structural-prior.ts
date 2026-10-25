/**
 * election-predictor/structural-prior — prior estrutural 1T + pesquisas para o 2T.
 *
 * O modelo atual aprende `share → share`; isso é persistência, não previsão.
 * Este módulo implementa o prior independente que faltava:
 *
 *   duel_1T(uf)  = 100 * votos_Lula / (votos_Lula + votos_Flávio)
 *   delta_poll   = média_pesquisas_Lula - duel_1T_nacional
 *   anchor(uf)   = duel_1T(uf) + delta_poll
 *   bias(c)      = duel_1T_nacional - curva_1T(c)   // correção azul
 *   live_corr(c) = live_2T(c) + bias(c)
 *   estimate(c)  = (1 - w(c)) * anchor + w(c) * live_corr(c)
 *   w(c)         = min(1, c / blendSpan)
 *
 * A curva 1T é normalizada para terminar exatamente no duelo nacional
 * bottom-up. Assim `bias(100) = 0` e o nível da curva não conflita com o
 * prior por UF. O prior é bottom-up: a nacional é a média ponderada pelos
 * votos válidos de cada UF, nunca uma média simples.
 *
 * Limite importante: sem o resultado final do 2T e sem snapshots 2T por UF
 * não existe validação out-of-sample. Este módulo fornece o prior e o seam
 * para o backtest; ele não afirma acurácia.
 */

export interface FirstTurnFinal {
  /** Sigla da UF (ex.: "BA"); "ZZ" é aceito como unidade extra. */
  uf: string;
  /** % de Lula nos votos válidos do 1T na UF. */
  lula: number;
  /** % de Flávio nos votos válidos do 1T na UF. */
  flavio: number;
  /** Votos válidos do 1T na UF; usado como peso eleitoral. */
  validos: number;
}

export interface FirstTurnCurvePoint {
  /** % de seções totalizadas (0–100). */
  counted: number;
  /** % de Lula no duelo Lula × Flávio naquele instante (0–100). */
  lulaDuel: number;
}

export interface PollPoint {
  /** % de Lula na pesquisa (0–100). */
  lula: number;
  /** % de Flávio, quando disponível (0–100). */
  flavio?: number;
  /** Peso opcional (amostra, recência etc.); ausente/inválido = 1. */
  weight?: number;
  /** Rótulo do campo/data, apenas para diagnóstico. */
  date?: string;
  /** Instituto, apenas para diagnóstico. */
  institute?: string;
}

export interface StructuralPriorInput {
  firstTurnFinal: readonly FirstTurnFinal[];
  firstTurnCurve: readonly FirstTurnCurvePoint[];
  /** Pesquisas nacionais; opcional. Sem elas, delta_poll = 0. */
  polls?: readonly PollPoint[];
  /** Pesquisas por UF, quando existirem; entram no anchor com shrinkage. */
  pollsByUf?: Readonly<Record<string, number>>;
  /**
   * Peso do poll estadual no anchor da UF (0–1). 0 = ignora o poll;
   * 1 = usa o poll como âncora; default 0.5 (shrinkage ainda não validado
   * out-of-sample no 2T). Sem poll, o anchor é o 1T + delta nacional.
   */
  statePollWeight?: number;
  /**
   * Percentual apurado em que o live passa a valer 100% no blend.
   * Default 60 (mesma ordem de grandeza do rollout atual). Faixa: 1–100.
   */
  blendSpan?: number;
}

export interface LiveUfInput {
  uf: string;
  /** % de seções totalizadas do 2T (0–100). */
  counted: number;
  /** % de Lula no duelo 2T na UF; null antes de haver voto. */
  lulaShare: number | null;
  /**
   * Peso eleitoral (votos válidos totais estimados). Se ausente, usa os
   * votos válidos do 1T da UF. Votos parciais do 2T NÃO devem ser usados:
   * eles sub-representariam UFs com apuração atrasada.
   */
  validos?: number;
}

export interface StructuralProjection {
  uf: string;
  counted: number;
  /** Prior 1T + delta das pesquisas (0–100). */
  anchor: number;
  /** Live 2T corrigido pelo viés azul do 1T; null sem live. */
  correctedLive: number | null;
  /** Estimativa final do duelo na UF (0–100). */
  estimate: number;
  /** Peso efetivo do live no blend (0–1). */
  blend: number;
  /** Peso eleitoral usado na agregação nacional. */
  weight: number;
  /** "anchor" quando não há live utilizável (ou blend = 0). */
  source: 'live' | 'anchor';
}

export interface StructuralRun {
  ufs: StructuralProjection[];
  /** Média bottom-up ponderada por votos válidos; null sem UFs. */
  national: number | null;
  nationalWeight: number;
}

export interface StructuralPrior {
  /**
   * Média bottom-up dos duelos por UF, ponderada pelos votos válidos totais.
   * É a base do delta nacional para que a agregação 2T (também por válidos)
   * convirja para a média nacional das pesquisas. NÃO é o share nacional
   * Lula/(Lula+Flávio); esse é `nationalShare1T`.
   */
  readonly nationalFinalDuel: number;
  /**
   * Share nacional 1T Lula/(Lula+Flávio), somando os votos das UFs.
   * Diagnóstico: no dataset atual fica ~48,98, enquanto a média bottom-up
   * por válidos fica ~48,77. A diferença é de ponderação, não de exterior.
   */
  readonly nationalShare1T: number;
  /** Número de UFs válidas no prior (0 = dados insuficientes). */
  readonly ufCount: number;
  /** Média (ponderada) das pesquisas de Lula; null sem pesquisas válidas. */
  readonly pollMean: number | null;
  /** pollMean - nationalFinalDuel; 0 sem pesquisas. */
  readonly nationalDelta: number;
  /** Peso efetivo do poll estadual no anchor (0–1). */
  readonly statePollWeight: number;
  /** Percentual apurado em que o live chega a peso 1. */
  readonly blendSpan: number;
  /** Duelo 1T da UF; null se a UF não existe no prior. */
  ufDuel(uf: string): number | null;
  /** Poll estadual agregado da UF; null quando não há poll local. */
  ufPollAvg(uf: string): number | null;
  /** Prior 2T da UF (duel 1T + delta); null se a UF não existe. */
  ufAnchor(uf: string): number | null;
  /** Curva nacional do 1T normalizada no `counted` (0–100). */
  curveAt(counted: number): number;
  /** Correção azul no percentual apurado c (1T final - curva 1T em c). */
  biasAt(counted: number): number;
  /** Projeta uma UF em um snapshot; null se a UF não existe no prior. */
  project(input: LiveUfInput): StructuralProjection | null;
  /** Projeta e agrega bottom-up; a última ocorrência de cada UF vence. */
  projectAll(inputs: readonly LiveUfInput[]): StructuralRun;
}

const DEFAULT_BLEND_SPAN = 60;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const clampPct = (value: number): number => Math.min(100, Math.max(0, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeUf = (uf: string): string => uf.trim().toUpperCase();

/** Votos válidos > 0 ou 0 (peso ausente/inválido não entra na agregação). */
const cleanWeight = (value: unknown): number => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/** Duelo Lula × Flávio em %; null se a base for inválida. */
const duelOf = (lula: number, flavio: number): number | null => {
  if (!Number.isFinite(lula) || !Number.isFinite(flavio)) return null;
  if (lula < 0 || flavio < 0) return null;
  const total = lula + flavio;
  if (!(total > 0)) return null;
  return clampPct((100 * lula) / total);
};

interface CleanUf {
  uf: string;
  duel: number;
  validos: number;
  lula: number;
  flavio: number;
}

interface CleanCurvePoint {
  counted: number;
  lulaDuel: number;
}

/** Remove duplicatas por `counted` (última vence) e ordena. */
function cleanCurve(points: readonly FirstTurnCurvePoint[]): CleanCurvePoint[] {
  const byCounted = new Map<number, CleanCurvePoint>();
  for (const point of points) {
    if (!isFiniteNumber(point.counted) || !isFiniteNumber(point.lulaDuel)) continue;
    const counted = clampPct(point.counted);
    byCounted.set(counted, { counted, lulaDuel: clampPct(point.lulaDuel) });
  }
  return [...byCounted.values()].sort((a, b) => a.counted - b.counted);
}

/**
 * Normaliza o nível da curva para terminar no duelo nacional bottom-up.
 * Sem isso, a curva oficial (48.99, com exterior) e a soma das 27 UFs
 * (48.77) produziriam `bias(100) ≠ 0`.
 */
function normalizeCurve(
  points: readonly FirstTurnCurvePoint[],
  targetFinal: number,
): CleanCurvePoint[] {
  const curve = cleanCurve(points);
  const last = curve[curve.length - 1];
  if (!last) return curve;
  const shift = targetFinal - last.lulaDuel;
  return curve.map((point) => ({
    counted: point.counted,
    lulaDuel: clampPct(point.lulaDuel + shift),
  }));
}

/** Interpolação linear com extrapolação plana nas pontas. */
function interpolateCurve(curve: readonly CleanCurvePoint[], counted: number): number {
  const first = curve[0];
  if (!first) return 50;
  if (counted <= first.counted) return first.lulaDuel;
  const last = curve[curve.length - 1];
  if (!last) return 50;
  if (counted >= last.counted) return last.lulaDuel;
  for (let i = 1; i < curve.length; i += 1) {
    const right = curve[i];
    if (!right) continue;
    if (counted <= right.counted) {
      const left = curve[i - 1];
      if (!left) return right.lulaDuel;
      const span = right.counted - left.counted;
      if (!(span > 0)) return right.lulaDuel;
      const t = (counted - left.counted) / span;
      return left.lulaDuel + (right.lulaDuel - left.lulaDuel) * t;
    }
  }
  return last.lulaDuel;
}

/** Média ponderada das pesquisas; ignora valores fora de 0–100. */
function meanPoll(polls: readonly PollPoint[]): number | null {
  let sum = 0;
  let totalWeight = 0;
  for (const poll of polls) {
    const lula =
      isFiniteNumber(poll.lula) && poll.lula >= 0 && poll.lula <= 100
        ? poll.lula
        : null;
    const flavio =
      isFiniteNumber(poll.flavio) && poll.flavio >= 0 && poll.flavio <= 100
        ? poll.flavio
        : null;
    let value: number | null = null;
    if (lula != null && flavio != null && lula + flavio > 0) {
      value = (100 * lula) / (lula + flavio);
    } else if (lula != null) {
      value = lula;
    } else if (flavio != null) {
      value = 100 - flavio;
    }
    if (value == null || value < 0 || value > 100) continue;
    const weight = isFiniteNumber(poll.weight) && poll.weight > 0 ? poll.weight : 1;
    sum += value * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? sum / totalWeight : null;
}

/**
 * Constrói o prior estrutural. Função pura: valida, normaliza e congela as
 * entradas; não faz I/O e não depende de TF.
 */
export function buildStructuralPrior(input: StructuralPriorInput): StructuralPrior {
  const byUf = new Map<string, CleanUf>();
  for (const row of input.firstTurnFinal) {
    if (typeof row.uf !== 'string') continue;
    const uf = normalizeUf(row.uf);
    if (!uf) continue;
    const lula = Number(row.lula);
    const flavio = Number(row.flavio);
    const duel = duelOf(lula, flavio);
    if (duel == null) continue;
    byUf.set(uf, {
      uf,
      duel,
      validos: cleanWeight(row.validos),
      lula,
      flavio,
    });
  }

  const ufRows = [...byUf.values()];
  let weightedDuel = 0;
  let totalValid = 0;
  let lulaMass = 0;
  let duelMass = 0;
  for (const row of ufRows) {
    if (row.validos <= 0) continue;
    weightedDuel += row.duel * row.validos;
    totalValid += row.validos;
    lulaMass += (row.lula / 100) * row.validos;
    duelMass += ((row.lula + row.flavio) / 100) * row.validos;
  }
  const nationalFinalDuel =
    totalValid > 0
      ? weightedDuel / totalValid
      : ufRows.length > 0
        ? ufRows.reduce((sum, row) => sum + row.duel, 0) / ufRows.length
        : 50;
  const nationalShare1T =
    duelMass > 0 ? clampPct((100 * lulaMass) / duelMass) : nationalFinalDuel;

  const curve = normalizeCurve(input.firstTurnCurve, nationalFinalDuel);
  const pollMean = meanPoll(input.polls ?? []);
  const nationalDelta = pollMean == null ? 0 : pollMean - nationalFinalDuel;

  const pollsByUf = new Map<string, number>();
  for (const [rawUf, rawValue] of Object.entries(input.pollsByUf ?? {})) {
    const uf = normalizeUf(rawUf);
    if (!uf || !isFiniteNumber(rawValue) || rawValue < 0 || rawValue > 100) continue;
    pollsByUf.set(uf, rawValue);
  }

  const rawStatePollWeight = input.statePollWeight;
  const statePollWeight =
    typeof rawStatePollWeight === 'number' && Number.isFinite(rawStatePollWeight)
      ? Math.min(1, Math.max(0, rawStatePollWeight))
      : 0.5;

  const rawBlendSpan = input.blendSpan;
  const blendSpan =
    typeof rawBlendSpan === 'number' && Number.isFinite(rawBlendSpan) && rawBlendSpan > 0
      ? Math.min(100, Math.max(1, rawBlendSpan))
      : DEFAULT_BLEND_SPAN;

  const ufDuel = (uf: string): number | null => byUf.get(normalizeUf(uf))?.duel ?? null;

  const ufPollAvg = (uf: string): number | null => pollsByUf.get(normalizeUf(uf)) ?? null;

  const curveAt = (counted: number): number => {
    const x = isFiniteNumber(counted) ? clampPct(counted) : 0;
    return curve.length > 0 ? interpolateCurve(curve, x) : nationalFinalDuel;
  };

  const ufAnchor = (uf: string): number | null => {
    const row = byUf.get(normalizeUf(uf));
    if (!row) return null;
    const base = clampPct(row.duel + nationalDelta);
    const localPoll = pollsByUf.get(row.uf);
    if (localPoll == null) return base;
    return clampPct(base + statePollWeight * (localPoll - base));
  };

  const biasAt = (counted: number): number => {
    const x = isFiniteNumber(counted) ? clampPct(counted) : 0;
    if (curve.length === 0) return 0;
    return nationalFinalDuel - interpolateCurve(curve, x);
  };

  const project = (live: LiveUfInput): StructuralProjection | null => {
    if (typeof live.uf !== 'string') return null;
    const uf = normalizeUf(live.uf);
    const row = byUf.get(uf);
    if (!row) return null;

    const counted = isFiniteNumber(live.counted) ? clampPct(live.counted) : 0;
    const anchor = ufAnchor(uf) ?? clampPct(row.duel + nationalDelta);
    const rawLive =
      isFiniteNumber(live.lulaShare) && live.lulaShare >= 0 && live.lulaShare <= 100
        ? live.lulaShare
        : null;
    const blend = rawLive == null ? 0 : clamp01(counted / blendSpan);
    const correctedLive = rawLive == null ? null : clampPct(rawLive + biasAt(counted));
    const estimate =
      correctedLive == null || blend === 0
        ? anchor
        : clampPct((1 - blend) * anchor + blend * correctedLive);
    const weight =
      live.validos != null && isFiniteNumber(live.validos) && live.validos > 0
        ? live.validos
        : row.validos;

    return {
      uf,
      counted,
      anchor,
      correctedLive,
      estimate,
      blend,
      weight,
      source: correctedLive != null && blend > 0 ? 'live' : 'anchor',
    };
  };

  const projectAll = (inputs: readonly LiveUfInput[]): StructuralRun => {
    const projected = new Map<string, StructuralProjection>();
    for (const inputUf of inputs) {
      const projection = project(inputUf);
      if (projection) projected.set(projection.uf, projection);
    }
    const ufs = [...projected.values()];
    if (ufs.length === 0) return { ufs, national: null, nationalWeight: 0 };

    let nationalWeight = 0;
    let weightedSum = 0;
    let simpleSum = 0;
    for (const projection of ufs) {
      nationalWeight += projection.weight;
      weightedSum += projection.estimate * projection.weight;
      simpleSum += projection.estimate;
    }
    const national =
      nationalWeight > 0 ? weightedSum / nationalWeight : simpleSum / ufs.length;
    return { ufs, national, nationalWeight };
  };

  return {
    nationalFinalDuel,
    nationalShare1T,
    ufCount: byUf.size,
    pollMean,
    nationalDelta,
    statePollWeight,
    blendSpan,
    ufDuel,
    ufPollAvg,
    ufAnchor,
    curveAt,
    biasAt,
    project,
    projectAll,
  };
}
