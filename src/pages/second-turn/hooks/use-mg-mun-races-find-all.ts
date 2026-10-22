import { useState, useEffect, useCallback, useRef } from 'react';
import { parseBrPct } from '@/helpers/election.js';
import { fetchRaceJson, parseRace, parseBrInt } from '@/lib/tse.js';
import type { Candidate } from '@/lib/tse.js';
import { RACE_PRES } from '@/lib/second-turn.js';
import type { UFWinner } from '@/lib/second-turn.js';
import { mountURL } from '@/helpers/mount-url.js';
import { PATH_RACE_FIND_BY_ID, buildMunRaceFile } from '@/api/race.js';
import MUN_TSE from '@/data/mg-mun-tse.json';

export interface MgMunMeta {
  done: number;
  total: number;
  at: string | null;
}

// Fonte de verdade dos 853 municípios: mapa estático IBGE → TSE (5 dígitos).
// Independe do fetch do IBGE (nomes) — sem ele, o mapa pinta com `IBGE {id}`.
const MUN_IDS: string[] = Object.keys(MUN_TSE as Record<string, string>);
const BATCH = 12;

// Fail-Safe contract: per-municipality failures stay neutral (município sem
// dado — mantém cinza), sweep-level failures resolve to error state — never
// throws. Espelha useUfRacesFindAll, mas em 853 arquivos municipais
// (`{uf}{codTse5}-c0001-e{ele}-u` sob `dados/mg/`, padrão validado no 1T).
export const useMgMunRacesFindAll = (topNumeros: string[], enabled: boolean) => {
  const [munWinners, setMunWinners] = useState<Record<string, UFWinner>>({});
  const [munMeta, setMunMeta] = useState<MgMunMeta>({ done: 0, total: MUN_IDS.length, at: null });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Um passe por vez (mesmo padrão da varredura de UFs): o tick de 300 s não
  // cancela um passe em voo — senão um passe mais lento que o intervalo nunca
  // commitava. Mudança real dos finalistas entra na fila.
  const inFlightRef = useRef(false);
  const runningKeyRef = useRef('');
  const queuedNumsRef = useRef<string[] | null>(null);

  const fetchMun = useCallback(async (nums: string[]): Promise<void> => {
    const key = nums.join('|');
    if (inFlightRef.current) {
      if (key !== runningKeyRef.current) queuedNumsRef.current = nums;
      return;
    }
    inFlightRef.current = true;
    runningKeyRef.current = key;
    setLoading(true);
    try {
      const out: Record<string, UFWinner> = {};
      const map = MUN_TSE as Record<string, string>;
      for (let i = 0; i < MUN_IDS.length; i += BATCH) {
        const batch = MUN_IDS.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (ibge): Promise<void> => {
            const cod = map[ibge];
            if (!cod) return;
            const url = mountURL(PATH_RACE_FIND_BY_ID, {
              pathParams: { ciclo: RACE_PRES.ciclo, ele: RACE_PRES.ele, scope: 'mg', file: buildMunRaceFile('mg', cod, '0001', RACE_PRES.ele) },
            });
            try {
              const raw = await fetchRaceJson(url);
              const parsed = parseRace({ ...RACE_PRES, ufFoto: 'mg' }, raw);
              const cands = parsed.candidatos || [];
              const finalistas =
                nums?.length >= 2 ? cands.filter((c) => nums.includes(String(c.numero))) : cands.slice(0, 2);
              const win: Candidate | undefined = finalistas.length
                ? [...finalistas].sort((a, b) => b.vap - a.vap)[0]
                : cands[0];
              const pairVap = finalistas.reduce((s, c) => s + c.vap, 0);
              if (win)
                out[ibge] = {
                  numero: String(win.numero),
                  nome: win.nomeUrna,
                  partido: win.partido,
                  pvapNum: win.pvapNum,
                  share2: pairVap > 0 ? (win.vap / pairVap) * 100 : win.pvapNum,
                  pst: parsed.meta?.s?.pst,
                  vap: win.vap,
                };
            } catch {
              /* município sem dado — mantém neutro */
            }
          }),
        );
        // Commit incremental: 853 municípios pintam ao longo de ~2 min, e um
        // passe interrompido não perde os lotes já lidos.
        setMunWinners((prev) => ({ ...prev, ...out }));
        setMunMeta({ done: Math.min(i + BATCH, MUN_IDS.length), total: MUN_IDS.length, at: null });
      }
      setMunWinners((prev) => ({ ...prev, ...out }));
      setMunMeta({ done: MUN_IDS.length, total: MUN_IDS.length, at: new Date().toLocaleTimeString('pt-BR') });
      setError(null);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      const queued = queuedNumsRef.current;
      queuedNumsRef.current = null;
      if (queued) void fetchMun(queued);
    }
  }, []);

  const topKey = (topNumeros || []).join('|');
  const refetch = useCallback(async (): Promise<void> => {
    await fetchMun(topKey ? topKey.split('|') : []);
  }, [fetchMun, topKey]);

  useEffect(() => {
    if (!enabled) return;
    if (!topKey) return;
    void refetch();
  }, [enabled, topKey, refetch]);

  return { munWinners, munMeta, meta: munMeta, error, loading, refetch };
};
