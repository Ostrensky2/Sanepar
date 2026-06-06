import { NextResponse } from "next/server";
import {
  CAMPAIGN_MANAGEMENT_SNAPSHOT_FILE_NAME,
  createOptionalSupabaseClient,
} from "@/lib/supabase";

export const runtime = "nodejs";

type CampaignManagementSnapshotRow = {
  points: unknown;
  created_at: string;
};

export async function GET() {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ management: null, persistence: "browser" });
  }

  const { data, error } = await supabase
    .from("campaign_imports")
    .select("points, created_at")
    .eq("file_name", CAMPAIGN_MANAGEMENT_SNAPSHOT_FILE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<CampaignManagementSnapshotRow>();

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível consultar o status das campanhas." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    management: isRecord(data?.points) ? data.points : null,
    persistence: "cloud",
  });
}

export async function PUT(request: Request) {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para salvar status de campanha." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { management?: unknown };

  if (!isRecord(payload.management)) {
    return NextResponse.json(
      { error: "Status de campanha inválido." },
      { status: 400 },
    );
  }

  const campaignCount = Object.keys(payload.management).length;
  const { error } = await supabase.from("campaign_imports").insert({
    file_name: CAMPAIGN_MANAGEMENT_SNAPSHOT_FILE_NAME,
    row_count: campaignCount,
    point_count: campaignCount,
    original_point_count: 0,
    effective_point_count: 0,
    missing_fields: [],
    points: payload.management,
  });

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar status de campanha na nuvem." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    management: payload.management,
    persistence: "cloud",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
