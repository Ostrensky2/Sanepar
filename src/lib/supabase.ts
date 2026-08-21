import { createClient } from "@supabase/supabase-js";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import { isResultsPublication, type ResultsPublication } from "@/lib/imports/results-contract";
import {
  laboratoryRiskLabel,
  normalizeLaboratoryRiskLevel,
  type LaboratoryRiskPoint,
} from "@/lib/laboratory-risk";
import { sanitizeCampaignMedia } from "@/lib/imports/media-policy";

export const POINT_ACTIONS_SNAPSHOT_FILE_NAME = "__point_actions__";
export const APP_DOCUMENTS_SNAPSHOT_FILE_NAME = "__app_documents__";
export const CAMPAIGN_MANAGEMENT_SNAPSHOT_FILE_NAME = "__campaign_management__";
export const LAB_RISK_RESULTS_SNAPSHOT_FILE_NAME = "__lab_risk_results__";

const isVercelRuntime = sanitizeEnvValue(process.env.VERCEL) === "1";
const isDbDisabled = !isVercelRuntime && sanitizeEnvValue(process.env.NEXT_PUBLIC_DISABLE_DB) === "true";

const supabaseUrl = isDbDisabled ? "" : sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServerKey = isDbDisabled
  ? ""
  : sanitizeEnvValue(
      process.env.SUPABASE_SECRET_KEY ??
        process.env.SUPABASE_SERVICE_ROLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );

type CampaignImportRow = {
  id: string;
  file_name: string;
  row_count: number;
  point_count: number;
  original_point_count: number;
  effective_point_count: number;
  missing_fields: string[];
  points: CampaignMapPoint[];
  created_at: string;
  campaign_key?: string | null;
};

type LabRiskResultRow = {
  points: unknown;
  created_at: string;
};

type JsonSnapshotRow = {
  points: unknown;
  created_at: string;
};

export function getCloudRuntimeMode() {
  return supabaseUrl && supabaseServerKey ? "nuvem pronta" : "modo local";
}

export function createOptionalSupabaseClient() {
  if (!supabaseUrl || !supabaseServerKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServerKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "x-application-name": "yvae-monitoramento",
      },
    },
  });
}

export async function getLatestPublishedCampaignImport() {
  const aggregated = await getAggregatedPublishedCampaignImports();
  return aggregated;
}

export async function getAggregatedPublishedCampaignImports() {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("campaign_imports")
    .select("*")
    .neq("file_name", POINT_ACTIONS_SNAPSHOT_FILE_NAME)
    .neq("file_name", APP_DOCUMENTS_SNAPSHOT_FILE_NAME)
    .neq("file_name", CAMPAIGN_MANAGEMENT_SNAPSHOT_FILE_NAME)
    .neq("file_name", LAB_RISK_RESULTS_SNAPSHOT_FILE_NAME)
    .order("created_at", { ascending: false })
    .returns<CampaignImportRow[]>();

  if (error || !data || data.length === 0) {
    return null;
  }

  const campaignRows = data.filter((row) =>
    (row.point_count ?? 0) > 0 && Array.isArray(row.points) && row.points.length > 0,
  );

  if (!campaignRows.length) {
    return null;
  }

  const latestByCampaign = new Map<string, CampaignImportRow>();

  for (const row of campaignRows) {
    const campaignKey = inferCampaignKeyFromRow(row);

    if (!latestByCampaign.has(campaignKey)) {
      latestByCampaign.set(campaignKey, row);
    }
  }

  const aggregatedRows = [...latestByCampaign.values()];
  const aggregatedPoints = aggregatedRows
    .flatMap((row) => row.points ?? [])
    .map(sanitizeCampaignMedia);
  const rowCount = aggregatedRows.reduce((total, row) => total + (row.row_count ?? 0), 0);
  const fileNames = aggregatedRows.map((row) => row.file_name).join(" + ");
  const latest = aggregatedRows[0];

  return {
    ...latest,
    points: aggregatedPoints,
    row_count: rowCount,
    file_name: fileNames || latest.file_name,
  };
}

