/** Presentation only. Never use the formatted value for calculations or exports. */
export function formatResultIndex(value: unknown, missing = "Não disponível"): string {
  if (value === "NA") return "NA";
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : missing;
}
