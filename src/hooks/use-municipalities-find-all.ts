import { useFetch } from './use-fetch.js';
import { mountURL } from '../helpers/mount-url.js';
import { PATH_MUNICIPALITIES_FIND_ALL } from '../api/municipality.js';
import type { MunicipalitiesFindAllPathParams, MunicipalitiesFindAllResponse } from '../api/municipality.js';

const FORCE_CACHE: RequestInit = { cache: 'force-cache' };

/** GET da lista de municípios de uma UF (IBGE, JSON puro → useFetch direto). */
export function useMunicipalitiesFindAll(pathParams: MunicipalitiesFindAllPathParams) {
  const url = mountURL(PATH_MUNICIPALITIES_FIND_ALL, { pathParams });
  return useFetch<MunicipalitiesFindAllResponse>(url, FORCE_CACHE);
}
