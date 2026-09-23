import type { ResultsCampaign } from "@/modules/results/types";

export type ResultsExpectedHeads = Record<string, string | null>;
export type ResultsInventoryItem = {
  campaignCode: string;
  canonicalId: string;
  canonicalName: string;
  publicationId: string;
  publishedAt: string;
  format?: "v2" | "legacy-v1";
  sourceAvailability?: "available" | "missing_source_artifact";
  source: { sha256: string | null; fileName: string };
  counts: { total: number } & { [K in Exclude<keyof ResultsCampaign["counts"], "total">]: number | null };
  downloadAvailable: boolean;
};
export type ResultsInventoryResponse = {
  campaigns: ResultsInventoryItem[];
  totalCampaigns: number;
  publishedCount: number;
  expectedHeads: ResultsExpectedHeads;
  historicalPublications?: Array<{
    publicationId: string;
    createdAt: string;
    format: "legacy-array" | "legacy-v1" | "v2" | "unrecognized";
    campaignCode: null;
    recordCount: number | null;
    sourceAvailability: "unavailable_in_history";
  }>;
};
export type ResultsSourceIdentity = {
  kind: "local-corrected-preview" | "published";
  sha256: string;
  published: boolean;
  publicationId?: string;
};
