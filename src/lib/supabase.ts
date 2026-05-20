import { createClient } from "@supabase/supabase-js";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";

export const POINT_ACTIONS_SNAPSHOT_FILE_NAME = "__point_actions__";
export const APP_DOCUMENTS_SNAPSHOT_FILE_NAME = "__app_documents__";

const supabaseUrl = sanitizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = sanitizeEnvValue(
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
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("campaign_imports")
    .select("*")
    .neq("file_name", POINT_ACTIONS_SNAPSHOT_FILE_NAME)
    .neq("file_name", APP_DOCUMENTS_SNAPSHOT_FILE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<CampaignImportRow>();

  if (error) {
    return null;
  }

  return data;
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
