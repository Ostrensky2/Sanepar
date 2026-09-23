import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/imports/excel";
import {
  previewResultsWorkbook,
  resultsCampaignPublicationKey,
  type ResultsWorkbookPreviewResponse,
} from "@/lib/imports/results";
import {
  isResultsPublicationV2,
} from "@/lib/results-v2-persistence";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { RESULTS_CONTRACT_VERSION, type CampaignPublicationIdentity } from "@/modules/results";
import { currentResultsPublication, isLegacyResultsCampaign, readResultsSnapshot, resultsInventory, ResultsStoreError } from "@/lib/results-publication-store";
import { prepareResultsForm } from "@/lib/results-preparation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiSession(request, "data.import");
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    if(formData.get("mode")==="preparation") {
      const {preview}=await prepareResultsForm(formData,createOptionalSupabaseClient());
      return noStoreJson(preview);
    }
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name || file.size === 0) {
      return noStoreJson({ error: "Selecione uma planilha de Resultados válida." }, 400);
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return noStoreJson({ error: "A planilha excede o limite de 12 MB." }, 413);
    }

    const preview = await previewResultsWorkbook(await file.arrayBuffer(), file.name);
    if (preview.contractVersion !== RESULTS_CONTRACT_VERSION) {
      return noStoreJson({ ...preview, currentCampaigns: [], expectedHeads: {} } satisfies ResultsWorkbookPreviewResponse);
    }

    const supabase = createOptionalSupabaseClient();
    if (!supabase) {
      return noStoreJson({ error: "Não foi possível consultar o escopo vigente das campanhas." }, 503);
    }
    const snapshot = await readResultsSnapshot(supabase);
    const inventory = resultsInventory(snapshot);
    const rows = inventory.campaigns.map(item => currentResultsPublication(snapshot,item.campaignCode)!).map(row => ({...row,points:isResultsPublicationV2(row.points) ? {...row.points,campaigns:row.points.campaigns.filter(c=>snapshot.heads[c.campaignCode]===row.id)}:row.points}));

    return noStoreJson({
      ...preview,
      currentCampaigns: currentCampaignIdentities(rows),
      expectedHeads: inventory.expectedHeads,
    } satisfies ResultsWorkbookPreviewResponse);
  } catch (error) {
    if (error instanceof ResultsStoreError) return noStoreJson({error:error.message,code:error.code},error.status);
    return noStoreJson({
      error: error instanceof Error ? error.message : "Não foi possível gerar a prévia da planilha de Resultados.",
    }, 422);
  }
}

function currentCampaignIdentities(
  rows: Array<{ id: string; points: unknown }>,
): CampaignPublicationIdentity[] {
  const identities: CampaignPublicationIdentity[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for(let number=1;number<=9;number++) {
      const code=`C${number}`;
      if(!seen.has(code) && isLegacyResultsCampaign(row.points,code)) {
        // A technical identity for replacement planning, never a scientific/source hash.
        identities.push({campaignCode:code,publicationKey:`legacy-v1:${row.id}`});
        seen.add(code);
      }
    }
    if (!isResultsPublicationV2(row.points)) continue;
    for (const campaign of row.points.campaigns) {
      if (seen.has(campaign.campaignCode)) continue;
      seen.add(campaign.campaignCode);
      identities.push({
        campaignCode: campaign.campaignCode,
        publicationKey: resultsCampaignPublicationKey(campaign, row.points),
      });
    }
  }
  return identities;
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
