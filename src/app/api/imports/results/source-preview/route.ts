import { requireApiSession } from "@/lib/api-auth";
import { getResultsSourcePreview, localSourcePreviewAllowed, selectSourcePreview } from "@/lib/results-source-preview";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { readPublishedResultsSource, ResultsStoreError } from "@/lib/results-publication-store";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const query = new URL(request.url).searchParams;
  const published = query.get("source") === "published";
  if (!published && !localSourcePreviewAllowed(request)) return json({ error: "Prévia disponível somente no ambiente local." }, 403);
  const auth = await requireApiSession(request, published ? "data.view" : "data.import");
  if (!auth.ok) return auth.response;
  try {
    if (!published) return json(await getResultsSourcePreview(query));
    const client = createOptionalSupabaseClient();
    if (!client) return json({error:"Fonte indisponível."},503);
    const {model,parsed,source} = await readPublishedResultsSource(client,query);
    return json({...selectSourcePreview(model,query),source,campaign:parsed.campaigns.find(c=>c.campaignCode===query.get("campaignCode")),warnings:parsed.warnings});
  } catch (error) { return json({ error: error instanceof ResultsStoreError ? error.message : "Prévia indisponível: confira filtros, acesso à fonte e hash autorizado.", code:error instanceof ResultsStoreError ? error.code : "source_unavailable" },error instanceof ResultsStoreError ? error.status : 422); }
}
