import { useState, useEffect, useCallback } from 'react';
import { UFS, fetchRaceJson, parseRace } from '../../../lib/tse.js';
import type { Candidate } from '../../../lib/tse.js';
import { RACE_PRES } from '../../../lib/second-turn.js';
import type { UFWinner, UFMeta } from '../../../lib/second-turn.js';

// Fail-Safe contract: per-UF failures stay neutral (UF sem dado — mantém neutra),
// sweep-level failures resolve to error state — never throws.
// Cannot use useFetch because this is a 27-file batched sweep (lots of 4, progress
// meta) where each file is a TSE JWS payload (text + base64 decode), aggregated
// into a winners map — not a single response.json().
export const useUfWinners = (topNumeros: string[], enabled: boolean) => {
  const [ufWinners, setUfWinners] = useState<Record<string, UFWinner>>({});
  const [ufMeta, setUfMeta] = useState<UFMeta>({ done: 0, total: UFS.length, at: null });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUFs = useCallback(async (nums: string[]): Promise<void> => {
    // Colore cada UF pelo vencedor entre os 2 finalistas (ou líder local se 2T ainda sem ele próprio)
    try {
      const out: Record<string, UFWinner> = {};
      for (let i = 0; i < UFS.length; i += 4) {
        const batch = UFS.slice(i, i + 4);
        await Promise.all(
          batch.map(async ([uf]): Promise<void> => {
            const url = `https://resultados.tse.jus.br/oficial/ele2026/6257/dados/${uf}/${uf}-c0001-e006257-u.jws`;
            try {
              const raw = await fetchRaceJson(url);
              const parsed = parseRace({ ...RACE_PRES, ufFoto: uf }, raw);
              const cands = parsed.candidatos || [];
              let win: Candidate | undefined = cands[0];
              if (nums?.length >= 2) {
                const finalistas = cands.filter((c) => nums.includes(String(c.numero)));
                if (finalistas.length) win = finalistas.sort((a, b) => b.vap - a.vap)[0];
              }
              if (win)
                out[uf] = {
                  numero: String(win.numero),
                  nome: win.nomeUrna,
                  partido: win.partido,
                  pvapNum: win.pvapNum,
                  pst: parsed.meta?.s?.pst,
                  vap: win.vap,
                };
            } catch {
              /* UF sem dado — mantém neutra */
            }
          }),
        );
        const done = Math.min(i + 4, UFS.length);
        setUfMeta({ done, total: UFS.length, at: null });
      }
      setUfWinners(out);
      setUfMeta({ done: UFS.length, total: UFS.length, at: new Date().toLocaleTimeString('pt-BR') });
      setError(null);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    }
  }, []);

  const topKey = (topNumeros || []).join('|');
  const refetch = useCallback(async (): Promise<void> => {
    setLoading(true);
    await fetchUFs(topKey ? topKey.split('|') : []);
    setLoading(false);
  }, [fetchUFs, topKey]);

  useEffect(() => {
    if (!enabled) return;
    if (!topKey) return;
    setLoading(true);
    fetchUFs(topKey.split('|')).finally(() => setLoading(false));
  }, [enabled, topKey, fetchUFs]);

  const data: Record<string, UFWinner> = ufWinners;
  return { data, ufWinners, ufMeta, meta: ufMeta, error, loading, refetch };
};
