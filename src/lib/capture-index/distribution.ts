/** Ordenação empírica: uma observação por ponto medido,
 * posição ceil(p*N) em base 1, sem interpolação ou ponderação por reads. */
export function distribution(values: readonly (number | null)[]) {
  const sorted = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  const quantile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1] ?? null;
  return { count: sorted.length, median: quantile(0.5), p90: quantile(0.9), max: sorted.at(-1) ?? null, sorted };
}
