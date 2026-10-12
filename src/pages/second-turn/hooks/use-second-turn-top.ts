import { useMemo, useCallback } from 'react';
import { parseRace } from '../../../lib/tse.js';
import type { ParsedRace } from '../../../lib/tse.js';
import { RACE_PRES, RACE_PRES_MG } from '../../../lib/second-turn.js';
import { useNationalPresidentFindById } from '../../../hooks/use-national-president-find-by-id.js';
import { useMgPresidentFindById } from '../../../hooks/use-mg-president-find-by-id.js';

export interface SecondTurnTopData {
  pres: ParsedRace | null;
  presMG: ParsedRace | null;
}

// Fail-Safe contract: per-race failures resolve to error state — never throws.
// Busca via useNationalPresidentFindById + useMgPresidentFindById (que usam
// useRaceFindById → useFetch); o parse JWS→candidatos continua no hook.
export const useSecondTurnTop = () => {
  const br = useNationalPresidentFindById();
  const mg = useMgPresidentFindById();

  const pres = useMemo(() => (br.data ? parseRace(RACE_PRES, br.data) : null), [br.data]);
  const presMG = useMemo(() => (mg.data ? parseRace(RACE_PRES_MG, mg.data) : null), [mg.data]);

  const presErr = br.error;
  const presMGErr = mg.error;
  const loading = br.loading || mg.loading;

  const refetch = useCallback(async (): Promise<void> => {
    await br.refetch();
    await mg.refetch();
  }, [br.refetch, mg.refetch]);

  const data: SecondTurnTopData | null = pres || presMG ? { pres, presMG } : null;
  const error: string | null = presErr ?? presMGErr ?? null;
  return {
    data,
    pres,
    presMG,
    presErr,
    presMGErr,
    error,
    loading,
    refetch,
  };
};
