import type { CampaignHydroMapPoint } from "@/components/campaign-hydro-map";

export function campaignPointMatchesSelectedCampaign(
  point: CampaignHydroMapPoint,
  selectedCampaignId: string,
  selectedCampaignTitle: string,
) {
  const campaignNumber = selectedCampaignId.match(/campanha-(\d+)/)?.[1];
  const normalizedPointCampaign = normalizeCampaignKey(point.campaign);

  return (
    normalizedPointCampaign === normalizeCampaignKey(selectedCampaignTitle) ||
    (campaignNumber ? normalizedPointCampaign === campaignNumber : false)
  );
}

export function normalizeCampaignKey(value: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  return (
    normalized.match(/^\d+$/)?.[0] ??
    normalized.match(/(\d+)\s*(?:a|ª|º)?\s*campanha/)?.[1] ??
    normalized
  );
}
