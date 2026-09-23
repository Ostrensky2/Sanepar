import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { ResultsStoreError } from "@/lib/results-publication-store";
import { readMethodologyDocument } from "@/lib/results-methodology-document";

export const runtime="nodejs";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
// Registration remains unavailable under HOLD. No POST handler or write adapter.
export async function GET(request:Request) {
  const auth=await requireApiSession(request,"data.view");
  if(!auth.ok)return auth.response;
  try {
    const client=createOptionalSupabaseClient();if(!client)throw new ResultsStoreError("methodology_unavailable",503,"Persistência indisponível.");
    return json(await readMethodologyDocument(client,new URL(request.url).searchParams));
  }catch(error){const code=error instanceof ResultsStoreError?error.code:"invalid_methodology_document",status=error instanceof ResultsStoreError?error.status:422;return json({status:code==="methodology_persistence_pending"?"persistence_pending":status===503?"unavailable":"invalid",persistencePending:code==="methodology_persistence_pending",error:error instanceof ResultsStoreError?error.message:"Cadastro/consulta inválido.",code},status);}
}
