import { createHash } from "node:crypto";
import {
  RESULTS_CALCULATION_VERSION,
  RESULTS_CATALOG_VERSION,
  RESULTS_CONTRACT_VERSION,
  type ResultPoint,
  type ResultsWorkbookImport,
} from "@/modules/results";


export type StoredResultsCampaignV2 = {
  campaignCode: string;
  points: ResultPoint[] | null;
  counts: ResultsWorkbookImport["campaigns"][number]["counts"];
};

export type ResultsPublicationV2 = Omit<ResultsWorkbookImport, "campaigns"> & {
  publicationId: string;
  publishedAt: string;
  campaigns: StoredResultsCampaignV2[];
  scope: {
    campaignCodes: string[];
    campaignHashes: Record<string, string>;
  };
};

export type ResultsPublicationScopePlan = {
  add: string[];
  replace: string[];
  preserve: string[];
  unchanged: string[];
};

export type ResultsPublicationV2Row = {
  id: string;
  points: unknown;
  created_at: string;
};

export function buildResultsPublicationV2(
  parsed: ResultsWorkbookImport,
  requestedCampaignCodes?: readonly string[],
  publishedAt = new Date().toISOString(),
): ResultsPublicationV2 {
  if (
    parsed.contractVersion !== RESULTS_CONTRACT_VERSION ||
    parsed.calculationVersion !== RESULTS_CALCULATION_VERSION ||
    parsed.catalogVersion !== RESULTS_CATALOG_VERSION
  ) {
    throw new Error("As versões do lote de resultados não correspondem ao contrato vigente.");
  }

  const byCode = new Map<string, ResultsWorkbookImport["campaigns"][number]>();
  for (const campaign of parsed.campaigns) {
    const code = normalizeCampaignCode(campaign.campaignCode);
    if (!code || byCode.has(code)) {
      throw new Error("O lote contém campanha inválida ou duplicada.");
    }
    byCode.set(code, campaign);
  }
  if (byCode.size === 0) throw new Error("O lote não contém campanhas publicáveis.");

  const requested = requestedCampaignCodes?.length
    ? [...new Set(requestedCampaignCodes.map(normalizeCampaignCode))]
    : [...byCode.keys()];
  if (requested.some((code) => !code || !byCode.has(code))) {
    throw new Error("A seleção de campanhas não confere com o lote validado.");
  }

  const campaigns = requested
    .map((code) => byCode.get(code)!)
    .sort((left, right) => left.campaignCode.localeCompare(right.campaignCode));
  const identity = [
    parsed.source.sha256.toUpperCase(),
    parsed.contractVersion,
    parsed.calculationVersion,
    parsed.catalogVersion,
    campaigns.map((campaign) => normalizeCampaignCode(campaign.campaignCode)).join(","),
  ].join("|");
  const campaignHashes = Object.fromEntries(campaigns.map((campaign) => [
    normalizeCampaignCode(campaign.campaignCode),
    campaignContentHash(campaign, parsed.calculationVersion, parsed.catalogVersion),
  ]));

  return {
    ...parsed,
    publicationId: deterministicUuid(identity),
    publishedAt,
    campaigns,
    scope: {
      campaignCodes: campaigns.map((campaign) => normalizeCampaignCode(campaign.campaignCode)),
      campaignHashes,
    },
  };
}

