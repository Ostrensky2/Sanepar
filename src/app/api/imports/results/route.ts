import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import bundledCampaignMapPoints from "@/data/campaign-map-points.json";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/imports/excel";
import { parseLaboratoryResultsWorkbook } from "@/lib/imports/results";
import {
  isResultsPublication,
  isResultsViewModel,
  RESULTS_SCHEMA_VERSION,
  type RankingResultRow,
  type ResultsPublication,
  type ResultsPublicationResponse,
  type ResultsViewModel,
} from "@/lib/imports/results-contract";
import { buildLaboratoryRiskPoints } from "@/lib/laboratory-risk";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import {
  createOptionalSupabaseClient,
  getLatestPublishedCampaignImport,
} from "@/lib/supabase";

export const runtime = "nodejs";

type PublishedResultRow = { points: unknown };

const CAMPAIGN_1_ID = "campanha-1-verao-2026";
const CAMPAIGN_1_NUMBER = 1;
const CAMPAIGN_1_TITLE = "1ª Campanha - Verão 2026";
const CAMPAIGN_1_DASHBOARD_PATH = path.join(
  process.cwd(),
  "public/dashboards/Painel_eDNA_Campanha1_Sanepar.html",
);

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaignId")?.trim() ?? "";
  const numberValue = url.searchParams.get("campaignNumber")?.trim() ?? "";
  const campaignNumber = numberValue ? Number(numberValue) : null;

  if (!campaignId && campaignNumber === null) {
    return NextResponse.json({ error: "Informe campaignId ou campaignNumber." }, { status: 400 });
  }
  if (campaignNumber !== null && (!Number.isInteger(campaignNumber) || campaignNumber < 1)) {
    return NextResponse.json({ error: "campaignNumber inválido." }, { status: 400 });
  }

  const supabase = createOptionalSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      await bundledCampaign1Response(campaignId, campaignNumber),
    );
  }

  const { data, error } = await supabase
    .from("lab_risk_results")
    .select("points")
    .order("created_at", { ascending: false })
    .returns<PublishedResultRow[]>();
  if (error) {
    return NextResponse.json({ error: "Não foi possível consultar os resultados publicados." }, { status: 503 });
  }

  const publication = (data ?? []).map((row) => row.points).find((value): value is ResultsPublication =>
    isResultsPublication(value) && (campaignId ? value.campaignId === campaignId : value.campaignNumber === campaignNumber));
  if (!publication) {
    return NextResponse.json(
      await bundledCampaign1Response(campaignId, campaignNumber),
    );
  }

  return NextResponse.json({ status: "published", publication, viewModel: publication.viewModel } satisfies ResultsPublicationResponse);
}

async function bundledCampaign1Response(
  campaignId: string,
  campaignNumber: number | null,
): Promise<ResultsPublicationResponse> {
  const isCampaign1 = campaignId
    ? campaignId === CAMPAIGN_1_ID
    : campaignNumber === CAMPAIGN_1_NUMBER;

  if (!isCampaign1) {
    return { status: "empty", publication: null, viewModel: null };
  }

  const html = await readFile(CAMPAIGN_1_DASHBOARD_PATH, "utf8").catch(() => "");
  const match = html.match(/const DATA\s*=\s*(\{[^\n]*\});/);

  if (!match?.[1]) {
    return { status: "empty", publication: null, viewModel: null };
  }

  try {
    const viewModel: unknown = JSON.parse(match[1]);
    if (!isResultsViewModel(viewModel)) {
      return { status: "empty", publication: null, viewModel: null };
    }

    const publication: ResultsPublication = {
      campaignId: CAMPAIGN_1_ID,
      campaignNumber: CAMPAIGN_1_NUMBER,
      campaignTitle: CAMPAIGN_1_TITLE,
      importedAt: "2026-08-21T00:00:00.000Z",
      schemaVersion: RESULTS_SCHEMA_VERSION,
      fileName: "Painel_eDNA_Campanha1_Sanepar.html",
      methodology: {
        origin: "Dashboard homologado da 1ª Campanha",
        version: "golden-master-2026-08-21",
      },
      molecularRows: [],
      rankingRows: bundledRankingRows(viewModel),
      viewModel,
    };

    return { status: "published", publication, viewModel };
  } catch {
    return { status: "empty", publication: null, viewModel: null };
  }
}

