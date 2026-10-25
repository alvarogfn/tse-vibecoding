/**
 * election-predictor/prior-data — adaptadores dos dados públicos do 1T.
 *
 * O core `structural-prior.ts` é puro. Este arquivo é o adaptador que traduz
 * os formatos do TSE/pesquisas para o contrato do prior:
 *
 * - `first-turn-2026.json`  → final do 1T por UF + votos válidos;
 * - `votacao-brasil.json`   → série nacional Lula/Flávio;
 * - `resumo-geral.json`     → % de seções totalizadas por timestamp;
 * - `pesquisas-nacional.csv` → pesquisas nacionais do 2T;
 * - `pesquisas-estado.csv`   → pesquisas estaduais do 2T (normalizadas para
 *                              o duelo Lula × Flávio e agregadas por UF).
 *
 * Os parsers são tolerantes a número com vírgula, string/percentual e linhas
 * inválidas, mas não inventam dados: UF/candidato ausente é simplesmente
 * omitido e o core decide o fallback.
 */

import type {
  FirstTurnCurvePoint,
  FirstTurnFinal,
  PollPoint,
  StructuralPriorInput,
} from './structural-prior.js';

export interface TableRaw {
  columns: readonly string[];
  data: Readonly<Record<string, readonly unknown[]>>;
}

export interface FirstTurnTopRaw {
  numero?: string | number;
  pvap?: string | number;
  votos?: string | number;
}

export interface FirstTurnUfRaw {
  validos?: string | number;
  eleitorado?: string | number;
  top?: readonly FirstTurnTopRaw[];
}

export interface FirstTurnFinalRaw {
  ufs?: Readonly<Record<string, FirstTurnUfRaw>>;
  /** Resultado nacional oficial (inclui exterior); usado só para diagnóstico. */
  br?: FirstTurnUfRaw;
}

export interface RawPriorData {
  firstTurnFinal: FirstTurnFinalRaw;
  votacaoBrasil: TableRaw;
  resumoGeral: TableRaw;
  nationalPollsCsv?: string;
  statePollsCsv?: string;
}

export interface StatePollPoint {
  uf: string;
  /** Lula no duelo Lula × Flávio, normalizado para 0–100. */
  lula: number;
  /** Valores originais, para auditoria. */
  rawLula: number;
  rawFlavio: number;
  /** "Válidos", "Totais" etc. (normalizado para comparação). */
  type: string;
  date: string | null;
  dateMs: number | null;
  institute: string | null;
  registry: string | null;
}

export interface StatePollAggregate {
  uf: string;
  /** Média ponderada (recência) do duelo Lula × Flávio. */
  lula: number;
  polls: number;
  latestDate: string | null;
}

export interface StatePollOptions {
  /**
   * Meia-vida da ponderação por recência, em dias. Default 14.
   * <= 0 desliga a recência (média simples).
   */
  halfLifeDays?: number;
  /** Data de referência (ISO, dd/mm/aaaa, Date ou ms). Default: poll mais recente. */
  asOf?: string | number | Date;
  /**
   * Incluir polls sem data. Default false: sem data não há como aplicar
   * recência, e um poll sem data não deve dominar os datados (ex.: RJ).
   */
  includeUndated?: boolean;
}

const LULA = '13';
const FLAVIO = '22';

/**
 * Pontos abaixo de 1% vêm de amostras minúsculas (ex.: 579 votos) e podem
 * produzir um duelo de 64% ou 37% sem significado. O piso evita que
 * `biasAt(0)` extrapole esse ruído; em 0% o live nem entra no blend.
 */
export const MIN_NATIONAL_CURVE_COUNTED = 1;

/** 27 UFs + ZZ (exterior). Evita que um código de 2 letras inválido vire UF. */
const UF_CODES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO', 'ZZ',
]);

const clampPct = (value: number): number => Math.min(100, Math.max(0, value));

