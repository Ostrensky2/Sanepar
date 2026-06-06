import { NextResponse } from "next/server";
import bundledCampaignMapPoints from "@/data/campaign-map-points.json";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/imports/excel";
import { parseLaboratoryResultsWorkbook } from "@/lib/imports/results";
import { buildLaboratoryRiskPoints } from "@/lib/laboratory-risk";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import {
  createOptionalSupabaseClient,
  getLatestPublishedCampaignImport,
  LAB_RISK_RESULTS_SNAPSHOT_FILE_NAME,
} from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A planilha de Resultados deve ser enviada." },
        { status: 400 },
      );
    }

    if (!file.name) {
      return NextResponse.json(
        { error: "O arquivo enviado precisa ter um nome identificável." },
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
        {
          error:
            "Arquivos de até 12 MB são aceitos na carga manual. Um recorte menor deve ser usado para validação.",
        },
        { status: 413 },
      );
    }

    const results = await parseLaboratoryResultsWorkbook(await file.arrayBuffer(), file.name);
    const campaignImport = await getLatestPublishedCampaignImport();
    const campaignPoints = campaignImport?.points?.length
      ? campaignImport.points
      : bundledCampaignMapPoints as CampaignMapPoint[];
    const riskPoints = buildLaboratoryRiskPoints(campaignPoints, results.riskRows);
    const persistence = await persistLaboratoryResults({
      fileName: file.name,
      rowCount: results.rowCount,
      riskRowCount: results.riskRows.length,
      riskPoints,
    });

    return NextResponse.json({
      ...results,
      riskPoints,
      matchedRiskPointCount: riskPoints.length,
      persistence,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível processar a planilha de Resultados.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function persistLaboratoryResults({
  fileName,
  rowCount,
  riskRowCount,
  riskPoints,
}: {
  fileName: string;
  rowCount: number;
  riskRowCount: number;
  riskPoints: ReturnType<typeof buildLaboratoryRiskPoints>;
}) {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return {
      mode: "browser" as const,
      message: "Supabase não configurado; os resultados ficaram apenas neste navegador.",
    };
  }

  const { error } = await supabase.from("campaign_imports").insert({
    file_name: LAB_RISK_RESULTS_SNAPSHOT_FILE_NAME,
    row_count: rowCount,
    point_count: riskPoints.length,
    original_point_count: riskRowCount,
    effective_point_count: riskPoints.length,
    missing_fields: [`arquivo:${fileName}`],
    points: riskPoints,
  });

  if (error) {
    return {
      mode: "browser" as const,
      message: "A nuvem não confirmou a publicação dos resultados.",
    };
  }

  return {
    mode: "cloud" as const,
    message: "Resultados publicados no Supabase e disponíveis para outros usuários.",
  };
}
