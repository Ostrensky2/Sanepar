/**
 * Formatação numérica de exibição do aplicativo: no máximo três casas decimais.
 * Apenas apresentação — nunca use o texto formatado em cálculos ou exportações XLSX.
 */
const MAX_DECIMALS = 3;

/**
 * Coordenadas nunca são arredondadas: precisam da precisão completa para localizar o ponto exato de coleta.
 * Reconhece rótulos como "Latitude", "Longitude efetiva", "Coordenadas", "lat", "lon".
 */
export function isCoordinateField(label: string) {
  return /latitude|longitude|coordenad|^\s*(lat|lon|lng)\b/i.test(label);
}

export function formatNumber(value: number, maximumFractionDigits = MAX_DECIMALS): string {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.min(maximumFractionDigits, MAX_DECIMALS);
  const smallest = 10 ** -digits;
  // Valores diferentes de zero menores que a última casa exibida não viram "0".
  if (value !== 0 && Math.abs(value) < smallest / 2) {
    const limit = smallest.toLocaleString("pt-BR", { maximumFractionDigits: digits });
    return value > 0 ? `< ${limit}` : `> −${limit}`;
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

/** Proporção 0–1 exibida como percentual com até uma casa decimal (ex.: 0,006 → "0,6%"). */
export function formatProportionAsPercent(proportion: number): string {
  if (!Number.isFinite(proportion)) return "—";
  return `${formatNumber(proportion * 100, 1)}%`;
}

/** "1 ponto" / "3 pontos": número em pt-BR com a palavra no singular ou no plural (sem "ponto(s)"). */
export function countLabel(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString("pt-BR")} ${value === 1 ? singular : plural}`;
}