/** Aceita number, "49,5", "49.5", "49,5%", "1.234,56". */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/%/g, '').replace(/\s/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/** Remove acentos/case para comparar cabeçalhos e cargos. */
function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeHeader(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}

function tableRows(table: TableRaw): Array<Record<string, unknown>> {
  const columns = table.columns ?? [];
  let length = 0;
  for (const column of columns) {
    const values = table.data?.[column];
    if (values && values.length > length) length = values.length;
  }
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < length; index += 1) {
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      row[column] = table.data?.[column]?.[index];
    }
    rows.push(row);
  }
  return rows;
}

function findTop(row: FirstTurnUfRaw, numero: string): number | null {
  const top = row.top ?? [];
  const candidate = top.find((entry) => String(entry.numero ?? '').trim() === numero);
  if (!candidate) return null;
  const pvap = toNumber(candidate.pvap);
  if (pvap != null) return pvap >= 0 && pvap <= 100 ? pvap : null;
  const votos = toNumber(candidate.votos);
  const validos = toNumber(row.validos);
  if (votos == null || validos == null || !(validos > 0)) return null;
  return clampPct((100 * votos) / validos);
}

/**
 * Final do 1T por UF. Inclui `ZZ` (exterior) se existir; exclui `BR` para não
 * duplicar a massa nacional na agregação bottom-up.
 */
export function parseFirstTurnFinal(raw: FirstTurnFinalRaw): FirstTurnFinal[] {
  const ufs = raw.ufs ?? {};
  const result: FirstTurnFinal[] = [];
  for (const [rawUf, row] of Object.entries(ufs)) {
    if (!row) continue;
    const uf = rawUf.trim().toUpperCase();
    if (!UF_CODES.has(uf)) continue;
    const lula = findTop(row, LULA);
    const flavio = findTop(row, FLAVIO);
    if (lula == null || flavio == null) continue;
    if (lula + flavio <= 0) continue;
    const validos = toNumber(row.validos);
    result.push({
      uf,
      lula,
      flavio,
      validos: validos != null && validos > 0 ? validos : 0,
    });
  }
  return result.sort((a, b) => a.uf.localeCompare(b.uf));
}

/**
 * Série nacional do duelo Lula × Flávio. Faz join por `dt_data` com o resumo
 * geral para obter o % de seções totalizadas. Se houver mais de um ponto no
 * mesmo `counted`, o último (na ordem de leitura) vence.
 */
