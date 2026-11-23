export const RESULTS_CONTRACT_VERSION = "yvae-results/2.0" as const;
export const RESULTS_CALCULATION_VERSION = "SANEPAR-INDICE-0.3" as const;
export const RESULTS_CATALOG_VERSION = "SANEPAR-RISCOS-0.3" as const;
export const RESULTS_NUMERIC_TOLERANCE = 1e-9;

export const ANALYTICAL_SETS = ["bacteria", "cyanobacteria", "coi"] as const;
export const RESULT_DOMAINS = ["environmental", "operational", "humanHealth"] as const;

export type AnalyticalSet = (typeof ANALYTICAL_SETS)[number];
export type ResultDomain = (typeof RESULT_DOMAINS)[number];

export type AnalyticalStatus =
  | "approved"
  | "available_unassessed"
  | "inconclusive"
  | "confirmed_failure"
  | "not_performed"
  | "missing_records"
  | "unknown";

export type ResultCompleteness = "complete" | "partial_2" | "partial_1" | "unavailable";

export type ResultRange = {
  value: number | null;
  lower: number;
  upper: number;
};

export type ResultComponent = {
  set: AnalyticalSet;
  status: AnalyticalStatus;
  sourceStatus: string | null;
  reason: string | null;
  totalReads: number;
  recordCount: number;
  included: boolean;
  calculated: Record<ResultDomain, number | null>;
  used: Record<ResultDomain, number | null>;
  bibliographicCoverage: Record<ResultDomain, number | null>;
};

export type ResultPoint = {
  key: string;
  campaignCode: string;
  siaCode: string;
  waterBody: string | null;
  municipality: string | null;
  coordinates: { latitude: number; longitude: number; source: "workbook_metadata" } | null;
  calculationVersion: typeof RESULTS_CALCULATION_VERSION;
  catalogVersion: typeof RESULTS_CATALOG_VERSION;
  completeness: ResultCompleteness;
  availableSetCount: number;
  usedSetCount: number;
  unavailableSets: AnalyticalSet[];
  conditionOfUse: string | null;
  impactedRecordCount: number;
  observations: string | null;
  domains: Record<ResultDomain, ResultRange>;
  overall: ResultRange & { rank: number | null };
  bibliographicCoverage: Record<ResultDomain, number | null>;
  components: Record<AnalyticalSet, ResultComponent>;
  /** Índice de captação 0.8: nota calculada (inclusive zero), sem estimativa ou sem medição. */
  estimateState?: "estimado" | "sem estimativa" | "sem medição";
  /** Perfis de risco biológico operacional e sanitário desta captação nesta campanha. */
  riskProfiles?: { key: string; label: string; state: string; value: number | null; score: string; effects: { id: string; title: string; determining: boolean }[]; otherContributions: number; summary: string }[];
};

export type ResultsCampaign = {
  campaignCode: string;
  points: ResultPoint[];
  counts: {
    total: number;
    complete: number;
    partialWithTwoSets: number;
    partialWithOneSet: number;
    unavailable: number;
  };
};

export type ResultsWorkbookImport = {
  contractVersion: typeof RESULTS_CONTRACT_VERSION;
  calculationVersion: typeof RESULTS_CALCULATION_VERSION;
  catalogVersion: typeof RESULTS_CATALOG_VERSION;
  /** Só em publicações antigas: parâmetros do cálculo anterior. Não é lido nem exibido. */
  parameters?: unknown;
  source: {
    fileName: string;
    sha256: string;
    namespaceRepairApplied: boolean;
  };
  molecularRecordCount: number;
  componentRecordCount: number;
  campaigns: ResultsCampaign[];
  warnings: string[];
};

export type ResultsWorkbookExportModel = {
  contractVersion: typeof RESULTS_CONTRACT_VERSION;
  calculationVersion: typeof RESULTS_CALCULATION_VERSION;
  catalogVersion: typeof RESULTS_CATALOG_VERSION;
  campaignCodes: string[];
  sheets: Array<{ name: string; rows: Array<Array<string | number | boolean | Date | null>> }>;
};
