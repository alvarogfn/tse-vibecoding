import type { Race } from '@/lib/tse.js';

export const BASE: string = import.meta.env.BASE_URL || '/';
export const BRAZIL_SVG_URL = `${BASE}maps/brazil.svg`;
export const MG_SVG_URL = `${BASE}maps/minas-gerais.svg`;
export const MG_MUN_URL = `${BASE}data/mg-municipios.json`; // cache em JSON bruto (IBGE; ver tarefa 3)

export const RACE_PRES: Race = {
  id: 'pres-br-2t',
  ele: '6258',
  ciclo: 'ele2026',
  ufFoto: 'br',
  titulo: 'Presidente',
  subtitulo: 'Eleição Ordinária Federal - 2026 · 2º turno',
  url: 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws',
  tipo: 'majoritario',
};
export const RACE_PRES_MG: Race = {
  id: 'pres-mg-2t',
  ele: '6258',
  ciclo: 'ele2026',
  ufFoto: 'br', // fotos dos presidenciáveis ficam na pasta nacional
  titulo: 'Presidente em MG',
  subtitulo: 'Eleição Ordinária Federal - 2026 · 2º turno',
  url: 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/mg/mg-c0001-e006258-u.jws',
  tipo: 'majoritario',
};

// Endpoints do 2º turno (ele 6258) no ar: busca e exibe dados reais.
// Com ROUND2_LIVE, buscas, legendas, % e mapas preenchem sozinhos.
export const ROUND2_LIVE = true;

// Varredura por UF do 2º turno ativa: cada estado pinta de azul/vermelho pelo vencedor local.
export const USE_ROUND2_GEO = true;
// Cores fixas da disputa presidencial: Flávio Bolsonaro = azul, Lula = vermelho
export const JAIR_BLUE = '#2563eb';
export const LULA_RED = '#dc2626';
// Cinza de "sem dados do 2º turno" (município/UF sem apuração ainda).
export const NO_DATA_GRAY = '#d4d4d8';

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
}

export interface UFWinner {
  numero: string;
  nome: string;
  partido: string;
  pvapNum: number;
  /** % do vencedor só na disputa entre os 2 finalistas (no 2T equivale a pvapNum). */
  share2?: number;
  pst?: string | number | null;
  vap: number;
}

export interface UFMeta {
  done: number;
  total: number;
  at: string | null;
}
