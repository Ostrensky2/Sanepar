import { requireApiSession } from "@/lib/api-auth";
import { readPrivateMethodologyPdf,METHODOLOGY_PDF_SHA256 } from "@/lib/private-methodology-pdf";

export const runtime="nodejs";
export async function GET(request:Request) {
  const auth=await requireApiSession(request,"data.view");
  if(!auth.ok)return auth.response;
  const query=new URL(request.url).searchParams;
  if(query.getAll("historical").length!==1 || query.get("historical")!=="1" || [...query.keys()].some(key=>key!=="download" && key!=="historical")||query.getAll("download").length>1||(query.has("download")&&query.get("download")!=="1"))return Response.json({error:"Escolha explicitamente o documento histórico."},{status:422,headers:{"Cache-Control":"private, no-store"}});
  try {
    const bytes=await readPrivateMethodologyPdf();
    return new Response(new Uint8Array(bytes),{headers:{
      "Content-Type":"application/pdf",
      "Content-Disposition":`${query.get("download")==="1"?"attachment":"inline"}; filename="Metodologia-historica.pdf"`,
      "X-Results-Status":"historical-not-0.8",
      "Content-Length":String(bytes.byteLength),
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
      "X-Document-SHA256":METHODOLOGY_PDF_SHA256,
    }});
  }catch{return Response.json({error:"Descrição metodológica indisponível neste ambiente."},{status:503,headers:{"Cache-Control":"private, no-store"}});}
}