export async function getLatestPublishedLaboratoryRiskPoints() {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("lab_risk_results")
    .select("points, created_at")
    .order("created_at", { ascending: false })
    .returns<LabRiskResultRow[]>();

  if (!error && data) {
    const publications = data
      .filter((row): row is LabRiskResultRow & { points: ResultsPublication } =>
        isResultsPublication(row.points))
      .sort(compareResultsPublications);
    const latestCampaigns = new Set<number>();
    const publishedRiskPoints: LaboratoryRiskPoint[] = [];

    for (const row of publications) {
      if (latestCampaigns.has(row.points.campaignNumber)) {
        continue;
      }

      const riskPoints = publicationToLaboratoryRiskPoints(row.points);

      if (riskPoints) {
        latestCampaigns.add(row.points.campaignNumber);
        publishedRiskPoints.push(...riskPoints);
      }
    }

    if (publishedRiskPoints.length) {
      return publishedRiskPoints.map(sanitizeCampaignMedia);
    }

    const legacy = data.find((row) => isLaboratoryRiskPointArray(row.points));

    if (legacy && isLaboratoryRiskPointArray(legacy.points)) {
      return legacy.points.map(sanitizeCampaignMedia);
    }
  }

  // Fallback legado: snapshots gravados em campaign_imports antes da
  // migração para a tabela lab_risk_results.
  const { data: legacy, error: legacyError } = await supabase
    .from("campaign_imports")
    .select("points, created_at")
    .eq("file_name", LAB_RISK_RESULTS_SNAPSHOT_FILE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<JsonSnapshotRow>();

  if (legacyError || !isLaboratoryRiskPointArray(legacy?.points)) {
    return null;
  }

  return legacy.points.map(sanitizeCampaignMedia);
}

function compareResultsPublications(
  left: LabRiskResultRow & { points: ResultsPublication },
  right: LabRiskResultRow & { points: ResultsPublication },
) {
  return right.points.campaignNumber - left.points.campaignNumber ||
    Date.parse(right.points.importedAt) - Date.parse(left.points.importedAt) ||
    Date.parse(right.created_at) - Date.parse(left.created_at) ||
    right.points.campaignId.localeCompare(left.points.campaignId);
}

function publicationToLaboratoryRiskPoints(publication: ResultsPublication) {
  if (!publication.viewModel.points.length || publication.viewModel.points.some((point) =>
    point.score === null || point.classe === null)) {
    return null;
  }

  return publication.viewModel.points.map<LaboratoryRiskPoint>((point) => {
    const riskLevel = normalizeLaboratoryRiskLevel(point.classe ?? "");

    return {
      id: `${publication.campaignId}:resultado:${point.amostra}`,
      code: String(point.sia),
      point: point.ponto,
      day: "",
      campaign: publication.campaignTitle,
      date: "",
      waterBody: point.manancial,
      municipality: point.municipio,
      original: null,
      effective: { lat: point.lat, lon: point.lon },
      accessibility: "",
      waterAspect: point.turbidez,
      weatherConditions: point.clima,
      problems: "",
      driveUrl: "",
      dropboxUrl: "",
      photoUrl: "",
      riskLevel,
      riskLabel: laboratoryRiskLabel(riskLevel),
      riskClassification: point.classe ?? "",
      environmentalRisk: point.r_amb,
      operationalRisk: point.r_op,
      sanitaryRisk: point.r_san,
      environmentalRiskLevel: normalizeLaboratoryRiskLevel(point.r_amb),
      operationalRiskLevel: normalizeLaboratoryRiskLevel(point.r_op),
      sanitaryRiskLevel: normalizeLaboratoryRiskLevel(point.r_san),
      eta: point.ponto,
      detectedMarkers: [
        `Ciano: ${point.ciano_reads} reads`,
        `Bact.: ${point.bact_reads} reads`,
        `COI: ${point.coi_inv_reads} reads`,
      ],
      ednaSignal: point.classe ?? "",
      laboratoryStatus: "homologado",
      resultSummary: point.just,
      score: point.score,
      confidence: point.confianca,
      recommendations: point.rec,
      rankingPosition: point.pos,
      sampleId: String(point.amostra),
    };
  });
}

function isLaboratoryRiskPointArray(value: unknown): value is LaboratoryRiskPoint[] {
  return Array.isArray(value) && value.length > 0 && value.every((point) =>
    point && typeof point === "object" &&
    typeof (point as LaboratoryRiskPoint).id === "string" &&
    typeof (point as LaboratoryRiskPoint).point === "string" &&
    typeof (point as LaboratoryRiskPoint).campaign === "string" &&
    typeof (point as LaboratoryRiskPoint).riskClassification === "string" &&
    typeof (point as LaboratoryRiskPoint).riskLevel === "string" &&
    ((point as LaboratoryRiskPoint).score === null ||
      Number.isFinite((point as LaboratoryRiskPoint).score)));
}

function inferCampaignKeyFromRow(row: CampaignImportRow) {
  const explicitKey = row.campaign_key?.trim().toLowerCase();

  if (explicitKey) {
    return explicitKey;
  }

  const firstPoint = row.points?.[0];
  const fromPoint = firstPoint?.campaign?.trim().toLowerCase();

  if (fromPoint) {
    return fromPoint;
  }

  return row.file_name.trim().toLowerCase();
}

function sanitizeEnvValue(value: string | undefined) {
  const sanitized = value
    ?.replace(/\\r\\n|\\n|\\r/g, "")
    .replace(/[\r\n]/g, "")
    .trim();

  if (!sanitized) {
    return sanitized;
  }

  return sanitized.replace(/^["']|["']$/g, "");
}
