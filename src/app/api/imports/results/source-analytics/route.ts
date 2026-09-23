import { requireApiSession } from "@/lib/api-auth";
import { getAuditedSource, localSourcePreviewAllowed, tableRows } from "@/lib/results-source-preview";
import { aggregateSource } from "@/lib/results-source-analytics";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { readPublishedResultsSource, ResultsStoreError } from "@/lib/results-publication-store";
import { molecularSheetName } from "@/modules/results/sheet-names";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
  const query = new URL(request.url).searchParams;
  const published = query.get("source") === "published";
  if(!published && !localSourcePreviewAllowed(request))return json({error:"Prévia somente local."},403);
  const auth=await requireApiSession(request,published ? "data.view" : "data.import");if(!auth.ok)return auth.response;
  try {
    const client = published ? createOptionalSupabaseClient() : null;
    if(published && !client)return json({error:"Fonte indisponível."},503);
    const data=published ? await readPublishedResultsSource(client!,query) : await getAuditedSource();
    const {model,parsed}=data;
    const name=molecularSheetName(model.sheets.map(s=>s.name));
    const molecular = model.sheets.find(s=>s.name===name)!;
    const result=aggregateSource(parsed,tableRows(molecular,0).rows,tableRows(model.sheets.find(s=>s.name==="Riscos_bibliografia")!,4).rows,query,molecular.name);
    return json("source" in data ? {...result,source:data.source} : result);
  } catch(error) {return json({error:error instanceof ResultsStoreError ? error.message : "Fonte/filtros incompatíveis; atualize a prévia.",code:error instanceof ResultsStoreError ? error.code : "source_unavailable"},error instanceof ResultsStoreError ? error.status : 409);}
}
