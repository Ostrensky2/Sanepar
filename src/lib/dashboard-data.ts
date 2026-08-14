import { readFile } from "node:fs/promises";
import path from "node:path";
import bundledCampaignMapPoints from "@/data/campaign-map-points.json";
import {
  readCampaignWorkbookFromPath,
  type CampaignMapPoint,
} from "@/lib/imports/campaigns";
import {
  parseInternalStorageUrl,
  sanitizeCampaignMedia,
} from "@/lib/imports/media-policy";
import {
  buildLaboratoryRiskPoints,
  hydrateLaboratoryRiskPointPhotos,
  normalizeLaboratoryRiskLevel,
  type LaboratoryRiskPoint,
  type LaboratoryRiskResultRow,
} from "@/lib/laboratory-risk";
import {
  getLatestPublishedCampaignImport,
  getLatestPublishedLaboratoryRiskPoints,
} from "@/lib/supabase";

const CAMPAIGN_SYNTHESIS_WORKBOOK_PATH =
  "D:/Dropbox/Sanepar_única/Campo/Campanhas/Campanhas_ Planilha sintese.xlsx";
const CAMPAIGN_1_DASHBOARD_PATH = path.join(
  process.cwd(),
  "public/dashboards/Painel_eDNA_Campanha1_Sanepar.html",
);
const FAIL_CLOSED_MEDIA_SIAS = new Set(["sia:257"]);
const bundledCampaignMediaByKey = new Map(
  (bundledCampaignMapPoints as CampaignMapPoint[])
    .map((point) => [campaignMediaKey(point), sanitizeCampaignMedia(point)] as const)
    .filter(([key]) => Boolean(key)),
);

export type DashboardData = {
  campaignPoints: CampaignMapPoint[];
  laboratoryRiskPoints: LaboratoryRiskPoint[];
  campaignSummary: {
    source: string;
    totalCampaigns: number;
    completedCampaigns: number;
    activeCampaigns: number;
    period: string;
    rowCount: number;
  };
  pointSummary: {
    total: number;
    original: number;
    effective: number;
    monitored: number;
    fieldCampaigns: number;
  };
};

export async function loadDashboardData(): Promise<DashboardData> {
  const campaignImport = await loadCampaignImport();
  const campaignPoints = overlayBundledCampaignMedia(campaignImport.points);
  const publishedRiskPoints = await getLatestPublishedLaboratoryRiskPoints();
  const riskRows = publishedRiskPoints?.length
    ? []
    : await loadBundledLaboratoryRiskRows();
  const laboratoryRiskPoints = publishedRiskPoints?.length
    ? hydrateLaboratoryRiskPointPhotos(
        overlayBundledCampaignMedia(publishedRiskPoints),
        campaignPoints,
      )
    : hydrateLaboratoryRiskPointPhotos(
        buildLaboratoryRiskPoints(campaignPoints, riskRows),
        campaignPoints,
      );

  return {
    campaignPoints,
    laboratoryRiskPoints,
    campaignSummary: buildCampaignSummary(campaignPoints, campaignImport),
    pointSummary: {
      total: campaignPoints.length,
      original: campaignPoints.filter((point) => point.original).length,
      effective: campaignPoints.filter((point) => point.effective).length,
      monitored: countUniqueEffectivePoints(campaignPoints),
      fieldCampaigns: countCampaignsWithEffectiveCollection(campaignPoints),
    },
  };
}

export function overlayBundledCampaignMedia<T extends CampaignMapPoint>(points: T[]): T[] {
  return points.map((point) => {
    const sanitized = sanitizeCampaignMedia(point);
    const siaKey = normalizeSiaMediaKey(point.code);

    if (FAIL_CLOSED_MEDIA_SIAS.has(siaKey)) {
      return {
        ...sanitized,
        driveUrl: "",
        dropboxUrl: "",
        photoUrl: "",
        photos: [],
      };
    }

    if (hasInternalCampaignMedia(sanitized)) {
      return sanitized;
    }

    const canonical = bundledCampaignMediaByKey.get(campaignMediaKey(point));

    if (!canonical || !hasInternalCampaignMedia(canonical)) {
      return sanitized;
    }

    return {
      ...sanitized,
      photoUrl: canonical.photoUrl,
      photos: canonical.photos ?? [],
    };
  });
}

function hasInternalCampaignMedia(point: CampaignMapPoint) {
  return Boolean(
    parseInternalStorageUrl(point.photoUrl, "photos") ||
      point.photos?.some((photo) => parseInternalStorageUrl(photo.url, "photos")),
  );
}

function campaignMediaKey(point: Pick<CampaignMapPoint, "campaign" | "code">) {
  const campaignKey = normalizeCampaignMediaKey(point.campaign);
  const siaKey = normalizeSiaMediaKey(point.code);

  return campaignKey && siaKey ? `${campaignKey}|${siaKey}` : "";
}

function normalizeCampaignMediaKey(value: string | undefined) {
  const normalized = normalizeMediaKey(value);
  const campaignNumber =
    normalized.match(/^\s*(\d+)\s*$/)?.[1] ??
    normalized.match(/\b(\d+)\s*[ao]?\s+campanha\b/)?.[1] ??
    normalized.match(/\bcampanha\s*(\d+)\b/)?.[1];

  return campaignNumber ? `campaign:${Number(campaignNumber)}` : normalized;
}

function normalizeSiaMediaKey(value: string | undefined) {
  const normalized = normalizeMediaKey(value);
  const siaNumber = normalized.match(/\d+/)?.[0];

  return siaNumber ? `sia:${Number(siaNumber)}` : "";
}

