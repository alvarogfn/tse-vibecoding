import { RACE_PRES } from '@/lib/second-turn.js';
import { buildRaceFile } from '@/api/race.js';
import { useRaceFindById } from '@/hooks/use-race-find-by-id.js';

/** GET fixo: apuração nacional de presidente (endpoint sem params — pathParams aplicados aqui). */
export function useNationalPresidentFindById() {
  return useRaceFindById({
    ciclo: RACE_PRES.ciclo,
    ele: RACE_PRES.ele,
    scope: 'br',
    file: buildRaceFile('br', '0001', RACE_PRES.ele),
  });
}
