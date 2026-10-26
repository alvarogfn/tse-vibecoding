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
  brancos: number;
  nulos: number;
  totalVotos: number;
  comparecimento: number;
  abstencoes: number;
  secoes: number;
  secoesTotal: number;
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

  // Um passe por vez. Antes, o tick de 60 s (ou um topKey novo) iniciava outro
  // passe e invalidava o anterior — se um passe demorasse mais que o intervalo,
  // nenhum chegava ao commit e o mapa nunca atualizava. Agora o passe em voo
  // termina e commita; só uma mudança real dos finalistas entra na fila.
  const inFlightRef = useRef(false);
  const runningKeyRef = useRef('');
  const queuedNumsRef = useRef<string[] | null>(null);

  const fetchUFs = useCallback(async (nums: string[]): Promise<void> => {
    const key = nums.join('|');
    if (inFlightRef.current) {
      // Tick com os mesmos finalistas é ruído; outro conjunto roda em seguida.
      if (key !== runningKeyRef.current) queuedNumsRef.current = nums;
      return;
    }
    inFlightRef.current = true;
    runningKeyRef.current = key;
    setLoading(true);
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
              const finalistas =
                nums?.length >= 2 ? cands.filter((c) => nums.includes(String(c.numero))) : cands.slice(0, 2);
              const win: Candidate | undefined = finalistas.length
                ? [...finalistas].sort((a, b) => b.vap - a.vap)[0]
                : cands[0];
              // Denominador da disputa direta: no 2T = os 2 finalistas (soma dos
              // válidos); no 1T descarta os demais candidatos para a cor da margem.
              const pairVap = finalistas.reduce((s, c) => s + c.vap, 0);
              if (win)
                out[uf] = {
                  numero: String(win.numero),
                  nome: win.nomeUrna,
                  partido: win.partido,
                  pvapNum: win.pvapNum,
                  share2: pairVap > 0 ? (win.vap / pairVap) * 100 : win.pvapNum,
                  pst: parsed.meta?.s?.pst,
                  vap: win.vap,
                };
              // Derivação p/ o preditor (TF.js): apuração, válidos, eleitorado e top-2 local.
              const brancos = parseBrInt(parsed.meta?.v?.vb);
              const nulos = parseBrInt(parsed.meta?.v?.vn);
              const validos = parsed.meta?.validos ?? 0;
              const eleitorado = parseBrInt(parsed.meta?.e?.te ?? 0);
              const comparecimento = parseBrInt(parsed.meta?.e?.c);
              stats[uf] = {
                pst: parseBrPct(parsed.meta?.s?.pst),
                validos,
                // parseBrInt, não Number(): "16.372.372" daria NaN e zerava o
                // peso da UF na agregação bottom-up (M8).
                eleitorado,
                brancos,
                nulos,
                totalVotos: validos + brancos + nulos,
                comparecimento,
                abstencoes: Math.max(0, eleitorado - comparecimento),
                secoes: parseBrInt(parsed.meta?.s?.st),
                secoesTotal: parseBrInt(parsed.meta?.s?.ts),
                top: cands.slice(0, 2).map((c) => ({ numero: String(c.numero), pvapNum: c.pvapNum })),
              };
            } catch {
              /* UF sem dado — mantém neutra */
            }
          }),
        );
        // Commit incremental: o mapa preenche lote a lote e um passe
        // interrompido não descarta o que já foi lido.
        setUfWinners((prev) => ({ ...prev, ...out }));
        setUfStats((prev) => ({ ...prev, ...stats }));
        setUfMeta({ done: Math.min(i + 4, UFS.length), total: UFS.length, at: null });
      }
      setUfWinners((prev) => ({ ...prev, ...out }));
      setUfStats((prev) => ({ ...prev, ...stats }));
      setUfMeta({ done: UFS.length, total: UFS.length, at: new Date().toLocaleTimeString('pt-BR') });
      setError(null);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      const queued = queuedNumsRef.current;
      queuedNumsRef.current = null;
      if (queued) void fetchUFs(queued);
    }
  }, []);

  const topKey = (topNumeros || []).join('|');
  const refetch = useCallback(async (): Promise<void> => {
    await fetchUFs(topKey ? topKey.split('|') : []);
  }, [fetchUFs, topKey]);

  useEffect(() => {
    if (!enabled) return;
    if (!topKey) return;
    void refetch();
  }, [enabled, topKey, refetch]);

  const data: Record<string, UFWinner> = ufWinners;
  return { data, ufWinners, ufStats, ufMeta, meta: ufMeta, error, loading, refetch };
};
