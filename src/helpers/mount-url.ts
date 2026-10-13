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
 * Troca global + encode (M9): placeholder repetido, valor com `$&` e chave
 * com typo (`{scpoe}`) não geram mais URL silenciosamente errada — o que
 * sobrar sem preencher lança em vez de virar 404 mudo.
 */
export function mountURL(base: string, params?: MountURLParams): string {
  let url = base;

  for (const [key, value] of Object.entries(params?.pathParams ?? {})) {
    url = url.split(`{${key}}`).join(encodeURIComponent(String(value)));
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params?.queryParams ?? {})) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`;
  const leftover = url.match(/\{[^{}]+\}/);
  if (leftover) throw new Error(`mountURL: placeholder não preenchido ${leftover[0]} em "${url}"`);
  return url;
}
