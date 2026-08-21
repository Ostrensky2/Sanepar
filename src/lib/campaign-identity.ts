const canonicalCampaigns = [
  { id: "campanha-1-verao-2026", name: "1ª Campanha - Verão 2026" },
  { id: "campanha-2-outono-2026", name: "2ª Campanha - Outono 2026" },
  { id: "campanha-3", name: "3ª Campanha - Inverno 2026" },
  { id: "campanha-4", name: "4ª Campanha - Primavera 2026" },
  { id: "campanha-5", name: "5ª Campanha - Verão 2027" },
  { id: "campanha-6", name: "6ª Campanha - Outono 2027" },
  { id: "campanha-7", name: "7ª Campanha - Inverno 2027" },
  { id: "campanha-8", name: "8ª Campanha - Primavera 2027" },
  { id: "campanha-9", name: "9ª Campanha - Verão 2028" },
] as const;

export type CanonicalCampaign = (typeof canonicalCampaigns)[number];

export function normalizeCampaignKey(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    normalized.match(/^\d+$/)?.[0] ??
    normalized.match(/(\d+)\s*(?:a|ª|º)?\s*campanha/)?.[1] ??
    normalized.match(/campanha\s*(\d+)/)?.[1] ??
    normalized
  );
}

export function resolveCanonicalCampaign(value: unknown): CanonicalCampaign | null {
  const key = normalizeCampaignKey(value);

  if (!key) {
    return null;
  }

  return (
    canonicalCampaigns.find(
      (campaign) =>
        normalizeCampaignKey(campaign.id) === key ||
        normalizeCampaignKey(campaign.name) === key,
    ) ?? null
  );
}

export function campaignIdentityKey(campaignId: unknown, campaignName: unknown) {
  const canonical = resolveCanonicalCampaign(campaignId) ?? resolveCanonicalCampaign(campaignName);

  return canonical?.id ?? (normalizeCampaignKey(campaignId) || normalizeCampaignKey(campaignName));
}

export function campaignIdentityMatches(
  candidate: { campaignId?: string | null; campaignName?: string | null },
  target: { campaignId?: string | null; campaignName?: string | null },
) {
  const candidateKey = campaignIdentityKey(candidate.campaignId, candidate.campaignName);
  const targetKey = campaignIdentityKey(target.campaignId, target.campaignName);

  return Boolean(candidateKey && targetKey && candidateKey === targetKey);
}
