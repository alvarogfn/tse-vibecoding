/**
 * Grade de progresso do rollout: u ∈ (0, 1], onde u=0 é o `counted` atual e
 * u=1 é 100%. A grade uniforme gasta o mesmo número de fatias no trecho
 * inicial (onde o modelo muda mais) e no final (onde alpha=1 e o alvo já é
 * exato). A potência p>1 concentra fatias perto de u=0.
 *
 * Exemplo com p=2 e 2000 fatias: as primeiras 0,5 pp do restante recebem
 * ~140 pontos; o trecho final recebe passos maiores, mas ali a atualização
 * já está em alpha=1 (target exato).
 */
export const DEFAULT_PROGRESS_EXPONENT = 2;

export function buildProgressSchedule(
  slices: number,
  exponent: number = DEFAULT_PROGRESS_EXPONENT,
): number[] {
  const n =
    Number.isFinite(slices) && slices > 0 ? Math.max(1, Math.floor(slices)) : 1;
  const p =
    Number.isFinite(exponent) && exponent >= 1
      ? Math.min(4, exponent)
      : DEFAULT_PROGRESS_EXPONENT;
  return Array.from({ length: n }, (_, index) => Math.pow((index + 1) / n, p));
}
