import type { ResultsPublication, ResultsViewModel } from "@/lib/imports/results-contract";
import type { ResultsPublicationV2, StoredResultsCampaignV2 } from "@/lib/results-v2-persistence";

export type LegacyPublishedResponse = { status: "published"; format?: "legacy-v1"; publicationId?: string; publication: ResultsPublication; viewModel: ResultsViewModel; campaign?: null; sourceAvailability?: "missing_source_artifact" };
export type V2PublishedResponse = { status: "published"; format?: "v2"; publication: ResultsPublicationV2; campaign: StoredResultsCampaignV2 };
export type PublishedResultsResponse = LegacyPublishedResponse | V2PublishedResponse | { status: "empty"; publication: null; campaign?: null; viewModel?: null };

export function isPublishedLegacyResponse(response: PublishedResultsResponse | null): response is LegacyPublishedResponse {
  return response?.status === "published" && response.format !== "v2" && "viewModel" in response && !!response.viewModel;
}
export function isPublishedV2Response(response: PublishedResultsResponse | null): response is V2PublishedResponse {
  return response?.status === "published" && response.format !== "legacy-v1" && "campaign" in response && !!response.campaign && !("viewModel" in response);
}
