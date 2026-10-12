/** Erro HTTP com status — lançado pelos fetchers, convertido p/ string nos hooks. */
export class HttpError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
