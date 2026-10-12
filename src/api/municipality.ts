import type { IbgeMunRaw } from '@/lib/second-turn.js';

/** Lista municípios de uma UF: /estados/{uf}/municipios */
export const PATH_MUNICIPALITIES_FIND_ALL =
  'https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios';

export type MunicipalitiesFindAllPathParams = {
  /** Código IBGE da UF, ex. '31' (MG). */
  uf: number | string;
};

export type MunicipalitiesFindAllResponse = IbgeMunRaw[];

/** Detalhe de um município: /municipios/{id} */
export const PATH_MUNICIPALITY_FIND_BY_ID =
  'https://servicodados.ibge.gov.br/api/v1/localidades/municipios/{id}';

export type MunicipalityFindByIdPathParams = {
  /** Código IBGE de 7 dígitos, ex. 3100104. */
  id: number | string;
};

export type MunicipalityFindByIdResponse = IbgeMunRaw;
