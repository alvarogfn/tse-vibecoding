export interface MountURLParams {
  /** Substitui `{key}` no path: `/estados/{uf}/municipios` + { uf: '31' }. */
  pathParams?: Record<string, unknown>;
  /** Acrescenta `?key=value` (ignora undefined/null). */
  queryParams?: Record<string, unknown>;
}

/**
 * Monta URLs a partir de um template + parâmetros.
 * Suporta path params (`{key}`) e query params — o exemplo original da
 * especificação construía `URLSearchParams` mas nunca o anexava à URL,
 * então query params eram silenciosamente descartados. Aqui vão p/ a query.
 */
export function mountURL(base: string, params?: MountURLParams): string {
  let url = base;

  for (const [key, value] of Object.entries(params?.pathParams ?? {})) {
    url = url.replace(`{${key}}`, String(value));
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params?.queryParams ?? {})) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}
