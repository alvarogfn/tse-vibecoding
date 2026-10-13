import { setupWorker } from 'msw/browser';
import { handlers } from './handlers.js';

/** Worker MSW p/ simular a apuração do 2T (só com ?mock na URL). */
export const worker = setupWorker(...handlers);
