import type { ResultsCampaign } from "./types";

export type CampaignPublicationIdentity = {
  campaignCode: string;
  publicationKey: string;
};

export type CampaignPublicationScopePlan = {
  selectedCampaignCodes: string[];
  add: string[];
  replace: string[];
  unchanged: string[];
  /** @deprecated Use `unchanged`; retained during the v2 integration window. */
  replay: string[];
  preserve: string[];
};

export function planCampaignPublicationScope(
  current: readonly CampaignPublicationIdentity[],
  incoming: readonly CampaignPublicationIdentity[],
): CampaignPublicationScopePlan {
  assertUniqueCampaigns(current, "vigentes");
  assertUniqueCampaigns(incoming, "recebidas");
  if (incoming.length === 0) throw new Error("O lote deve selecionar ao menos uma campanha.");

  const currentByCampaign = new Map(current.map((item) => [item.campaignCode, item.publicationKey]));
  const selectedCampaignCodes = incoming.map((item) => item.campaignCode);
  const selected = new Set(selectedCampaignCodes);
  const add: string[] = [];
  const replace: string[] = [];
  const unchanged: string[] = [];

  for (const item of incoming) {
    const activeKey = currentByCampaign.get(item.campaignCode);
    if (activeKey === undefined) add.push(item.campaignCode);
    else if (activeKey === item.publicationKey) unchanged.push(item.campaignCode);
    else replace.push(item.campaignCode);
  }

  return {
    selectedCampaignCodes,
    add,
    replace,
    unchanged,
    replay: [...unchanged],
    preserve: current.filter((item) => !selected.has(item.campaignCode)).map((item) => item.campaignCode),
  };
}

export function replaceCampaignsByScope(
  current: readonly ResultsCampaign[],
  incoming: readonly ResultsCampaign[],
) {
  assertUniqueCampaigns(current, "vigentes");
  assertUniqueCampaigns(incoming, "recebidas");
  if (incoming.length === 0) throw new Error("O lote deve selecionar ao menos uma campanha.");
  const selected = new Set(incoming.map((campaign) => campaign.campaignCode));
  return [...current.filter((campaign) => !selected.has(campaign.campaignCode)), ...incoming];
}

function assertUniqueCampaigns(
  campaigns: readonly { campaignCode: string }[],
  label: string,
) {
  const seen = new Set<string>();
  for (const campaign of campaigns) {
    if (!campaign.campaignCode) throw new Error(`Código de campanha vazio entre as campanhas ${label}.`);
    if (seen.has(campaign.campaignCode)) {
      throw new Error(`Campanha duplicada entre as campanhas ${label}: ${campaign.campaignCode}.`);
    }
    seen.add(campaign.campaignCode);
  }
}
