import { useFetch } from '@/hooks/use-fetch.js';
import { mountURL } from '@/helpers/mount-url.js';
import { PATH_MUNICIPALITY_FIND_BY_ID } from '@/api/municipality.js';
import type { MunicipalityFindByIdPathParams, MunicipalityFindByIdResponse } from '@/api/municipality.js';

const FORCE_CACHE: RequestInit = { cache: 'force-cache' };

/** GET do detalhe de um município IBGE por id (JSON puro → useFetch direto). */
export function useMunicipalityFindById(pathParams: MunicipalityFindByIdPathParams) {
  const url = mountURL(PATH_MUNICIPALITY_FIND_BY_ID, { pathParams });
  return useFetch<MunicipalityFindByIdResponse>(url, FORCE_CACHE);
}