export function isResultsPublicationV2(value: unknown): value is ResultsPublicationV2 {
  if (!isRecord(value)) return false;
  if (
    value.contractVersion !== RESULTS_CONTRACT_VERSION ||
    value.calculationVersion !== RESULTS_CALCULATION_VERSION ||
    value.catalogVersion !== RESULTS_CATALOG_VERSION ||
    typeof value.publicationId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.publicationId) ||
    typeof value.publishedAt !== "string" || !Number.isFinite(Date.parse(value.publishedAt)) ||
    !isRecord(value.source) ||
    typeof value.source.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(value.source.sha256) ||
    !Array.isArray(value.campaigns)
  ) return false;

  const campaignsValid = value.campaigns.length > 0 && value.campaigns.every((campaign) =>
    isRecord(campaign) &&
    Boolean(normalizeCampaignCode(campaign.campaignCode)) &&
    (campaign.points === null || Array.isArray(campaign.points)) &&
    isRecord(campaign.counts),
  );
  if (!campaignsValid || value.scope === undefined) return campaignsValid;
  const scope = value.scope;
  if (!isRecord(scope) || !Array.isArray(scope.campaignCodes) || !isRecord(scope.campaignHashes)) {
    return false;
  }
  const campaignCodes = scope.campaignCodes;
  const campaignHashes = scope.campaignHashes;
  const codes = value.campaigns.map((campaign) => normalizeCampaignCode((campaign as Record<string, unknown>).campaignCode));
  return campaignCodes.length === codes.length &&
    campaignCodes.every((code, index) => code === codes[index]) &&
    codes.every((code) => typeof campaignHashes[code] === "string" && /^[0-9a-f]{64}$/i.test(campaignHashes[code] as string));
}

export function findResultsCampaignV2(
  publication: ResultsPublicationV2,
  campaignCode: string,
) {
  const normalized = normalizeCampaignCode(campaignCode);
  return publication.campaigns.find(
    (campaign) => normalizeCampaignCode(campaign.campaignCode) === normalized,
  ) ?? null;
}

export function buildResultsPublicationScopePlan(
  rows: readonly ResultsPublicationV2Row[],
  next: ResultsPublicationV2,
): ResultsPublicationScopePlan {
  const current = currentCampaignHashes(rows);

  const selected = new Set(next.scope.campaignCodes);
  const add: string[] = [];
  const replace: string[] = [];
  const unchanged: string[] = [];
  for (const code of selected) {
    const previousHash = current.get(code);
    if (!previousHash) add.push(code);
    else if (previousHash === next.scope.campaignHashes[code]) unchanged.push(code);
    else replace.push(code);
  }
  const preserve = [...current.keys()].filter((code) => !selected.has(code)).sort();
  return { add: add.sort(), replace: replace.sort(), preserve, unchanged: unchanged.sort() };
}

export function prepareResultsPublicationScope(
  rows: readonly ResultsPublicationV2Row[],
  publication: ResultsPublicationV2,
) {
  const current = currentCampaignHashes(rows);
  const transition = publication.scope.campaignCodes
    .map((code) => `${code}:${current.get(code) ?? "absent"}`)
    .join("|");
  return {
    publication: {
      ...publication,
      publicationId: deterministicUuid(`${publication.publicationId}|${transition}`),
    },
    plan: buildResultsPublicationScopePlan(rows, publication),
  };
}


export function normalizeCampaignCode(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toUpperCase().replace(/^CAMPANHA\s*/, "C");
  return /^C[1-9]\d*$/.test(normalized) ? normalized : "";
}

function deterministicUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}`;
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function publicationCampaignHash(
  publication: ResultsPublicationV2,
  campaign: StoredResultsCampaignV2,
) {
  const code = normalizeCampaignCode(campaign.campaignCode);
  return publication.scope?.campaignHashes?.[code] ?? campaignContentHash(
    campaign,
    publication.calculationVersion,
    publication.catalogVersion,
  );
}

function currentCampaignHashes(rows: readonly ResultsPublicationV2Row[]) {
  const current = new Map<string, string>();
  for (const row of rows) {
    if (!isResultsPublicationV2(row.points)) continue;
    for (const campaign of row.points.campaigns) {
      const code = normalizeCampaignCode(campaign.campaignCode);
      if (!code || current.has(code)) continue;
      current.set(code, publicationCampaignHash(row.points, campaign));
    }
  }
  return current;
}

function campaignContentHash(
  campaign: StoredResultsCampaignV2,
  calculationVersion: string,
  catalogVersion: string,
) {
  return createHash("sha256")
    .update(stableJson({ calculationVersion, catalogVersion, campaign }))
    .digest("hex")
    .toUpperCase();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
