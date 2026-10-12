import type { TseRawPayload } from '../lib/tse.js';

/** Arquivo único de apuração TSE (JWS): /oficial/{ciclo}/{ele}/dados/{scope}/{file}.jws */
export const PATH_RACE_FIND_BY_ID =
  'https://resultados.tse.jus.br/oficial/{ciclo}/{ele}/dados/{scope}/{file}.jws';

export type RaceFindByIdPathParams = {
  ciclo: string;
  ele: string;
  /** Abrangência: 'br' p/ nacional, sigla da UF p/ estadual. */
  scope: string;
  /** Nome do arquivo sem extensão, ex. 'br-c0001-e006257-u'. */
  file: string;
};

export type RaceFindByIdResponse = TseRawPayload;

/** Monta o nome do arquivo TSE: `{scope}-c{cargo}-e{ele6}-u` (ex. cargo '0001' = presidente). */
export function buildRaceFile(scope: string, cargo: string, ele: string): string {
  return `${scope}-c${cargo}-e${ele.padStart(6, '0')}-u`;
}
