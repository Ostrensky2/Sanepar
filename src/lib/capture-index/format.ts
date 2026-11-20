/** Formatação única do índice de triagem. `sem medição` quando não há biblioteca utilizável; `0,00` zero calculado;
 * `<0,01` positivo abaixo de 0,01. Arredonda só na apresentação, meio para cima, a duas casas.
 * O valor é um escore de 0 a 1: não é porcentagem nem probabilidade de dano. */
export function formatCaptureIndex(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return "sem medição";
  if (value === 0) return "0,00";
  if (value < 0.01) return "<0,01";
  const cents = Math.floor(value * 100 + 0.5 + 1e-9);
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

export function formatCaptureShare(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "sem dado";
  if (value === 0) return "0%";
  if (value < 0.001) return "<0,1%";
  return `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
