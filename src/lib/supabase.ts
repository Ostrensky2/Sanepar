import { createClient } from "@supabase/supabase-js";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import type { LaboratoryRiskPoint } from "@/lib/laboratory-risk";

export const POINT_ACTIONS_SNAPSHOT_FILE_NAME = "__point_actions__";
export const APP_DOCUMENTS_SNAPSHOT_FILE_NAME = "__app_documents__";
export const CAMPAIGN_MANAGEMENT_SNAPSHOT_FILE_NAME = "__campaign_management__";
export const LAB_RISK_RESULTS_SNAPSHOT_FILE_NAME = "__lab_risk_results__";

const isVercelRuntime = sanitizeEnvValue(process.env.VERCEL) === "1";
const isDbDisabled = !isVercelRuntime && sanitizeEnvValue(process.env.NEXT_PUBLIC_DISABLE_DB) === "true";

const supabaseUrl = isDbDisabled ? "" : sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = isDbDisabled
  ? ""
  : sanitizeEnvValue(
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
};

type JsonSnapshotRow = {
  points: unknown;
  created_at: string;
};

export function getCloudRuntimeMode() {
  return supabaseUrl && supabaseAnonKey ? "nuvem pronta" : "modo local";
}

export function createOptionalSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
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

  const latestByCampaign = new Map<string, CampaignImportRow>();

  for (const row of data) {
    const campaignKey = inferCampaignKeyFromRow(row);

    if (!latestByCampaign.has(campaignKey)) {
      latestByCampaign.set(campaignKey, row);
    }
  }

  const aggregatedRows = [...latestByCampaign.values()];
  const aggregatedPoints = aggregatedRows.flatMap((row) => row.points ?? []);
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
    .from("campaign_imports")
    .select("points, created_at")
    .eq("file_name", LAB_RISK_RESULTS_SNAPSHOT_FILE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<JsonSnapshotRow>();

  if (error || !Array.isArray(data?.points)) {
    return null;
  }

  return data.points as LaboratoryRiskPoint[];
}

function inferCampaignKeyFromRow(row: CampaignImportRow) {
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
