import { useMunicipalitiesFindAll } from './use-municipalities-find-all.js';

/** GET fixo: os 853 municípios de MG (uf 31) no IBGE — pathParams aplicados aqui. */
export function useMgMunicipalitiesFindAll() {
  return useMunicipalitiesFindAll({ uf: '31' });
}
