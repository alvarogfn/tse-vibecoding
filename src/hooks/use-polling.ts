import { useEffect, useRef } from 'react';

// Fail-Safe contract: timer-only helper, never throws. Calls the latest fn.
// Interval with enabled flag: when enabled is false no timer is scheduled.
export const usePolling = (fn: () => void, ms: number, enabled: boolean): void => {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      ref.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
};