export function parseNationalDuelCurve(
  votacaoBrasil: TableRaw,
  resumoGeral: TableRaw,
): FirstTurnCurvePoint[] {
  const countedByTime = new Map<string, number>();
  for (const row of tableRows(resumoGeral)) {
    const time = String(row.dt_data ?? '').trim();
    if (!time) continue;
    const counted = toNumber(row.pct_secoes_totalizadas);
    if (counted == null) continue;
    countedByTime.set(time, clampPct(counted));
  }

  const duelByTime = new Map<string, { lula: number | null; flavio: number | null }>();
  for (const row of tableRows(votacaoBrasil)) {
    const cargo = normalizeText(String(row.nm_cargo_pergunta ?? ''));
    if (cargo !== 'presidente') continue;
    const candidate = String(row.nr_votavel ?? '').trim();
    if (candidate !== LULA && candidate !== FLAVIO) continue;
    const time = String(row.dt_data ?? '').trim();
    if (!time) continue;
    const pct = toNumber(row.pct_votos_nominais);
    if (pct == null || pct < 0 || pct > 100) continue;
    const entry = duelByTime.get(time) ?? { lula: null, flavio: null };
    if (candidate === LULA) entry.lula = pct;
    else entry.flavio = pct;
    duelByTime.set(time, entry);
  }

  const byCounted = new Map<number, FirstTurnCurvePoint>();
  for (const [time, duel] of duelByTime) {
    const counted = countedByTime.get(time);
    if (counted == null || counted < MIN_NATIONAL_CURVE_COUNTED) continue;
    if (duel.lula == null || duel.flavio == null) continue;
    const total = duel.lula + duel.flavio;
    if (!(total > 0)) continue;
    const lulaDuel = clampPct((100 * duel.lula) / total);
    byCounted.set(counted, { counted, lulaDuel });
  }

  return [...byCounted.values()].sort((a, b) => a.counted - b.counted);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? '';
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

/**
 * Pesquisas nacionais. O CSV atual não tem amostra/margem/UF: usa peso 1.
 * Se um dia houver coluna de amostra (`Amostra`, `N`, `Entrevistas`), ela
 * passa a ser o peso, sem mudar o contrato do core.
 */
export function parsePollsCsv(csv: string): PollPoint[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (first < 0) return [];
  const header = parseCsvLine(lines[first] ?? '').map(normalizeHeader);
  const findColumn = (names: readonly string[]): number =>
    header.findIndex((column) => names.includes(column));

  const lulaIndex = findColumn(['lula']);
  const flavioIndex = findColumn(['flavio']);
  const campoIndex = findColumn(['campo', 'data', 'periodo']);
  const instituteIndex = findColumn(['instituto', 'pesquisa']);
  const weightIndex = findColumn(['amostra', 'n', 'entrevistas', 'peso']);

  if (lulaIndex < 0 && flavioIndex < 0) return [];

  const result: PollPoint[] = [];
  for (let index = first + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const rawLula = lulaIndex >= 0 ? fields[lulaIndex] : undefined;
    const rawFlavio = flavioIndex >= 0 ? fields[flavioIndex] : undefined;
    let lula = toNumber(rawLula);
    const flavio = toNumber(rawFlavio);
    if (lula == null && flavio != null) lula = 100 - flavio;
    if (lula == null || lula < 0 || lula > 100) continue;
    if (flavio != null && (flavio < 0 || flavio > 100)) continue;

    const rawWeight = weightIndex >= 0 ? toNumber(fields[weightIndex]) : null;
    const weight = rawWeight != null && rawWeight > 0 ? rawWeight : 1;
    const date = campoIndex >= 0 ? fields[campoIndex]?.trim() : undefined;
    const institute =
      instituteIndex >= 0 ? fields[instituteIndex]?.trim() : undefined;

    result.push({
      lula,
      flavio: flavio == null ? undefined : flavio,
      weight,
      date: date || undefined,
      institute: institute || undefined,
    });
  }
  return result;
}

/** dd/mm/aaaa → ms UTC; ISO/Date.parse como fallback. */
function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || normalizeText(trimmed) === 'nao informado') return null;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return Date.UTC(year, month - 1, day);
  }
  const iso = Date.parse(trimmed);
  return Number.isFinite(iso) ? iso : null;
}

function parseAsOfMs(value: string | number | Date | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return parseDateMs(value);
}

/**
 * Pesquisas estaduais do 2T. O CSV traz `Flavio_Bolsonaro_Pct` e `Lula_Pct`;
 * alguns registros são "Totais" (não somam 100). Normalizamos todos para o
 * duelo Lula × Flávio, que é a mesma métrica do prior.
 */
