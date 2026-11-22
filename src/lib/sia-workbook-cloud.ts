import type { SupabaseClient } from "@supabase/supabase-js";
import { RESULTS_UPLOAD_BUCKET } from "@/lib/imports/results-upload-contract";
import { digest,idFor,type Attribution,type WorkbookArtifact } from "./sia-workbook-store";

export const functionWorkbookLimit=4_000_000;
const prefix="sia-workbooks-v1";
const mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const validId=(s:string)=>/^[0-9a-f]{64}$/.test(s);

export async function cloudWorkbookStore(client:SupabaseClient){
  const {data:config,error}=await client.storage.getBucket(RESULTS_UPLOAD_BUCKET);
  if(error||!config||config.public!==false||config.id!==RESULTS_UPLOAD_BUCKET||
    !config.allowed_mime_types?.includes(mime)||!config.allowed_mime_types.includes("application/octet-stream")||
    Number(config.file_size_limit)<functionWorkbookLimit)throw Error("PRIVATE_STORE_UNAVAILABLE");
  const store=client.storage.from(RESULTS_UPLOAD_BUCKET);
  async function insert(key:string,b:Buffer,type:string){
    const {error}=await store.upload(key,b,{contentType:type,upsert:false});
    if(!error)return true;
    if(["409","Duplicate","ResourceAlreadyExists"].includes(String(error.statusCode))||
      ["Duplicate","ResourceAlreadyExists"].includes(error.name) || error.message==="The resource already exists")return false;
    throw Error("STORE_WRITE");
  }
  async function get(key:string){
    const {data,error}=await store.download(key);
    if(error||!data){
      if(String(error?.statusCode)==="404"||error?.message==="Object not found")throw Object.assign(Error("MISSING"),{code:"ENOENT"});
      throw Error("STORE_READ");
    }
    return Buffer.from(await data.arrayBuffer());
  }
  async function metadata(id:string):Promise<WorkbookArtifact>{
    if(!validId(id))throw Error("INVALID_ID");
    const raw=await get(prefix+"/records/"+id);
    if(raw.length>=65536)throw Error("INTEGRITY");
    const a=JSON.parse(raw.toString("utf8")) as WorkbookArtifact;
    if(a.id!==id||!validId(a.sha256)||idFor(a.campaign,a.filename,a.sha256)!==id||a.version!==a.sha256||
      a.state!=="generated"||!Number.isInteger(a.size)||a.size<1||a.size>functionWorkbookLimit)throw Error("INTEGRITY");
    return a;
  }
  async function read(id:string){
    const artifact=await metadata(id),bytes=await get(prefix+"/bytes/"+artifact.sha256+".xlsx");
    if(bytes.length!==artifact.size||digest(bytes)!==artifact.sha256)throw Error("INTEGRITY");
    return {artifact,bytes};
  }
  return {read, async list(){
    const artifacts:WorkbookArtifact[]=[];
    for(let offset=0;;offset+=50){
      const {data,error}=await store.list(prefix+"/records",{offset,limit:50,sortBy:{column:"name",order:"asc"}});
      if(error||!data)throw Error("STORE_LIST");
      artifacts.push(...await Promise.all(data.map(x=>metadata(x.name))));
      if(data.length<50)break;
    }
    return artifacts.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  },async save(campaign:number,filename:string,bytes:Buffer,sha256:string,attribution:Attribution){
    if(bytes.length>functionWorkbookLimit||digest(bytes)!==sha256)throw Error("INTEGRITY");
    const id=idFor(campaign,filename,sha256);
    const record:WorkbookArtifact={...attribution,id,campaign,filename,sha256,size:bytes.length,version:sha256,createdAt:new Date().toISOString(),state:"generated"};
    const manifest=Buffer.from(JSON.stringify(record));
    if(manifest.length>=65536)throw Error("HEADER_LIMIT");
    const key=prefix+"/bytes/"+sha256+".xlsx";
    await insert(key,bytes,mime);
    const stored=await get(key);
    if(stored.length!==bytes.length||digest(stored)!==sha256)throw Error("INTEGRITY");
    // The immutable record makes the workbook visible only after verified bytes exist.
    const created=await insert(prefix+"/records/"+id,manifest,"application/octet-stream");
    return {artifact:await metadata(id),created};
  }};
}