function bundledRankingRows(viewModel: ResultsViewModel): RankingResultRow[] {
  const alertsBySample = new Map(viewModel.alerts.map((alert) => [alert.amostra, alert]));

  return viewModel.points.map((point) => {
    const alert = alertsBySample.get(point.amostra);
    const alertTags = (alert?.tags ?? []).filter(
      (tag): tag is "TOX" | "ODOR" | "INV" => ["TOX", "ODOR", "INV"].includes(tag),
    );

    return {
      position: point.pos,
      sampleId: String(point.amostra),
      pointName: point.ponto,
      waterBody: point.manancial,
      municipality: point.municipio,
      campaignDate: CAMPAIGN_1_TITLE,
      turbidity: point.turbidez,
      weatherCondition: point.clima,
      mainOrganisms: point.organismos,
      mainDrivers: point.drivers,
      environmentalRisk: point.r_amb,
      operationalRisk: point.r_op,
      sanitaryRisk: point.r_san,
      classification: point.classe,
      score: point.score,
      cianoReads: point.ciano_reads,
      cianoPriorityPercent: point.ciano_pct,
      sanitaryBacteriaReads: point.bact_reads,
      sanitaryBacteriaPercent: point.bact_pct,
      invasiveCoiReads: point.coi_inv_reads,
      technicalJustification: point.just,
      confidence: point.confianca,
      recommendations: point.rec,
      invasiveCoiPercent: null,
      alert: Boolean(alert),
      alertTags,
      alertReasons: alert?.reasons ?? [],
    };
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

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
    if (results.metadata.publicationStatus !== "published") {
      return NextResponse.json(
        { error: "A planilha está marcada como draft e não substituiu a publicação vigente." },
        { status: 422 },
      );
    }
    const publication: ResultsPublication = {
      campaignId: results.metadata.campaignId,
      campaignNumber: results.metadata.campaignNumber,
      campaignTitle: results.metadata.campaignTitle,
      importedAt: new Date().toISOString(),
      schemaVersion: results.metadata.schemaVersion,
      fileName: file.name,
      methodology: results.metadata.methodology,
      molecularRows: results.molecularRows,
      rankingRows: results.rankingRows,
      viewModel: results.viewModel,
    };
    const campaignImport = await getLatestPublishedCampaignImport();
    const campaignPoints = campaignImport?.points?.length
      ? campaignImport.points
      : bundledCampaignMapPoints as CampaignMapPoint[];
    const riskPoints = buildLaboratoryRiskPoints(campaignPoints, results.riskRows);
    const persistence = await persistLaboratoryResults({
      fileName: file.name,
      rowCount: results.rowCount,
      riskRowCount: results.riskRows.length,
      publication,
    });

    if (persistence.mode === "cloud-error") {
      return NextResponse.json(
        {
          error:
            "Os resultados foram lidos, mas a publicação na nuvem falhou. Os demais usuários NÃO verão estes dados. Tente novamente ou contate o administrador.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ...results,
      publication,
      viewModel: publication.viewModel,
      riskPoints,
      matchedRiskPointCount: riskPoints.length,
      persistence,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível processar a planilha de Resultados.";

    return NextResponse.json({ error: message }, { status: 422 });
  }
}

async function persistLaboratoryResults({
  fileName,
  rowCount,
  riskRowCount,
  publication,
}: {
  fileName: string;
  rowCount: number;
  riskRowCount: number;
  publication: ResultsPublication;
}) {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return {
      mode: "browser" as const,
      message: "Supabase não configurado; os resultados ficaram apenas neste navegador.",
    };
  }

  const { error } = await supabase.from("lab_risk_results").insert({
    file_name: fileName,
    row_count: rowCount,
    risk_row_count: riskRowCount,
    points: publication,
  });

  if (error) {
    return {
      mode: "cloud-error" as const,
      message: "A nuvem não confirmou a publicação dos resultados.",
    };
  }

  return {
    mode: "cloud" as const,
    message: "Resultados publicados no Supabase e disponíveis para outros usuários.",
  };
}