export function parseStatePollsCsv(csv: string): StatePollPoint[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (first < 0) return [];
  const header = parseCsvLine(lines[first] ?? '').map(normalizeHeader);
  const findColumn = (names: readonly string[]): number =>
    header.findIndex((column) => names.includes(column));

  const ufIndex = findColumn(['estado', 'uf', 'estadouf']);
  const lulaIndex = findColumn(['lula', 'lulapct']);
  const flavioIndex = findColumn([
    'flavio',
    'flaviopct',
    'flaviobolsonaropct',
  ]);
  const typeIndex = findColumn(['tipovoto', 'tipo']);
  const dateIndex = findColumn([
    'datapublicacaocoleta',
    'data',
    'datadacoleta',
  ]);
  const instituteIndex = findColumn(['instituto', 'pesquisa']);
  const registryIndex = findColumn(['registrotse', 'registro']);

  if (ufIndex < 0 || lulaIndex < 0 || flavioIndex < 0) return [];

  const result: StatePollPoint[] = [];
  for (let index = first + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const uf = String(fields[ufIndex] ?? '').trim().toUpperCase();
    if (!UF_CODES.has(uf)) continue;
    const rawLula = toNumber(fields[lulaIndex]);
    const rawFlavio = toNumber(fields[flavioIndex]);
    if (rawLula == null || rawFlavio == null) continue;
    if (rawLula < 0 || rawLula > 100 || rawFlavio < 0 || rawFlavio > 100) continue;
    const total = rawLula + rawFlavio;
    if (!(total > 0)) continue;

    const date = dateIndex >= 0 ? fields[dateIndex]?.trim() : undefined;
    const dateMs = parseDateMs(date);
    const type = normalizeText(String(fields[typeIndex] ?? ''));
    const institute =
      instituteIndex >= 0 ? fields[instituteIndex]?.trim() : undefined;
    const registry =
      registryIndex >= 0 ? fields[registryIndex]?.trim() : undefined;

    result.push({
      uf,
      lula: clampPct((100 * rawLula) / total),
      rawLula,
      rawFlavio,
      type,
      date: date || null,
      dateMs,
      institute: institute || null,
      registry: registry || null,
    });
  }
  return result.sort((a, b) => {
    const byUf = a.uf.localeCompare(b.uf);
    if (byUf !== 0) return byUf;
    return (a.dateMs ?? 0) - (b.dateMs ?? 0);
  });
}

/**
 * Agrega por UF com peso exponencial de recência (meia-vida default 14 dias).
 * Sem data, o poll recebe peso 1; com `halfLifeDays <= 0`, todos recebem 1.
 */
export function aggregateStatePolls(
  polls: readonly StatePollPoint[],
  options: StatePollOptions = {},
): StatePollAggregate[] {
  if (polls.length === 0) return [];
  const halfLifeDays = options.halfLifeDays ?? 14;
  const includeUndated = options.includeUndated ?? false;
  const dated = polls.filter((poll) => poll.dateMs != null);
  const latest = dated.length > 0
    ? Math.max(...dated.map((poll) => poll.dateMs ?? 0))
    : null;
  const asOf = parseAsOfMs(options.asOf) ?? latest;

  interface Aggregate {
    weighted: number;
    weight: number;
    polls: number;
    latestDate: string | null;
    latestMs: number | null;
  }
  const byUf = new Map<string, Aggregate>();
  for (const poll of polls) {
    // Look-ahead: um poll posterior ao corte não pode entrar no backtest.
    if (poll.dateMs != null && asOf != null && poll.dateMs > asOf) continue;
    if (poll.dateMs == null && !includeUndated) continue;
    const ageDays =
      halfLifeDays > 0 && asOf != null && poll.dateMs != null
        ? Math.max(0, asOf - poll.dateMs) / 86_400_000
        : 0;
    const weight =
      halfLifeDays > 0 && asOf != null && poll.dateMs != null
        ? Math.pow(0.5, ageDays / halfLifeDays)
        : 1;
    const entry = byUf.get(poll.uf) ?? {
      weighted: 0,
      weight: 0,
      polls: 0,
      latestDate: null,
      latestMs: null,
    };
    entry.weighted += poll.lula * weight;
    entry.weight += weight;
    entry.polls += 1;
    if (poll.dateMs != null && (entry.latestMs == null || poll.dateMs > entry.latestMs)) {
      entry.latestMs = poll.dateMs;
      entry.latestDate = poll.date;
    }
    byUf.set(poll.uf, entry);
  }

  return [...byUf.entries()]
    .map(([uf, entry]) => ({
      uf,
      lula: entry.weight > 0 ? entry.weighted / entry.weight : 0,
      polls: entry.polls,
      latestDate: entry.latestDate,
    }))
    .sort((a, b) => a.uf.localeCompare(b.uf));
}

export interface ParsePriorOptions {
  statePolls?: StatePollOptions;
}

