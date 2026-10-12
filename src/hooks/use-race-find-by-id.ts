import { useFetch } from '@/hooks/use-fetch.js';
import { mountURL } from '@/helpers/mount-url.js';
import { PATH_RACE_FIND_BY_ID } from '@/api/race.js';
import type { RaceFindByIdPathParams, RaceFindByIdResponse } from '@/api/race.js';
import { decodeJwsPayload } from '@/helpers/jws.js';

const NO_STORE: RequestInit = { cache: 'no-store' };
const decodeJwsText = (res: Response): Promise<RaceFindByIdResponse> =>
  res.text().then((t) => decodeJwsPayload(t.trim()));

/**
 * GET de um arquivo de apuração TSE (JWS) — mesma shape { data, error, loading, refetch }.
 * Usa useFetch com parser JWS (texto + base64url decode), pois o payload TSE
 * não é JSON puro e não passa por response.json().
 */
export function useRaceFindById(pathParams: RaceFindByIdPathParams) {
  const url = mountURL(PATH_RACE_FIND_BY_ID, { pathParams });
  return useFetch<RaceFindByIdResponse>(url, NO_STORE, decodeJwsText);
}
