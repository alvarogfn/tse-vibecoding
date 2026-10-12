import { useState, useEffect, useCallback } from 'react';
import { fetchRaceJson, parseRace } from '../../../lib/tse.js';
import type { ParsedRace } from '../../../lib/tse.js';
import { RACE_PRES, RACE_PRES_MG } from '../../../lib/second-turn.js';

export interface SecondTurnTopData {
  pres: ParsedRace | null;
  presMG: ParsedRace | null;
}

// Fail-Safe contract: per-race failures resolve to error state — never throws.
// Cannot use useFetch because TSE payloads are JWS text (response.text() +
// base64url decode + JSON.parse via fetchRaceJson), not plain response.json().
export const useSecondTurnTop = () => {
  const [pres, setPres] = useState<ParsedRace | null>(null);
  const [presMG, setPresMG] = useState<ParsedRace | null>(null);
  const [presErr, setPresErr] = useState<string | null>(null);
  const [presMGErr, setPresMGErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTop = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const raw = await fetchRaceJson(RACE_PRES.url);
      setPres(parseRace(RACE_PRES, raw));
      setPresErr(null);
    } catch (e: unknown) {
      setPresErr(String((e as Error)?.message || e));
    }
    try {
      const raw = await fetchRaceJson(RACE_PRES_MG.url);
      setPresMG(parseRace(RACE_PRES_MG, raw));
      setPresMGErr(null);
    } catch (e: unknown) {
      setPresMGErr(String((e as Error)?.message || e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTop();
  }, [fetchTop]);

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
    refetch: fetchTop,
  };
};
