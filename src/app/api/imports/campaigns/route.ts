import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { parseCampaignWorkbook } from "@/lib/imports/campaigns";
import { MAX_IMPORT_FILE_BYTES, previewWorkbook } from "@/lib/imports/excel";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A planilha Campanhas_ Planilha síntese.xlsx deve ser enviada." },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "O arquivo enviado está vazio." },
        { status: 400 },
      );
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return NextResponse.json(
        { error: "A planilha precisa ter até 12 MB para publicação direta." },
        { status: 413 },
      );
    }

    const buffer = await file.arrayBuffer();
    const campaignImport = await parseCampaignWorkbook(buffer, file.name);
    normalizeCampaignKeys(campaignImport.points);
    const preview = await previewWorkbook(buffer, file.name);
    const persistence = await persistCampaignImport(campaignImport);

    if (persistence.mode === "cloud-error") {
      return NextResponse.json(
        {
          error:
            "A planilha foi lida, mas a publicação na nuvem falhou. Os demais usuários NÃO verão estes dados. Tente novamente ou contate o administrador.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ...campaignImport,
      preview,
      persistence,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível publicar a planilha de campanhas.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function persistCampaignImport(campaignImport: Awaited<ReturnType<typeof parseCampaignWorkbook>>) {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return {
      mode: "browser" as const,
      message: "Supabase não configurado; os dados foram preparados para uso neste navegador.",
    };
  }

  const campaignKey =
    campaignImport.points[0]?.campaign?.trim().toLowerCase() ||
    campaignImport.fileName.trim().toLowerCase();

  const { error } = await supabase.from("campaign_imports").insert({
    file_name: campaignImport.fileName,
    row_count: campaignImport.rowCount,
    point_count: campaignImport.points.length,
    original_point_count: campaignImport.originalPointCount,
    effective_point_count: campaignImport.effectivePointCount,
    missing_fields: campaignImport.missingFields,
    points: campaignImport.points,
    campaign_key: campaignKey,
  });

  if (error) {
    return {
      mode: "cloud-error" as const,
      message: "A nuvem recusou a gravação da planilha de campanhas.",
    };
  }

  return {
    mode: "cloud" as const,
    message: "Planilha publicada no Supabase e pronta para o painel.",
  };
}

// Pontos sem campanha herdariam uma "campanha fantasma" na agregação por
// chave; preenche com a primeira campanha não vazia encontrada na planilha.
function normalizeCampaignKeys(points: Awaited<ReturnType<typeof parseCampaignWorkbook>>["points"]) {
  const fallbackCampaign = points.find((point) => point.campaign?.trim())?.campaign?.trim();

  if (!fallbackCampaign) {
    return;
  }

  for (const point of points) {
    if (!point.campaign?.trim()) {
      point.campaign = fallbackCampaign;
    }
  }
}
