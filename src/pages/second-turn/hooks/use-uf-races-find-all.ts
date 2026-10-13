import { useState, useEffect, useCallback, useRef } from 'react';
import { parseBrPct } from '@/helpers/election.js';
import { UFS, fetchRaceJson, parseRace, parseBrInt } from '@/lib/tse.js';
import type { Candidate } from '@/lib/tse.js';
import { RACE_PRES } from '@/lib/second-turn.js';
import type { UFWinner, UFMeta } from '@/lib/second-turn.js';
import { mountURL } from '@/helpers/mount-url.js';
import { PATH_RACE_FIND_BY_ID, buildRaceFile } from '@/api/race.js';

export interface UfRaceStat {
  pst: number;
  validos: number;
  eleitorado: number;
  top: Array<{ numero: string; pvapNum: number }>;
}

// Fail-Safe contract: per-UF failures stay neutral (UF sem dado — mantém neutra),
// sweep-level failures resolve to error state — never throws.
// Find-all das 27 UFs: mesma shape { data, error, loading, refetch }. Não cabe num
// useFetch único porque é uma varredura em lotes de 4 com meta de progresso, onde
// cada arquivo é um payload TSE JWS (texto + decode) agregado num mapa de vencedores.
// As URLs saem do catálogo /api via mountURL (pathParams por UF).
export const useUfRacesFindAll = (topNumeros: string[], enabled: boolean) => {
  const [ufWinners, setUfWinners] = useState<Record<string, UFWinner>>({});
  const [ufStats, setUfStats] = useState<Record<string, UfRaceStat>>({});
  const [ufMeta, setUfMeta] = useState<UFMeta>({ done: 0, total: UFS.length, at: null });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Geração do passe: varreduras sobrepostas (StrictMode, intervalo de 60s,
  // topKey novo) resolvem por último-vencedor — só a geração atual commita (M3).
  const genRef = useRef(0);

  const fetchUFs = useCallback(async (nums: string[]): Promise<void> => {
    const gen = genRef.current + 1;
    genRef.current = gen;
    const alive = (): boolean => gen === genRef.current;
    // Colore cada UF pelo vencedor entre os 2 finalistas (ou líder local se 2T ainda sem ele próprio)
    try {
      const out: Record<string, UFWinner> = {};
      const stats: Record<string, UfRaceStat> = {};
      for (let i = 0; i < UFS.length; i += 4) {
        const batch = UFS.slice(i, i + 4);
        await Promise.all(
          batch.map(async ([uf]): Promise<void> => {
            const url = mountURL(PATH_RACE_FIND_BY_ID, {
              pathParams: { ciclo: RACE_PRES.ciclo, ele: RACE_PRES.ele, scope: uf, file: buildRaceFile(uf, '0001', RACE_PRES.ele) },
            });
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
              // Derivação p/ o preditor (TF.js): apuração, válidos, eleitorado e top-2 local.
              stats[uf] = {
                pst: parseBrPct(parsed.meta?.s?.pst),
                validos: parsed.meta?.validos ?? 0,
                // parseBrInt, não Number(): "16.372.372" daria NaN e zerava o
                // peso da UF na agregação bottom-up (M8).
                eleitorado: parseBrInt(parsed.meta?.e?.te ?? 0),
                top: cands.slice(0, 2).map((c) => ({ numero: String(c.numero), pvapNum: c.pvapNum })),
              };
            } catch {
              /* UF sem dado — mantém neutra */
            }
          }),
        );
        const done = Math.min(i + 4, UFS.length);
        if (!alive()) return;
        setUfMeta({ done, total: UFS.length, at: null });
      }
      if (!alive()) return;
      setUfWinners(out);
      setUfStats(stats);
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
  return { data, ufWinners, ufStats, ufMeta, meta: ufMeta, error, loading, refetch };
};
