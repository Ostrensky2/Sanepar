import { NextResponse } from "next/server";
import { parseCampaignWorkbook } from "@/lib/imports/campaigns";
import { MAX_IMPORT_FILE_BYTES, previewWorkbook } from "@/lib/imports/excel";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
    const preview = await previewWorkbook(buffer, file.name);
    const persistence = await persistCampaignImport(campaignImport);

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

  const { error } = await supabase.from("campaign_imports").insert({
    file_name: campaignImport.fileName,
    row_count: campaignImport.rowCount,
    point_count: campaignImport.points.length,
    original_point_count: campaignImport.originalPointCount,
    effective_point_count: campaignImport.effectivePointCount,
    missing_fields: campaignImport.missingFields,
    points: campaignImport.points,
  });

  if (error) {
    return {
      mode: "browser" as const,
      message:
        "A tabela campaign_imports ainda não aceitou gravação; o painel usará a planilha neste navegador.",
    };
  }

  return {
    mode: "cloud" as const,
    message: "Planilha publicada no Supabase e pronta para o painel.",
  };
}
