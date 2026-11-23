/** Public metadata only; aggregate data is server-only. */
export const RESULTS_08_VERSION = "0.8" as const;
export const RESULTS_08_SOURCE_SHA256 = "5667da69789821f2744812e516282e54fdb73008e8cdb80051801931af455308";
export const RESULTS_08_POLICY = "sinal-documentado/1" as const;
export const RESULTS_08_SCHEMA = "agregados-home-export/1" as const;
export const RESULTS_08_GROUPS = ["C1", "C2", "C3", "total"] as const;
export const RESULTS_08_SERIES = ["geral08", "ambiental", "operacional", "saude"] as const;
export const RESULTS_08_BANDS = ["[0,0.05)", "[0.05,0.15)", "[0.15,0.35)", "[0.35,0.70)", "[0.70,1]"] as const;
export type Results08Group = typeof RESULTS_08_GROUPS[number];
export type Results08Series = typeof RESULTS_08_SERIES[number];
export type Results08Statistics = { observados: number; numericos: number; nulos: number; minimo: number | null; media: number | null; maximo: number | null; colunas: number[]; faixas: number[] };
export type Results08Aggregate = { versao: "0.8"; politica: typeof RESULTS_08_POLICY; schema: typeof RESULTS_08_SCHEMA; grupos: Record<Results08Group, Record<Results08Series, Results08Statistics>> };
export type Results08HomeStatistics = Results08Statistics & { n: number };
export type Results08HomeDistribution = { versao: "0.8"; politica: typeof RESULTS_08_POLICY; schema: typeof RESULTS_08_SCHEMA; sourceSha256: string; campanhas: Record<Exclude<Results08Group, "total">, Record<"geral" | "ambiental" | "operacional" | "saude", Results08HomeStatistics>> };
