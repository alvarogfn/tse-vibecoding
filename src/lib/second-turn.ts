import type { Race } from './tse.js';

export const BASE: string = import.meta.env.BASE_URL || '/';
export const BRAZIL_SVG_URL = `${BASE}maps/brazil.svg`;
export const MG_SVG_URL = `${BASE}maps/minas-gerais.svg`;
export const MG_MUN_URL = `${BASE}data/mg-municipios.json`; // cache em JSON bruto (IBGE; ver tarefa 3)

export const RACE_PRES: Race = {
  id: 'pres-br-2t',
  ele: '6257',
  ciclo: 'ele2026',
  ufFoto: 'br',
  titulo: 'Presidente',
  subtitulo: 'Eleição Ordinária Federal - 2026',
  url: 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.jws',
  tipo: 'majoritario',
};
export const RACE_PRES_MG: Race = {
  id: 'pres-mg-2t',
  ele: '6257',
  ciclo: 'ele2026',
  ufFoto: 'br', // fotos dos presidenciáveis ficam na pasta nacional
  titulo: 'Presidente em MG',
  subtitulo: 'Eleição Ordinária Federal - 2026',
  url: 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/mg/mg-c0001-e006257-u.jws',
  tipo: 'majoritario',
};

// Endpoints do 2º turno ainda desconhecidos: não busca nem exibe nada do 1º turno.
// Os cards ficam em branco (placeholders) até o TSE publicar; basta ligar
// ROUND2_LIVE que busca, legendas, % e mapas preenchem sozinhos.
export const ROUND2_LIVE = false;

// Sem endpoints do 2º turno por UF: tudo em cinza claro (mesma regra das micros de MG).
// O pipeline (fetchUFs → ufWinners) continua ativo; quando os endpoints saírem,
// basta ligar USE_ROUND2_GEO para pintar cada UF de azul/vermelho pelo vencedor local.
export const USE_ROUND2_GEO = false;
// Cores fixas da disputa presidencial: Flávio Bolsonaro = azul, Lula = vermelho
export const JAIR_BLUE = '#2563eb';
export const LULA_RED = '#dc2626';
// Sem endpoints do 2º turno por microrregião: tudo em cinza claro
export const MICRO_GRAY = '#d4d4d8';

export interface SvgPath {
  id: string;
  d: string;
  title: string;
}

export interface IbgeMicroRaw {
  id: number;
  nome: string;
  mesorregiao?: { id: number } | null;
}

export interface IbgeMunRaw {
  id: number | string;
  nome: string;
  microrregiao?: (IbgeMicroRaw & { nome: string }) | null;
  [k: string]: unknown;
}

export interface MgGeo {
  names: Record<string, string>;
  munMicro: Record<string, string>;
  microNames: Record<string, string>;
}

export interface UFWinner {
  numero: string;
  nome: string;
  partido: string;
  pvapNum: number;
  pst?: string | number | null;
  vap: number;
}

export interface UFMeta {
  done: number;
  total: number;
  at: string | null;
}
