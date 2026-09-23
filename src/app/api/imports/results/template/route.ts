import { requireApiSession } from "@/lib/api-auth";
import { localSourcePreviewAllowed, readExactPreviewDownload } from "@/lib/results-source-preview";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { readPublishedResultsSource, ResultsStoreError } from "@/lib/results-publication-store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const json=(body:unknown,status:number)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
  const query=new URL(request.url).searchParams;
  const auth=await requireApiSession(request,query.get("source")==="published" ? "data.view" : "data.import");
  if(!auth.ok)return auth.response;
  const published=query.get("source")==="published";
  if(!published && query.get("source")!=="local-corrected-preview") return json({error:"Informe a fonte consultada."},422);
  if(!published && !localSourcePreviewAllowed(request))return json({error:"Prévia disponível somente no ambiente local."},403);
  try {
    const client=published ? createOptionalSupabaseClient() : null;
    if(published && !client)return json({error:"Fonte indisponível."},503);
    const stored=published ? await readPublishedResultsSource(client!,query,true) : null;
    const file=stored ? {bytes:stored.bytes!,fileName:stored.source.fileName,sha256:stored.source.sha256} : await readExactPreviewDownload(query.get("sourceHash")??"",query.get("campaignCode")??"");
    return new Response(new Uint8Array(file.bytes),{headers:{
      "Cache-Control":"no-store","Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "X-Source-SHA256":file.sha256,"X-Export-Scope":"complete-source-workbook",
    }});
  } catch(error) {return json({error:error instanceof ResultsStoreError ? error.message : "Fonte indisponível ou versão alterada; atualize a prévia.",code:error instanceof ResultsStoreError ? error.code : "source_unavailable"},error instanceof ResultsStoreError ? error.status : 409);}
}
