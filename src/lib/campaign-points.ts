import type { CampaignHydroMapPoint } from "@/components/campaign-hydro-map";
import { normalizeCampaignKey } from "@/lib/campaign-identity";

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

export { normalizeCampaignKey };
