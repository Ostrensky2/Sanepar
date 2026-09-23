import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { readPublishedResultsSource, ResultsStoreError } from "@/lib/results-publication-store";
import { queryResultsResearch } from "@/lib/results-research";
import { bibliographyPreparationModel, readResultsPreparation } from "@/lib/results-preparation";

export const runtime = "nodejs";
export async function GET(request:Request) {
  const auth=await requireApiSession(request,"data.view");
  if(!auth.ok)return auth.response;
  const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
  try {
    const client=createOptionalSupabaseClient();if(!client)return json({error:"Fonte privada indisponível."},503);
    const query=new URL(request.url).searchParams;
    if(query.get("source")==="preparation") {
      const revisionHash=query.get("revisionHash")??"";
      if(!/^[a-f0-9]{64}$/.test(revisionHash))return json({error:"Revisão bibliográfica por hash obrigatória."},422);
      const stored=await readResultsPreparation(client,query.get("packageKey"),revisionHash);
      if(stored.revisionHash!==revisionHash)throw new ResultsStoreError("preparation_conflict",409,"Revisão retornada divergente.");
      const model=bibliographyPreparationModel(stored);
      return json(queryResultsResearch(model,null,{kind:"preparation",published:false,publicationId:null,sha256:null,revisionHash,packageKey:stored.packageKey??query.get("packageKey")??"",fileName:stored.manifest.files.map(f=>f.fileName).join("; ")},query));
    }
    const {model,parsed,source}=await readPublishedResultsSource(client,query);
    return json(queryResultsResearch(model,parsed,{...source,published:true},query));
  } catch(error) {
    return json({error:error instanceof Error?error.message:"Consulta indisponível.",code:error instanceof ResultsStoreError?error.code:"invalid_research_query"},error instanceof ResultsStoreError?error.status:422);
  }
}
