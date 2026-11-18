import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import { readPrivateCampaignPoints } from "@/lib/private-campaign-points";
import { resolveCanonicalCampaign } from "@/lib/campaign-identity";
import { normalizeMatrixSia } from "@/lib/imports/sia-matrices";
import { readArchiveRequest, type ArchiveGroup } from "@/lib/imports/sia-matrix-archive";

export const runtime = "nodejs";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
function failure(code: string) {
  if (/STALE_PLAN|STALE_PAGE|REQUEST_CONFLICT|ARCHIVE_BUSY|COLLECTION_CHANGED|40001|55P03/.test(code)) return json({ error: "O acervo ou a coleta mudou desde a leitura, ou está em atualização. Consulte ou compare novamente antes de confirmar.", code: "conflict" }, 409);
  if (/UNCONFIRMED_COLLECTION/.test(code)) return json({ error: "Coleta ausente, ambígua ou não confirmada no Diário. Nenhuma incorporação foi feita.", code: "unconfirmed_collection" }, 422);
  if (/GROUP_TOO_LARGE/.test(code)) return json({ error: "Um grupo excede a capacidade de leitura do acervo. Dividir o mesmo grupo em lotes não resolve; revise o escopo do grupo.", code: "group_too_large" }, 413);
  if (/PAYLOAD_TOO_LARGE|DIFF_TOO_LARGE|BATCH_TOO_LARGE/.test(code)) return json({ error: "Lote ou diferenças excedem o limite de processamento/transporte. Reduza os SIAs/grupos e compare novamente; nenhuma aplicação parcial foi solicitada.", code: "payload_too_large" }, 413);
  if (/INVALID|REQUIRED|DUPLICATE/.test(code)) return json({ error: "Dados ou confirmação inválidos. Confira a campanha, coletas, corridas e contagens.", code: "invalid_input" }, 400);
  return json({ error: "Acervo indisponível. Nenhuma nova confirmação foi presumida.", code: "unavailable" }, 503);
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request, "data.import");
  if (!auth.ok) return auth.response;
  const actor = auth.session.authUserId;
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(actor) || actor === "00000000-0000-0000-0000-000000000000") return json({ error: "Identidade autenticada indisponível para registrar a operação." }, 403);
  try {
    const input = await readArchiveRequest(request);
    const client = createOptionalSupabaseClient();
    if (!client) return failure("unavailable");
    const { data, error } = await client.rpc("sia_matrix_archive", {
      p_mode: input.mode, p_sheets: input.sheets, p_actor: actor,
      p_request: input.mode === "apply" ? input.request : null,
      p_expected: input.mode === "apply" ? input.expected : null,
    });
    if (error) return failure(`${error.code} ${error.message}`);
    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 4_000_000) return failure("PAYLOAD_TOO_LARGE");
    return json(data);
  } catch (error) { return failure(error instanceof SyntaxError ? "INVALID_JSON" : error instanceof Error ? error.message : "unavailable"); }
}

export async function GET(request: Request) {
  const auth = await requireApiSession(request, "data.import");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url), campaign = Number(url.searchParams.get("campaign"));
  if (url.searchParams.get("inventory") === "1") {
    const client = createOptionalSupabaseClient(); if (!client) return failure("unavailable");
    const campaigns: number[] = [];
    for (let c = 1; c <= 9; c++) {
      const { data, error } = await client.rpc("sia_matrix_archive_page", { p_campaign: c, p_after: null, p_limit: 1, p_revision: null });
      if (error || !Array.isArray(data?.rows)) return failure("unavailable");
      if (data.rows.length) campaigns.push(c);
    }
    return json({ campaigns });
  }
  if (!Number.isInteger(campaign) || campaign < 1 || campaign > 9) return failure("INVALID_CAMPAIGN");
  if (url.searchParams.get("references") === "1") {
    const campaignId = resolveCanonicalCampaign(campaign)?.id;
    const scoped = (points: CampaignMapPoint[]) => points.filter((point) => resolveCanonicalCampaign(point.campaign)?.id === campaignId);
    const client = createOptionalSupabaseClient();
    let points: CampaignMapPoint[] = [], source = "", sourceStatus = "published";
    if (client) {
      const { data, error, count } = await client.from("campaign_imports").select("id,file_name,created_at,points,point_count", { count: "exact" }).gt("point_count", 0).order("created_at", { ascending: false }).returns<Array<{ id: string; created_at: string; points: CampaignMapPoint[] }>>();
      if (error || !data || count === null || count !== data.length) return json({ error: "Leitura das referências publicadas falhou ou está incompleta. Não foi usada uma fonte alternativa silenciosamente.", status: "unavailable" }, 503);
      const selected = data.find((row) => Array.isArray(row.points) && scoped(row.points).length > 0);
      if (selected) { points = scoped(selected.points); source = `campaign_imports ${selected.id}, publicado em ${selected.created_at}`; }
    }
    if (!points.length) {
      const privatePoints = readPrivateCampaignPoints();
      if (!privatePoints.length) return json({ error: "Fonte privada de referência ausente ou sem integridade validada.", status: "unavailable" }, 503);
      points = scoped(privatePoints); source = "Base privada de campanhas, hash validado"; sourceStatus = points.length ? "historical_fallback" : "campaign_absent_in_available_sources";
    }
    return json({ status: sourceStatus, source, limitation: sourceStatus === "published" ? null : "Fonte histórica local; não é confirmação de completude atual da nuvem.", references: points.flatMap((point) => {
      const sia = normalizeMatrixSia(point.code);
      return sia ? [{ campaign, sia, original: point.original, effective: point.effective, source, sourceDate: point.date }] : [];
    }) });
  }
  let after: unknown = null;
  try {
    if (url.searchParams.has("after")) after = JSON.parse(url.searchParams.get("after")!);
    if (after !== null && (!Array.isArray(after) || after.length !== 7 || after[0] !== campaign || JSON.stringify(after).length > 1024)) return failure("INVALID_CURSOR");
  } catch { return failure("INVALID_CURSOR"); }
  const client = createOptionalSupabaseClient();
  if (!client) return failure("unavailable");
  const revision = url.searchParams.get("revision");
  if (revision !== null && !/^[a-f\d]{64}$/.test(revision)) return failure("INVALID_REVISION");
  if (after !== null && revision === null) return failure("INVALID_REVISION");
  const { data, error } = await client.rpc("sia_matrix_archive_page", { p_campaign: campaign, p_after: after, p_limit: 20, p_revision: revision });
  if (error) return failure(`${error.code} ${error.message}`);
  if (!data || !Array.isArray(data.rows) || typeof data.revision !== "string") return failure("unavailable");
  return json({ groups: data.rows as ArchiveGroup[], next: data.nextAfter, revision: data.revision });
}
