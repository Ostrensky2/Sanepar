/** Public metadata only; aggregate data is server-only. */
export const RESULTS_08_VERSION = "0.8" as const;
/**
 * Designação do método mostrada ao usuário. Em 2026-11-24 o método 0.8 passou a se chamar 3.0 e o anterior (0.7), 2.0.
 * Só o nome mudou: o cálculo é o mesmo. Arquivos-fonte, schemas e parâmetros de API seguem com "0.8", porque estão
 * presos a hashes e contratos; o que o usuário lê (telas, planilhas, nomes de arquivo) usa este rótulo.
 */
export const METHOD_LABEL = "3.0" as const;
export const PREVIOUS_METHOD_LABEL = "2.0" as const;
export const RESULTS_08_SOURCE_SHA256 = "1ac2a5e8ff3b32f8196ffe632d0037ef5690a8401c652da5744a02ba31595a5c";
export const RESULTS_08_POLICY = "sinal-documentado/1" as const;
export const RESULTS_08_SCHEMA = "agregados-home-export/1" as const;
/** Grupos do arquivo-fonte oficial. `total` existe só para conferir a integridade da fonte; nunca é exibido nem exportado. */
export const RESULTS_08_GROUPS = ["C1", "C2", "C3", "total"] as const;
/** Campanhas são independentes: toda leitura, tela e exportação é por campanha, sem juntar campanhas. */
export const RESULTS_08_CAMPAIGNS = ["C1", "C2", "C3"] as const;
export type Results08Campaign = typeof RESULTS_08_CAMPAIGNS[number];
export const RESULTS_08_SERIES = ["geral08", "ambiental", "operacional", "saude"] as const;
export const RESULTS_08_BANDS = ["[0,0.05)", "[0.05,0.15)", "[0.15,0.35)", "[0.35,0.70)", "[0.70,1]"] as const;
export type Results08Group = typeof RESULTS_08_GROUPS[number];
export type Results08Series = typeof RESULTS_08_SERIES[number];
export type Results08Statistics = { observados: number; numericos: number; nulos: number; minimo: number | null; media: number | null; maximo: number | null; colunas: number[]; faixas: number[] };
export type Results08Aggregate = { versao: "0.8"; politica: typeof RESULTS_08_POLICY; schema: typeof RESULTS_08_SCHEMA; grupos: Record<Results08Group, Record<Results08Series, Results08Statistics>> };
export type Results08HomeStatistics = Results08Statistics & { n: number };
export type Results08HomeDistribution = { versao: "0.8"; politica: typeof RESULTS_08_POLICY; schema: typeof RESULTS_08_SCHEMA; sourceSha256: string; campanhas: Record<Exclude<Results08Group, "total">, Record<"geral" | "ambiental" | "operacional" | "saude", Results08HomeStatistics>> };