/** Traduz os formatos brutos para o contrato do prior. */
export function parseStructuralPriorInput(
  raw: RawPriorData,
  options: ParsePriorOptions = {},
): StructuralPriorInput {
  const statePolls = raw.statePollsCsv ? parseStatePollsCsv(raw.statePollsCsv) : [];
  const stateAggregates = aggregateStatePolls(statePolls, options.statePolls);
  const pollsByUf =
    stateAggregates.length > 0
      ? Object.fromEntries(stateAggregates.map((poll) => [poll.uf, poll.lula]))
      : undefined;

  const input: StructuralPriorInput = {
    firstTurnFinal: parseFirstTurnFinal(raw.firstTurnFinal),
    firstTurnCurve: parseNationalDuelCurve(raw.votacaoBrasil, raw.resumoGeral),
    polls: raw.nationalPollsCsv ? parsePollsCsv(raw.nationalPollsCsv) : [],
  };
  if (pollsByUf) input.pollsByUf = pollsByUf;
  return input;
}

export interface StaticPriorOptions {
  /**
   * Base pública do app (ex.: import.meta.env.BASE_URL). Obrigatória: em
   * produção o Vite usa `/tse-vibecoding/`, e um default `/` gera 404 silencioso.
   */
  base: string;
  blendSpan?: number;
  statePollWeight?: number;
}

function joinUrl(base: string, path: string): string {
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}${path.replace(/^\//, '')}`;
}

const FETCH_TIMEOUT_MS = 15_000;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${url}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * CSVs de pesquisa são opcionais. Qualquer falha (404, 500, timeout, HTML no
 * lugar de CSV) vira string vazia: o prior continua com delta = 0 e/ou sem
 * polls estaduais, em vez de derrubar a apuração.
 */
async function fetchOptionalText(url: string): Promise<string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  }
}

/**
 * Carrega os dados estáticos do 1T e das pesquisas. Os JSONs do 1T são
 * obrigatórios; os CSVs de pesquisa são opcionais. Erros nos obrigatórios são
 * propagados (o chamador decide o fallback).
 */
export async function fetchStaticPriorInputs(
  options: StaticPriorOptions,
): Promise<StructuralPriorInput> {
  const { base } = options;
  const [firstTurnFinal, votacaoBrasil, resumoGeral, nationalPollsCsv, statePollsCsv] =
    await Promise.all([
      fetchJson<FirstTurnFinalRaw>(
        joinUrl(base, 'temp-data/first-turn-2026.json'),
      ),
      fetchJson<TableRaw>(joinUrl(base, '1-turn-data/votacao-brasil.json')),
      fetchJson<TableRaw>(joinUrl(base, '1-turn-data/resumo-geral.json')),
      fetchOptionalText(joinUrl(base, 'pesquisas-nacional.csv')),
      fetchOptionalText(joinUrl(base, 'pesquisas-estado.csv')),
    ]);

  if (!firstTurnFinal || typeof firstTurnFinal !== 'object' || !firstTurnFinal.ufs) {
    throw new Error('first-turn-2026.json inválido: campo "ufs" ausente');
  }
  if (!votacaoBrasil || !Array.isArray(votacaoBrasil.columns) || !votacaoBrasil.data) {
    throw new Error('votacao-brasil.json inválido: colunas/dados ausentes');
  }
  if (!resumoGeral || !Array.isArray(resumoGeral.columns) || !resumoGeral.data) {
    throw new Error('resumo-geral.json inválido: colunas/dados ausentes');
  }

  const input = parseStructuralPriorInput({
    firstTurnFinal,
    votacaoBrasil,
    resumoGeral,
    nationalPollsCsv: nationalPollsCsv || undefined,
    statePollsCsv: statePollsCsv || undefined,
  });
  if (options.blendSpan != null) input.blendSpan = options.blendSpan;
  if (options.statePollWeight != null) input.statePollWeight = options.statePollWeight;
  return input;
}
