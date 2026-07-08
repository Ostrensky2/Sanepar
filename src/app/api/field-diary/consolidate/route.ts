import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Consolida uma campanha: marca todos os registros do Diário daquela campanha como
// `consolidado`, travando-os contra sobrescrita automática por futuras planilhas
// (ver REGRAS.md / import-governance). Ação explícita do usuário.
export async function POST(request: Request) {
  const auth = requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  let body: { campaignId?: string; campaignName?: string };

  try {
    body = (await request.json()) as { campaignId?: string; campaignName?: string };
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const campaignId = String(body.campaignId ?? "").trim();
  const campaignName = String(body.campaignName ?? "").trim();

  if (!campaignId && !campaignName) {
    return NextResponse.json(
      { error: "Informe a campanha a consolidar (campaignId ou campaignName)." },
      { status: 400 },
    );
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para consolidar a campanha." },
      { status: 503 },
    );
  }

  let query = supabase
    .from("field_diary_entries")
    .update({ governance_status: "consolidado" })
    // Não rebaixa registros já corrigidos manualmente (também protegidos).
    .in("governance_status", ["importado", "em_revisao"]);

  query = campaignId ? query.eq("campaign_id", campaignId) : query.eq("campaign_name", campaignName);

  const { data, error } = await query.select("id");

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível consolidar a campanha." },
      { status: 500 },
    );
  }

  return NextResponse.json({ consolidated: data?.length ?? 0 });
}
