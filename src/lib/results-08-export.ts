import "server-only";
import { METHOD_LABEL, RESULTS_08_BANDS, RESULTS_08_CAMPAIGNS, RESULTS_08_SERIES, RESULTS_08_SOURCE_SHA256, type Results08Aggregate, type Results08Campaign } from "./results-08-contract";

/** Uma linha por campanha e série. As campanhas nunca são somadas. */
export function results08Csv(data: Results08Aggregate, group?: Results08Campaign): string {
  const rows: (string | number)[][] = [["versao", "politica", "campanha", "serie", "observados", "numericos", "nulos", "minimo", "media", "maximo", ...RESULTS_08_BANDS, ...Array.from({ length: 40 }, (_, i) => `bin_${String(i + 1).padStart(2, "0")}`), "fonte_sha256"]];
  for (const key of group ? [group] : RESULTS_08_CAMPAIGNS) for (const series of RESULTS_08_SERIES) {
    const stats = data.grupos[key][series];
    rows.push([METHOD_LABEL, data.politica, key, series === "geral08" ? "geral" : series, stats.observados, stats.numericos, stats.nulos, stats.minimo ?? "", stats.media ?? "", stats.maximo ?? "", ...stats.faixas, ...stats.colunas, RESULTS_08_SOURCE_SHA256]);
  }
  return "\uFEFF" + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
}
