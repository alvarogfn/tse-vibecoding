import { http, HttpResponse, passthrough } from 'msw';
import { advance, nationalPayload, ufPayload } from './tse-2t.js';

const BASE_6258 = 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados';

/**
 * Mock do 2º turno: só intercepta ele6258/dados (nacional + UFs). Todo o resto
 * (1T, IBGE, mapas, fotos) passa direto p/ a rede (onUnhandledRequest: bypass).
 */
export const handlers = [
  http.get(`${BASE_6258}/br/br-c0001-e006258-u.jws`, () => {
    advance();
    return HttpResponse.text(nationalPayload());
  }),
  http.get(`${BASE_6258}/:scope/:file`, ({ params }) => {
    const scope = String(params.scope).toLowerCase();
    const file = String(params.file);
    if (scope === 'br') {
      advance();
      return HttpResponse.text(nationalPayload());
    }
    const m = file.match(/^([a-z]{2})-c0001-e006258-u$/);
    if (!m || m[1] !== scope) return passthrough();
    const body = ufPayload(m[1] as string);
    if (body == null) return passthrough();
    return HttpResponse.text(body);
  }),
];
