import { HttpError } from '@/helpers/http-error.js';
import type { TseRawPayload } from '@/lib/tse.js';

/** Decodifica o payload de um JWS do TSE (texto `header.payload.sig` → JSON). Puro, sem lifecycle. */
export function decodeJwsPayload(text: string): TseRawPayload {
  const parts = text.trim().split('.');
  if (parts.length < 2) throw new HttpError('JWS inválido');
  return b64UrlDecodeToJson(parts[1]);
}

function b64UrlDecodeToJson(b64: string): TseRawPayload {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(pad);
  } catch {
    throw new HttpError('JWS inválido: base64 quebrado');
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const text = new TextDecoder('utf-8').decode(bytes);
  try {
    return JSON.parse(text) as TseRawPayload;
  } catch {
    throw new HttpError('JWS inválido: payload não é JSON');
  }
}
