import { useEffect, useRef } from 'react';

// Fail-Safe contract: timer-only helper, never throws. Calls the latest fn.
// Interval with enabled flag: when enabled is false no timer is scheduled.
// Overlap guard: se um tick ainda está em voo (fetch lento), o próximo é
// pulado — sem isso respostas fora de ordem sobrescrevem dados novos (H3).
export const usePolling = (fn: () => void | Promise<unknown>, ms: number, enabled: boolean): void => {
  const ref = useRef(fn);
  const busy = useRef(false);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (busy.current) return;
      busy.current = true;
      void Promise.resolve()
        .then(() => ref.current())
        .catch(() => {
          // Fail-Safe: erro do tick não quebra o timer (o hook dono exibe).
        })
        .finally(() => {
          busy.current = false;
        });
    }, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
};
