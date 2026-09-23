import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCanonicalCampaign } from "@/lib/campaign-identity";
import { isResultsPublicationV2, type ResultsPublicationV2, type ResultsPublicationV2Row } from "./results-v2-persistence";
import type { ResultsInventoryItem, ResultsInventoryResponse, ResultsExpectedHeads } from "./results-publication-contract";
import { isResultsPublication, type ResultsPublication } from "./imports/results-contract";
import type { ResultsWorkbookExportModel, ResultsWorkbookImport } from "@/modules/results/types";

export class ResultsStoreError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
type Snapshot = { heads: ResultsExpectedHeads; publications: ResultsPublicationV2Row[]; sourceHashes: string[] };
function databaseError(error: {code?: string;message?:string}): never {
  if (error.message?.includes("IDEMPOTENCY_KEY_REUSED")) throw new ResultsStoreError("idempotency_conflict",409,"A chave desta tentativa já foi usada para outro conteúdo. Gere uma nova prévia.");
  if (error.code === "23505") throw new ResultsStoreError("source_conflict",409,"Fonte ou publicação já existente com conteúdo diferente.");
  if (error.code === "40001") throw new ResultsStoreError("stale_scope",409,"A vigência mudou. Gere uma nova prévia antes de publicar.");
  if (error.code === "22023" || error.code === "23514") throw new ResultsStoreError("invalid_publication",422,"Fonte, seleção ou chave de repetição incompatível.");
  throw new ResultsStoreError("persistence_unavailable",503,"Não foi possível confirmar a operação. Consulte o inventário antes de repetir.");
}
export async function readResultsSnapshot(client: SupabaseClient): Promise<Snapshot> {
  const {data,error}=await client.rpc("read_results_inventory");
  if(error) databaseError(error);
  if(!data || !data.heads || typeof data.heads!=="object" || Array.isArray(data.heads) || !Array.isArray(data.publications) || !Array.isArray(data.sourceHashes)) throw new ResultsStoreError("invalid_inventory",503,"Inventário indisponível.");
  return data as Snapshot;
}
export function resultsInventory(snapshot: Snapshot): ResultsInventoryResponse {
  const campaigns: ResultsInventoryItem[] = [];
  for (let number=1;number<=9;number++) {
    const code=`C${number}`;
    const row=currentResultsPublication(snapshot,code);
    if(!row) continue;
    const canonical=resolveCanonicalCampaign(Number(code.slice(1)));
    if(!canonical) continue;
    const identity={campaignCode:code,canonicalId:canonical.id,canonicalName:canonical.name,publicationId:row.id};
    if(isLegacyResultsCampaign(row.points,code)) {
      campaigns.push({...identity,format:"legacy-v1",publishedAt:row.points.importedAt,source:{sha256:null,fileName:row.points.fileName},counts:{total:row.points.viewModel.points.length,complete:null,partialWithTwoSets:null,partialWithOneSet:null,unavailable:null},downloadAvailable:false,sourceAvailability:"missing_source_artifact"});
    } else if(isResultsPublicationV2(row.points)) {
      const campaign=row.points.campaigns.find(c=>c.campaignCode===code)!;
      const available=snapshot.sourceHashes.includes(row.points.source.sha256.toLowerCase());
      campaigns.push({...identity,format:"v2",publishedAt:row.points.publishedAt,source:{sha256:row.points.source.sha256.toLowerCase(),fileName:row.points.source.fileName},counts:campaign.counts,downloadAvailable:available,sourceAvailability:available?"available":"missing_source_artifact"});
    }
  }
  const historicalPublications: NonNullable<ResultsInventoryResponse["historicalPublications"]> = snapshot.publications
    .filter(row=>!Object.values(snapshot.heads).includes(row.id))
    .map(row=>({publicationId:row.id,createdAt:row.created_at,format:Array.isArray(row.points)?"legacy-array":isResultsPublication(row.points)?"legacy-v1":isResultsPublicationV2(row.points)?"v2":"unrecognized",campaignCode:null,recordCount:Array.isArray(row.points)?row.points.length:null,sourceAvailability:"unavailable_in_history"}));
  return {campaigns,totalCampaigns:9,publishedCount:campaigns.length,expectedHeads:Object.fromEntries(Array.from({length:9},(_,i)=>[`C${i+1}`,snapshot.heads[`C${i+1}`]??null])),historicalPublications};
}
export function isLegacyResultsCampaign(value: unknown, code: string): value is ResultsPublication {
  if(!isResultsPublication(value) || code!==`C${value.campaignNumber}`) return false;
  const canonical=resolveCanonicalCampaign(value.campaignNumber);
  return canonical?.id===value.campaignId && typeof value.fileName==="string" && Number.isFinite(Date.parse(value.importedAt));
}
/** Only database heads choose current publications; history never becomes an implicit fallback. */
export function currentResultsPublication(snapshot: Snapshot, code: string): ResultsPublicationV2Row | null {
  const id=snapshot.heads[code];
  if(!id) {
    if(snapshot.publications.some(row=>isLegacyResultsCampaign(row.points,code))) throw new ResultsStoreError("legacy_head_unavailable",409,"Publicação legada preservada; a vigência ainda não está disponível.");
    return null;
  }
  const rows=snapshot.publications.filter(row=>row.id===id);
  if(rows.length!==1 || !(isLegacyResultsCampaign(rows[0].points,code) || isResultsPublicationV2(rows[0].points) && rows[0].points.campaigns.some(c=>c.campaignCode===code))) throw new ResultsStoreError("invalid_publication_head",409,"A publicação vigente não corresponde à campanha solicitada.");
  return rows[0];
}
export function selectExpectedHeads(value: unknown, codes: string[]): ResultsExpectedHeads {
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new ResultsStoreError("missing_preview",422,"Prévia e vigências esperadas obrigatórias.");
  const record=value as Record<string,unknown>;
  return Object.fromEntries(codes.map(code=>{
    if(!(code in record) || record[code]!==null && (typeof record[code]!=="string" || !/^[0-9a-f-]{36}$/i.test(record[code] as string))) throw new ResultsStoreError("missing_preview",422,"Seleção sem vigência esperada.");
    return [code,record[code] as string|null];
  }));
}
export async function publishResultsSnapshot(client: SupabaseClient, publication: ResultsPublicationV2, bytes: Uint8Array, model: ResultsWorkbookExportModel, parsed: ResultsWorkbookImport, expectedHeads: ResultsExpectedHeads, requestId: string) {
  const {data,error}=await client.rpc("publish_results_snapshot",{p_publication:publication,p_source_base64:Buffer.from(bytes).toString("base64"),p_model:model,p_parsed:parsed,p_expected_heads:expectedHeads,p_request_id:requestId});
  if(error) databaseError(error);
  if(!data || data.state!=="published" || typeof data.publicationId!=="string") throw new ResultsStoreError("unknown_outcome",503,"Resultado não confirmado; consulte o inventário.");
  return data as {state:"published";publicationId:string;requestId:string;sourceSha256:string;selectedCampaignCodes:string[];heads:ResultsExpectedHeads};
}
export async function readPublishedResultsSource(client: SupabaseClient, query: URLSearchParams, includeBytes=false) {
  const campaignCode=query.get("campaignCode")??"", publicationId=query.get("publicationId")??"", hash=query.get("sourceHash")?.toLowerCase()??"";
  if(!/^C[1-9]$/.test(campaignCode)||!/^[0-9a-f-]{36}$/i.test(publicationId)||(hash!==""&&!/^[a-f0-9]{64}$/.test(hash))) throw new ResultsStoreError("invalid_source",422,"Identidade da publicação e hash inválidos.");
  const {data,error}=await client.rpc("read_results_source",{p_campaign_code:campaignCode,p_publication_id:publicationId,p_source_sha256:hash||null,p_include_bytes:includeBytes});
  if(error) databaseError(error);
  if(data?.availability==="missing_source_artifact") throw new ResultsStoreError("missing_source_artifact",409,"A publicação está preservada, mas seu arquivo-fonte e catálogo analítico não estão disponíveis. Nenhuma fonte alternativa foi utilizada.");
  if(!hash) throw new ResultsStoreError("invalid_source",422,"Hash da fonte obrigatório para leitura analítica.");
  if(!data || data.sourceSha256!==hash || !data.model || !data.parsed) throw new ResultsStoreError("source_unavailable",409,"Fonte privada desta publicação não recuperável.");
  const parsed=data.parsed as ResultsWorkbookImport, model=data.model as ResultsWorkbookExportModel;
  if(parsed.source.sha256.toLowerCase()!==hash || !parsed.campaigns.some(c=>c.campaignCode===campaignCode)) throw new ResultsStoreError("invalid_source",409,"Fonte da publicação inconsistente.");
  // The artifact may contain unselected campaigns. Never activate them through a read.
  const activeCodes: string[] = Array.isArray(data.currentCampaignCodes) ? data.currentCampaignCodes : [campaignCode];
  if(!activeCodes.includes(campaignCode)) throw new ResultsStoreError("stale_scope",409,"A vigência mudou durante a leitura.");
  const scopedParsed={...parsed,campaigns:parsed.campaigns.filter(c=>activeCodes.includes(c.campaignCode))};
  const scopedModel={...model,campaignCodes:scopedParsed.campaigns.map(c=>c.campaignCode)};
  const bytes=includeBytes && typeof data.originalBase64==="string" ? Buffer.from(data.originalBase64,"base64") : undefined;
  if(includeBytes && (!bytes || createHash("sha256").update(bytes).digest("hex")!==hash)) throw new ResultsStoreError("invalid_source",409,"Binário privado divergente da publicação.");
  return {parsed:scopedParsed,model:scopedModel,bytes,source:{kind:"published" as const,published:true,publicationId,sha256:hash,fileName:String(data.fileName)}};
}
