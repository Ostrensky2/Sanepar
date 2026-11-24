/** Contrato da consulta de organismos por campanha (matrizes por SIA do Marcio). Comum ao servidor e ao navegador. */
export type OrganismMarker = "16S" | "COI";
export type OrganismLevel = "genero" | "familia" | "risco" | "exoticas";
export const ORGANISM_LEVELS: Record<OrganismMarker, readonly OrganismLevel[]> = { "16S": ["risco", "genero", "familia"], COI: ["exoticas", "genero", "familia"] };
export const organismMarkerLabels: Record<OrganismMarker, string> = { "16S": "16S (bactérias)", COI: "COI (animais)" };
export const organismLevelLabels: Record<OrganismLevel, string> = { risco: "Grupos de risco", exoticas: "Exóticas (espécie)", genero: "Gênero", familia: "Família" };
export const exoticCategoryLabels = { confirmada: "Exótica confirmada", pendente: "Status regional pendente", candidata: "Candidata, espécie não resolvida" } as const;

export type OrganismSummary = { name: string; points: number; sias: string[]; reads: number; maxShare: number; maxShareSia: string; unresolved?: true; category?: keyof typeof exoticCategoryLabels };
export type OrganismsCampaign = { campaign: number; source: string;
  markers: Record<OrganismMarker, { points: number; usablePoints: number; inconclusive: string[]; runs: string[]; levels: Partial<Record<OrganismLevel, OrganismSummary[]>> }> };
export type OrganismOccurrences = { campaign: number; marker: OrganismMarker; level: OrganismLevel; name: string;
  rows: { sia: string; reads: number; total: number; share: number | null; run: string; inconclusive: boolean }[] };
