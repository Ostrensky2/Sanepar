import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  CAMPAIGN_MANAGEMENT_SNAPSHOT_FILE_NAME,
  createOptionalSupabaseClient,
} from "@/lib/supabase";

export const runtime = "nodejs";

const SINGLETON_ID = "singleton";

type CampaignManagementRow = {
  management: unknown;
  updated_at: string;
};

type CampaignManagementSnapshotRow = {
  points: unknown;
  created_at: string;
};

export async function GET(request: Request) {
  const auth = await requireApiSession(request);

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ management: null, persistence: "browser" });
  }

  const { data, error } = await supabase
    .from("campaign_management")
    .select("management, updated_at")
    .eq("id", SINGLETON_ID)
    .maybeSingle<CampaignManagementRow>();

  if (!error && isRecord(data?.management)) {
    return NextResponse.json({
      management: data.management,
      persistence: "cloud",
    });
  }

  // Fallback legado: snapshots gravados em campaign_imports antes da
  // migração para a tabela campaign_management.
  const { data: legacy, error: legacyError } = await supabase
    .from("campaign_imports")
    .select("points, created_at")
    .eq("file_name", CAMPAIGN_MANAGEMENT_SNAPSHOT_FILE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<CampaignManagementSnapshotRow>();

  if (legacyError) {
    return NextResponse.json(
      { error: "Não foi possível consultar o status das campanhas." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    management: isRecord(legacy?.points) ? legacy.points : null,
    persistence: "cloud",
  });
}

export async function PUT(request: Request) {
  const auth = await requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

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

  const { error } = await supabase.from("campaign_management").upsert(
    {
      id: SINGLETON_ID,
      management: payload.management,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

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
