import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

type ChangeLogRow = {
  id: string;
  entry_id: string | null;
  campaign_name: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  origin: string;
  changed_by: string | null;
  changed_at: string;
};

// Histórico de alterações de um registro (ou de uma campanha) do Diário de Campo.
export async function GET(request: Request) {
  const auth = requireApiSession(request);

  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const entryId = url.searchParams.get("entryId");
  const campaignName = url.searchParams.get("campaignName");

  if (!entryId && !campaignName) {
    return NextResponse.json({ error: "Informe entryId ou campaignName." }, { status: 400 });
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ history: [], persistence: "browser" });
  }

  let query = supabase
    .from("field_diary_change_log")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(200);

  query = entryId ? query.eq("entry_id", entryId) : query.eq("campaign_name", campaignName);

  const { data, error } = await query.returns<ChangeLogRow[]>();

  if (error) {
    return NextResponse.json({ error: "Não foi possível consultar o histórico." }, { status: 500 });
  }

  return NextResponse.json({
    history: (data ?? []).map((row) => ({
      id: row.id,
      entryId: row.entry_id,
      campaignName: row.campaign_name,
      field: row.field_name,
      oldValue: row.old_value ?? "",
      newValue: row.new_value ?? "",
      origin: row.origin,
      changedBy: row.changed_by ?? "",
      changedAt: row.changed_at,
    })),
    persistence: "cloud",
  });
}