function normalizeMediaKey(value: string | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function countUniqueEffectivePoints(campaignPoints: CampaignMapPoint[]) {
  return new Set(
    campaignPoints
      .filter((point) => point.effective)
      .map((point) => point.code.trim() || point.point.trim())
      .filter(Boolean),
  ).size;
}

function countCampaignsWithEffectiveCollection(campaignPoints: CampaignMapPoint[]) {
  return new Set(
    campaignPoints
      .filter((point) => point.effective)
      .map((point) => point.campaign.trim())
      .filter(Boolean),
  ).size;
}

async function loadCampaignImport() {
  const publishedImport = await getLatestPublishedCampaignImport();

  if (publishedImport?.points?.length) {
    return {
      points: publishedImport.points,
      rowCount: publishedImport.row_count,
      source: `Supabase / ${publishedImport.file_name}`,
    };
  }

  const synthesisImport =
    process.env.NEXT_PUBLIC_DISABLE_DB === "true"
      ? null
      : await readCampaignWorkbookFromPath(
          CAMPAIGN_SYNTHESIS_WORKBOOK_PATH,
          "Campanhas_ Planilha sintese.xlsx",
        ).catch(() => null);

  if (synthesisImport?.points.length) {
    return {
      points: synthesisImport.points,
      rowCount: synthesisImport.rowCount,
      source: CAMPAIGN_SYNTHESIS_WORKBOOK_PATH,
    };
  }

  const points = bundledCampaignMapPoints as CampaignMapPoint[];

  return {
    points,
    rowCount: points.length,
    source: "Base local embarcada",
  };
}

async function loadBundledLaboratoryRiskRows(): Promise<LaboratoryRiskResultRow[]> {
  const html = await readFile(CAMPAIGN_1_DASHBOARD_PATH, "utf8").catch(() => "");
  const match = html.match(
    /<script id="DATA" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (!match?.[1]) {
    return [];
  }

  try {
    const parsed = JSON.parse(match[1]) as { ranking?: Array<Record<string, unknown>> };
    const ranking = Array.isArray(parsed.ranking) ? parsed.ranking : [];

    return ranking.map(dashboardRankingRowToRiskRow).filter(Boolean);
  } catch {
    return [];
  }
}

function dashboardRankingRowToRiskRow(
  row: Record<string, unknown>,
): LaboratoryRiskResultRow {
  const classification = stringField(row, "Classificação integrada");
  const environmentalRisk = stringField(row, "Risco ambiental");
  const operationalRisk = stringField(row, "Risco operacional");
  const sanitaryRisk = stringField(row, "Risco sanitário");

  return {
    position: numberField(row, "Posição"),
    sampleId: stringField(row, "Amostra"),
    pointName: stringField(row, "Ponto de coleta"),
    waterBody: stringField(row, "Manancial/corpo hídrico"),
    municipality: stringField(row, "Município"),
    campaignDate: stringField(row, "Campanha/Data"),
    mainOrganisms: stringField(row, "Principais organismos"),
    mainDrivers: stringField(row, "Principais drivers de risco"),
    environmentalRisk,
    operationalRisk,
    sanitaryRisk,
    classification,
    riskLevel: normalizeLaboratoryRiskLevel(classification),
    environmentalRiskLevel: normalizeLaboratoryRiskLevel(environmentalRisk),
    operationalRiskLevel: normalizeLaboratoryRiskLevel(operationalRisk),
    sanitaryRiskLevel: normalizeLaboratoryRiskLevel(sanitaryRisk),
    score: numberField(row, "Score integrado"),
    cianoReads: numberField(row, "Ciano reads"),
    bactReads: numberField(row, "Bact. sanitárias reads"),
    coiReads: numberField(row, "COI invasores reads"),
    confidence: stringField(row, "Nível de confiança"),
    technicalJustification: stringField(row, "Justificativa técnica"),
    recommendations: stringField(row, "Recomendações"),
  };
}

function stringField(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
}

function numberField(row: Record<string, unknown>, key: string) {
  const value = row[key];
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildCampaignSummary(
  campaignPoints: CampaignMapPoint[],
  campaignImport: { rowCount: number; source: string },
) {
  const campaigns = new Map<string, CampaignMapPoint[]>();

  for (const point of campaignPoints) {
    const campaign = point.campaign.trim() || "Campanha sem identificação";
    campaigns.set(campaign, [...(campaigns.get(campaign) ?? []), point]);
  }

  const completedCampaigns = [...campaigns.values()].filter(
    (points) => points.length > 0 && points.every((point) => point.effective),
  ).length;

  return {
    source: campaignImport.source,
    totalCampaigns: campaigns.size,
    completedCampaigns,
    activeCampaigns: Math.max(campaigns.size - completedCampaigns, 0),
    period: formatPointPeriod(campaignPoints),
    rowCount: campaignImport.rowCount,
  };
}

function formatPointPeriod(points: CampaignMapPoint[]) {
  const dates = points
    .map((point) => parsePointDate(point.date))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  if (!dates.length) {
    return "período não informado";
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (firstDate.getTime() === lastDate.getTime()) {
    return formatDate(firstDate);
  }

  return `${formatDate(firstDate)} a ${formatDate(lastDate)}`;
}

function parsePointDate(value: string) {
  const trimmedValue = value.trim();
  const brazilianDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmedValue);

  if (brazilianDate) {
    const [, day, month, year] = brazilianDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(trimmedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
