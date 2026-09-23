import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/imports/excel";
import { RESULTS_SCHEMA_VERSION } from "@/lib/imports/results-contract";
import { normalizeCampaignKey, resolveCanonicalCampaign } from "@/lib/campaign-identity";
import {
  RESULTS_CONTRACT_VERSION,
  parseResultsWorkbookWithModelV2,
} from "@/modules/results";
import {
  buildResultsPublicationV2,
  findResultsCampaignV2,
  isResultsPublicationV2,
  normalizeCampaignCode,
} from "@/lib/results-v2-persistence";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { ResultsStoreError, currentResultsPublication, isLegacyResultsCampaign, publishResultsSnapshot, readResultsSnapshot, resultsInventory, selectExpectedHeads } from "@/lib/results-publication-store";
import { readResultsPreparation, saveResultsPreparation } from "@/lib/results-preparation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  if(url.searchParams.get("source")==="preparation") {
    const permission=await requireApiSession(request,"data.import");if(!permission.ok)return permission.response;
    const client=createOptionalSupabaseClient();if(!client)return noStoreJson({error:"Preparação indisponível."},503);
    try {return noStoreJson({source:{kind:"preparation",published:false},preparation:await readResultsPreparation(client,url.searchParams.get("packageKey")??"",url.searchParams.get("revisionHash"))});}
    catch(error){return noStoreJson({error:error instanceof Error?error.message:"Preparação indisponível."},error instanceof ResultsStoreError?error.status:422);}
  }
  const campaignId = url.searchParams.get("campaignId")?.trim() ?? "";
  const numberValue = url.searchParams.get("campaignNumber")?.trim() ?? "";
  const campaignNumber = numberValue ? Number(numberValue) : null;
  const requestedVersion = url.searchParams.get("schemaVersion")?.trim() || RESULTS_CONTRACT_VERSION;

  if (url.searchParams.get("inventory") === "1") {
    const client = createOptionalSupabaseClient();
    if (!client) return NextResponse.json({ error: "Inventário indisponível." }, { status: 503 });
    try { return noStoreJson(resultsInventory(await readResultsSnapshot(client))); }
    catch (error) { return noStoreJson({ error: error instanceof ResultsStoreError ? error.message : "Inventário indisponível.", code: error instanceof ResultsStoreError ? error.code : "persistence_unavailable" }, error instanceof ResultsStoreError ? error.status : 503); }
  }

  if (!campaignId && campaignNumber === null) {
    return NextResponse.json({ error: "Informe campaignId ou campaignNumber." }, { status: 400 });
  }
  if (campaignNumber !== null && (!Number.isInteger(campaignNumber) || campaignNumber < 1)) {
    return NextResponse.json({ error: "campaignNumber inválido." }, { status: 400 });
  }
  if (![RESULTS_CONTRACT_VERSION, RESULTS_SCHEMA_VERSION].includes(requestedVersion)) {
    return NextResponse.json({ error: "schemaVersion não suportada." }, { status: 400 });
  }

  const supabase = createOptionalSupabaseClient();
  if (!supabase) {
    return noStoreJson({error:"Persistência de resultados indisponível.",code:"persistence_unavailable"},503);
  }

  {
    const campaignCode = requestedCampaignCode(campaignId, campaignNumber);
    if (!campaignCode) {
      return NextResponse.json({ error: "A campanha solicitada não é canônica." }, { status: 400 });
    }
    let snapshot;
    try { snapshot = await readResultsSnapshot(supabase); } catch {
      return NextResponse.json({ error: "Não foi possível consultar os resultados publicados." }, { status: 503 });
    }
    let current;
    try { current=currentResultsPublication(snapshot,campaignCode); } catch(error) {
      return noStoreJson({error:error instanceof Error?error.message:"Publicação indisponível.",code:error instanceof ResultsStoreError?error.code:"persistence_unavailable"},error instanceof ResultsStoreError?error.status:503);
    }
    if(current && isLegacyResultsCampaign(current.points,campaignCode)) {
      return noStoreJson({status:"published",format:"legacy-v1",publicationId:current.id,publication:current.points,viewModel:current.points.viewModel,campaign:null,sourceAvailability:"missing_source_artifact",downloadAvailable:false});
    }
    for (const row of current ? [current] : []) {
      if (!isResultsPublicationV2(row.points)) continue;
      if(requestedVersion===RESULTS_SCHEMA_VERSION) return noStoreJson({error:"A publicação vigente usa outro formato. Atualize a consulta.",code:"publication_format_mismatch"},409);
      const campaign = findResultsCampaignV2(row.points, campaignCode);
      if (campaign) {
        const scope = row.points.scope ? {campaignCodes:[campaignCode],campaignHashes:{[campaignCode]:row.points.scope.campaignHashes[campaignCode]}} : undefined;
        return noStoreJson({ status: "published", format:"v2", publication: { ...row.points, campaigns: [campaign], ...(scope ? {scope} : {}) }, campaign });
      }
    }
    return noStoreJson({ status: "empty", publication: null, campaign: null, viewModel:null });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiSession(request, "data.delete");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ error: "Exclusão indisponível até existir operação transacional de vigência." }, { status: 405, headers: { Allow: "GET, POST" } });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    if(formData.get("mode")==="preparation") {
      const client=createOptionalSupabaseClient();if(!client)return noStoreJson({error:"Preparação privada indisponível."},503);
      return noStoreJson(await saveResultsPreparation(client,formData));
    }
    const file = formData.get("file");
    const selectedCampaignValue = formData.get("selectedCampaign");
    const selectedCampaign = resolveCanonicalCampaign(selectedCampaignValue);

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
    if (selectedCampaignValue !== null && !selectedCampaign) {
      return NextResponse.json({ error: "A campanha selecionada não é canônica." }, { status: 400 });
    }
    const requestId = String(formData.get("requestId") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new ResultsStoreError("missing_request_id",422,"Identificador de publicação obrigatório.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { parsed, model } = await parseResultsWorkbookWithModelV2(bytes, file.name);
    if (String(formData.get("sourceSha256") ?? "").toLowerCase() !== parsed.source.sha256.toLowerCase()) throw new ResultsStoreError("stale_source",409,"O arquivo mudou desde a prévia. Valide-o novamente.");
    const availableCodes = parsed.campaigns.map((campaign) => normalizeCampaignCode(campaign.campaignCode));
    if (availableCodes.some((code) => !code || !resolveCanonicalCampaign(Number(code.slice(1))))) {
      return NextResponse.json({ error: "O lote contém uma campanha não canônica." }, { status: 422 });
    }
    if (selectedCampaign) {
      const selectedCode = requestedCampaignCode(selectedCampaign.id, null);
      if (!selectedCode || !availableCodes.includes(selectedCode)) {
        return NextResponse.json(
          { error: "A campanha selecionada não confere com o lote de Resultados." },
          { status: 409 },
        );
      }
    }
    const requestedCodes = parseRequestedCampaignCodes(formData);
    if (!requestedCodes.length) throw new ResultsStoreError("empty_selection",422,"Selecione ao menos uma campanha.");
    const candidate = buildResultsPublicationV2(parsed, requestedCodes);
    candidate.publicationId = requestId;
    const expectedHeads = selectExpectedHeads(JSON.parse(String(formData.get("expectedHeads") ?? "null")),candidate.scope.campaignCodes);
    const supabase = createOptionalSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: "Persistência de resultados indisponível." }, { status: 503 });
    }
    const publication = candidate;
    const persisted = await publishResultsSnapshot(supabase,publication,bytes,model,parsed,expectedHeads,requestId);

    return NextResponse.json({
      fileName: publication.source.fileName,
      schemaVersion: publication.contractVersion,
      calculationVersion: publication.calculationVersion,
      catalogVersion: publication.catalogVersion,
      contentHash: publication.source.sha256,
      campaigns: publication.campaigns.map((campaign) => ({
        campaignCode: campaign.campaignCode,
        counts: campaign.counts,
      })),
      warnings: publication.warnings,
      scope: { selectedCampaignCodes: publication.scope.campaignCodes },
      persistence: {
        mode: "cloud" as const,
        state: persisted.state,
        publicationId: persisted.publicationId,
        message: "Publicação confirmada atomicamente. Consulte as vigências no inventário.",
      },
    });
  } catch (error) {
    if (error instanceof ResultsStoreError) return NextResponse.json({error:error.message,code:error.code},{status:error.status});
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível processar a planilha de Resultados.";

    return NextResponse.json({ error: message }, { status: 422 });
  }
}

function requestedCampaignCode(campaignId: string, campaignNumber: number | null) {
  const byId = campaignId ? resolveCanonicalCampaign(campaignId) : null;
  const byNumber = campaignNumber === null ? null : resolveCanonicalCampaign(campaignNumber);
  if ((campaignId && !byId) || (campaignNumber !== null && !byNumber)) return "";
  if (byId && byNumber && byId.id !== byNumber.id) return "";
  const canonical = byId ?? byNumber;
  const number = canonical
    ? Number(normalizeCampaignKey(canonical.name))
    : campaignNumber;
  return Number.isInteger(number) && Number(number) > 0 ? `C${number}` : "";
}

function parseRequestedCampaignCodes(formData: FormData) {
  const values = formData.getAll("selectedCampaigns")
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const normalized = values.map(normalizeCampaignCode);
  if (normalized.some((value) => !value)) {
    throw new Error("A seleção múltipla contém uma campanha inválida.");
  }
  return normalized;
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
