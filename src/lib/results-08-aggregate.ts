import "server-only";
import { createHash } from "node:crypto";
import source from "./results-08-aggregate.json";
import { RESULTS_08_GROUPS, RESULTS_08_SERIES, RESULTS_08_SOURCE_SHA256, RESULTS_08_POLICY, RESULTS_08_SCHEMA, type Results08Aggregate, type Results08HomeDistribution } from "./results-08-contract";

export function validateResults08Aggregate(value: unknown): Results08Aggregate {
  if (!value || typeof value !== "object") throw new Error("Agregado 0.8 inválido.");
  const data = value as Results08Aggregate;
  if (Object.keys(data).sort().join(",") !== "grupos,politica,schema,versao" || data.versao !== "0.8" || data.politica !== RESULTS_08_POLICY || data.schema !== RESULTS_08_SCHEMA) throw new Error("Proveniência 0.8 inválida.");
  if (!data.grupos || Object.keys(data.grupos).sort().join() !== [...RESULTS_08_GROUPS].sort().join()) throw new Error("Grupos 0.8 inválidos.");
  for (const group of RESULTS_08_GROUPS) {
    const series = data.grupos[group];
    if (!series || Object.keys(series).sort().join() !== [...RESULTS_08_SERIES].sort().join()) throw new Error("Séries 0.8 inválidas.");
    for (const key of RESULTS_08_SERIES) {
      const stats = series[key];
      if (!stats || Object.keys(stats).sort().join() !== "colunas,faixas,maximo,media,minimo,nulos,numericos,observados" || [stats.observados, stats.numericos, stats.nulos].some(n => !Number.isInteger(n) || n < 0) || stats.observados !== stats.numericos + stats.nulos) throw new Error("Denominador 0.8 inválido.");
      for (const [bins, size] of [[stats.faixas, 5], [stats.colunas, 40]] as const) if (!Array.isArray(bins) || bins.length !== size || bins.some(n => !Number.isInteger(n) || n < 0) || bins.reduce((a, b) => a + b, 0) !== stats.numericos) throw new Error("Bins incluem ausentes ou contagens inválidas.");
      if (stats.numericos === 0) { if ([stats.minimo, stats.media, stats.maximo].some(n => n !== null)) throw new Error("Ausência não pode virar zero."); }
      else if ([stats.minimo, stats.media, stats.maximo].some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1) || stats.minimo! > stats.media! || stats.media! > stats.maximo!) throw new Error("Estatística 0.8 inválida.");
      const boundaries = [0, 2, 6, 14, 28, 40];
      if (stats.faixas.some((n, i) => n !== stats.colunas.slice(boundaries[i], boundaries[i + 1]).reduce((a, b) => a + b, 0))) throw new Error("Faixas divergem da distribuição.");
    }
  }
  for (const key of RESULTS_08_SERIES) {
    for (const count of ["observados", "numericos", "nulos"] as const) if (data.grupos.total[key][count] !== data.grupos.C1[key][count] + data.grupos.C2[key][count] + data.grupos.C3[key][count]) throw new Error("Denominador agregado divergente.");
    for (let i = 0; i < 40; i++) if (data.grupos.total[key].colunas[i] !== data.grupos.C1[key].colunas[i] + data.grupos.C2[key].colunas[i] + data.grupos.C3[key].colunas[i]) throw new Error("Total de bins divergente.");
  }
  return structuredClone(data);
}
/** Frozen E8 projection: no derivation from bins or point-level data. */
export function results08Aggregate() {
  // Hash of the canonical JSON projection, distinct from E8's original-file hash.
  if (createHash("sha256").update(JSON.stringify(source)).digest("hex") !== "9382ada8ea0cc5169d8541a6cf671b5834eecae298a837c11f49ea37fcbb2e4a") throw new Error("Projeção oficial 0.8 divergente.");
  return validateResults08Aggregate(source);
}

/** Home and downloads share this exact source. n aliases numericos, never observados. */
export function results08HomeDistribution(): Results08HomeDistribution {
  const data = results08Aggregate();
  const campanhas = Object.fromEntries((["C1", "C2", "C3"] as const).map(group => [group, Object.fromEntries(RESULTS_08_SERIES.map(series => [series === "geral08" ? "geral" : series, { ...data.grupos[group][series], n: data.grupos[group][series].numericos }]))])) as Results08HomeDistribution["campanhas"];
  return { versao: data.versao, politica: data.politica, schema: data.schema, sourceSha256: RESULTS_08_SOURCE_SHA256, campanhas };
}
