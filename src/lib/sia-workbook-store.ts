import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readdir, readFile, link, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const workbookLimit = 32 * 1024 * 1024;
export const digest = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
export const idFor = (campaign: number, filename: string, hash: string) => digest(JSON.stringify([campaign, filename, hash]));
export type Attribution={createdBy:string;sourcesDeclared:{filename:string;sha256:string}[];pendingCount:number;corroboration:"workbook-internal"};
export type WorkbookArtifact = Attribution & {id:string; campaign:number; filename:string; sha256:string; size:number; version:string; createdAt:string; state:"generated"};
const missing = (e:unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";

export function workbookStore(root:string) {
  const location=(id:string)=>{
    if(!/^[0-9a-f]{64}$/.test(id)) throw Error("INVALID_ID");
    return path.join(root,id);
  };
  async function metadata(id:string) {
    const f=await open(location(id),"r");
    try {
      const header=Buffer.alloc(65536);
      const {bytesRead}=await f.read(header,0,header.length,0);
      const end=header.subarray(0,bytesRead).indexOf(10);
      if(end<0) throw Error("INTEGRITY");
      const a:WorkbookArtifact=JSON.parse(header.toString("utf8",0,end));
      if(a.id!==id || idFor(a.campaign,a.filename,a.sha256)!==id || a.version!==a.sha256 ||
        a.state!=="generated" || (await f.stat()).size!==end+1+a.size) throw Error("INTEGRITY");
      return {artifact:a,offset:end+1};
    } finally {await f.close();}
  }
  async function read(id:string) {
    const {artifact,offset}=await metadata(id);
    const bytes=(await readFile(location(id))).subarray(offset);
    if(bytes.length!==artifact.size || digest(bytes)!==artifact.sha256) throw Error("INTEGRITY");
    return {artifact,bytes};
  }
  return {read, async list(){
    const names=await readdir(root).catch(e=>{if(missing(e))return []; throw e;});
    const records=await Promise.all(names.filter(n=>/^[0-9a-f]{64}$/.test(n)).map(metadata));
    return records.map(r=>r.artifact).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  },async save(campaign:number,filename:string,bytes:Buffer,sha256:string,attribution:Attribution){
    const id=idFor(campaign,filename,sha256);
    if(bytes.length>workbookLimit || digest(bytes)!==sha256) throw Error("INTEGRITY");
    const artifact:WorkbookArtifact={...attribution,id,campaign,filename,sha256,size:bytes.length,version:sha256,createdAt:new Date().toISOString(),state:"generated"};
    if(Buffer.byteLength(JSON.stringify(artifact))>=65536)throw Error("HEADER_LIMIT");
    await mkdir(root,{recursive:true,mode:0o700});
    const temp=path.join(root,"tmp-"+randomUUID());
    try {
      await writeFile(temp,Buffer.concat([Buffer.from(JSON.stringify(artifact)+"\n"),bytes]),{flag:"wx",mode:0o600,flush:true});
      try {await link(temp,location(id));}
      catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;return {artifact:(await read(id)).artifact,created:false};}
      return {artifact,created:true};
    } finally {await unlink(temp).catch(e=>{if(!missing(e))throw e;});}
  }};
}
