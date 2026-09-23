import type { AnalyticalSet, ResultsCampaign, ResultPoint } from "@/modules/results/types";
export type MolecularTaxonSummary = { taxon: string; reads: number; positivePoints: number; denominatorPoints: number };
export type MolecularHeatCell = { sia: string; taxon: string; reads: number; denominator: number; proportion: number | null; state: "absent" | "unusable" | "no-denominator" | "zero" | "observed" };
export type ResultsSourceAnalytics = {
  campaignTaxa: number;
  pointMetadata: { sia: string; source: {sheet: string; row: number}; values: Record<string,string|number|boolean|null> }[];
  source: import("./results-publication-contract").ResultsSourceIdentity;
  calculationVersion: string; catalogVersion: string; campaignCode: string; set: AnalyticalSet;
  summary: { points: number; municipalities: number; waterBodies: number; taxa: number; records: number; reads: number; pointsWithRecords: number; usablePoints: number; included: number; excluded: number; mean: number | null; median: number | null; histogram: { lower: number; upper: number; count: number }[] };
  topReads: MolecularTaxonSummary[]; topFrequency: MolecularTaxonSummary[];
  taxaTotal: number; taxaFiltered: number;
  heatmap: { cells: MolecularHeatCell[]; pointsTotal: number; taxaTotal: number; pointOffset: number; taxonOffset: number; pageSize: number };
  contributions: { sia: string; taxon: string; reads: number; denominator: number; domain: string; score: number | null; q: number | null }[];
  contributionsTotal: number;
  pointLeaders: {
    sia: string;
    bySet: Record<AnalyticalSet, { reads: number; top: { taxon: string; reads: number }[] }>;
    /** Maiores q = (reads/N) × (score/3), somente em conjuntos utilizados e com score numérico. */
    contributors: { taxon: string; set: AnalyticalSet; domain: string; share: number; score: number; q: number }[];
  }[];
  history: { campaignCode: string; calculationVersion: string; catalogVersion: string; point?: ResultPoint; counts: ResultsCampaign["counts"]; included: number; excluded: number; mean: number | null; median: number | null; siaUniverse: string[]; readsBySet: Record<string,number>; protocolCompatibility: "not-established" }[];
  coordinateWarnings: { sia: string; reason: string }[];
  limitations: string[];
};
