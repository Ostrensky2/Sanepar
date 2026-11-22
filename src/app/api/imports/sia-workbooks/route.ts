import path from "node:path";
import { stat } from "node:fs/promises";
import { requireApiSession } from "@/lib/api-auth";
import { workbookEvidence } from "@/lib/sia-workbook-evidence";
import { workbookStore, workbookLimit, digest } from "@/lib/sia-workbook-store";
import {cloudWorkbookStore,functionWorkbookLimit} from "@/lib/sia-workbook-cloud";
import {createOptionalSupabaseClient} from "@/lib/supabase";

export const runtime="nodejs";
const mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers});
async function store(){
  if(process.env.VERCEL==="1"){
    if(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/,"")!=="https://uoptbbmfgfiuhbmicofp.supabase.co"||process.env.VERCEL_ENV!=="production")throw Error("PRIVATE_STORE_UNAVAILABLE");
    const client=createOptionalSupabaseClient();
    if(!client)throw Error("PRIVATE_STORE_UNAVAILABLE");
    return cloudWorkbookStore(client);
  }
  const base=path.resolve(process.cwd(),"../.local-nuvem");
  if(!(await stat(path.join(base,"rodar-local.ps1"))).isFile()) throw Error("LOCAL_STORE_UNAVAILABLE");
  return workbookStore(path.join(base,"artifacts","sia-workbooks"));
}
export async function GET(req:Request){
  const auth=await requireApiSession(req,"data.import");
  if(!auth.ok)return auth.response;
  if(new URL(req.url).searchParams.get("limits")==="1")return json({maxUploadBytes:process.env.VERCEL==="1"?functionWorkbookLimit:workbookLimit});
  const id=new URL(req.url).searchParams.get("id");
  if(id!==null&&!/^[a-f0-9]{64}$/.test(id))return json({error:"Identificador inválido."},400);
  try{
    const storage=await store();
    if(id===null)return json({artifacts:await storage.list(),maxUploadBytes:process.env.VERCEL==="1"?functionWorkbookLimit:workbookLimit});
    const {bytes,artifact}=await storage.read(id);
    return new Response(new Uint8Array(bytes),{headers:{...headers,"Content-Type":mime,"Content-Length":String(bytes.length),"X-Content-Sha256":artifact.sha256,"Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(artifact.filename)}});
  }catch(e){return (e as NodeJS.ErrnoException).code==="ENOENT"&&id?json({error:"Arquivo não encontrado."},404):json({error:"Acervo indisponível ou arquivo sem integridade."},503);}
}
export async function POST(req:Request){
  const auth=await requireApiSession(req,"data.import");
  if(!auth.ok)return auth.response;
  const q=new URL(req.url).searchParams, campaign=Number(q.get("campaign")),filename=q.get("filename")??"",hash=req.headers.get("x-content-sha256")??"";
  if(!Number.isInteger(campaign)||campaign<1||campaign>9||!filename.toLowerCase().endsWith(".xlsx")||filename.length>180||/[\\/\x00-\x1f\x7f]/.test(filename)||!/^[0-9a-f]{64}$/.test(hash))return json({error:"Metadados inválidos."},400);
  const reader=req.body?.getReader();
  if(!reader)return json({error:"Arquivo ausente."},400);
  const limit=process.env.VERCEL==="1"?functionWorkbookLimit:workbookLimit;
  const chunks:Uint8Array[]=[];let size=0;
  try{
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return json({error:"Arquivo excede o limite de "+limit+" bytes."},413);}chunks.push(value);}
  }catch{return json({error:"Transferência incompleta."},400);}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);
  if(digest(bytes)!==hash)return json({error:"SHA-256 divergente."},422);
  let evidence;
  try{evidence=await workbookEvidence(bytes,campaign);}
  catch{return json({error:"Estrutura, campanha ou referências internas do XLSX incompatíveis."},422);}
  try{const receipt=await (await store()).save(campaign,filename,bytes,hash,{...evidence,createdBy:auth.session.userId});return json(receipt,receipt.created?201:200);}
  catch{return json({error:"Falha ao persistir ou conferir o artefato."},503);}
}
