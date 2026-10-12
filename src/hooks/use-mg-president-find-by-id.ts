import { RACE_PRES_MG } from '../lib/second-turn.js';
import { buildRaceFile } from '../api/race.js';
import { useRaceFindById } from './use-race-find-by-id.js';

/** GET fixo: apuração de presidente em MG (endpoint sem params — pathParams aplicados aqui). */
export function useMgPresidentFindById() {
  return useRaceFindById({
    ciclo: RACE_PRES_MG.ciclo,
    ele: RACE_PRES_MG.ele,
    scope: 'mg',
    file: buildRaceFile('mg', '0001', RACE_PRES_MG.ele),
  });
}
