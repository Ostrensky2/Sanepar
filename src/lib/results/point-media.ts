import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createOptionalSupabaseClient } from "@/lib/supabase";

// Trusted, reviewed installation metadata. No database/link/name fallback:
// a diary pointer alone cannot attest the identity of the original photograph.
export type Attestation = {campaign:number; sia:number; date:string|null; conflict:boolean; file?:string; storagePath?:string; digest:string};
export type MediaItem = Pick<Attestation,"date"|"file"|"storagePath"|"digest">;
type Scope = {items:MediaItem[]; conflict:boolean; installed:boolean};
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
export const mediaId = (campaign:number, sia:number, item:MediaItem) => sha(JSON.stringify([campaign,sia,item.date,item.digest]));

export function resolveAttestedMedia(rows:Attestation[], campaign:number, sia:number):Scope {
  const items:MediaItem[] = [];
  let conflict = false;
  for (const row of rows.filter(r=>r.campaign===campaign && r.sia===sia)) {
    const date=row.date;
    const local=typeof row.file==="string" && path.isAbsolute(row.file);
    const stored=typeof row.storagePath==="string" && validObjectKey(row.storagePath);
    if (row.conflict !== false || !/^[a-f0-9]{64}$/.test(row.digest) || local===stored ||
        (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)) ||
        rows.some(r=>r.digest===row.digest && (r.campaign!==campaign || r.sia!==sia || r.date!==date))) {
      conflict=true; continue;
    }
    if (!items.some(i=>i.digest===row.digest)) items.push({date,file:local?row.file:undefined,storagePath:stored?row.storagePath:undefined,digest:row.digest});
  }
  return {items,conflict,installed:true};
}
function validObjectKey(key:string) {
  return key.length>0 && key.length<=1024 && !/[\\:%?#]/.test(key) && [...key].every(s=>s.charCodeAt(0)>=32) && key.split("/").every(s=>s && s!=="." && s!=="..");
}
async function readPrivateObject(bucket:"photos"|"documents",key:string,limit:number) {
  const client=createOptionalSupabaseClient();
  if (!client || !validObjectKey(key)) throw Error("Private storage unavailable");
  const {data,error}=await client.storage.from(bucket).download(key);
  if (error || !data || !data.size || data.size>limit) throw Error("Private object unavailable");
  return Buffer.from(await data.arrayBuffer());
}

async function privateFile(file:string,limit:number) {
  if (!path.isAbsolute(file)) throw Error("Invalid private source");
  const location=await realpath(file), rel=path.relative(await realpath(process.cwd()),location);
  if (!rel || !(rel===".." || rel.startsWith(".."+path.sep) || path.isAbsolute(rel))) throw Error("Private source inside application");
  const meta=await stat(location);
  if (!meta.isFile() || meta.size===0 || meta.size>limit) throw Error("Invalid private source");
  return readFile(location);
}
const attestationColumns=["campaign","sia","date","conflict","storagePath","digest"] as const;
/** Atestação em JSON (lista) ou CSV com o cabeçalho campaign,sia,date,conflict,storagePath,digest. */
export function parseAttestationText(text:string):Attestation[] {
  const body=text.replace(/^\uFEFF/,"").trim();
  if (body.startsWith("[")) return JSON.parse(body);
  const [header,...lines]=body.split(/\r?\n/);
  if (header!==attestationColumns.join(",")) throw Error("Invalid attestation header");
  return lines.filter(Boolean).map(line=>{
    const cells=line.split(",");
    if (cells.length!==attestationColumns.length || !/^\d+$/.test(cells[0]) || !/^\d+$/.test(cells[1]) || !["true","false"].includes(cells[3])) throw Error("Invalid attestation row");
    return {campaign:Number(cells[0]),sia:Number(cells[1]),date:cells[2]||null,conflict:cells[3]==="true",storagePath:cells[4],digest:cells[5]};
  });
}
async function readAttestations():Promise<Attestation[]|null> {
  // Optional deployment contract. No cloud configuration, upload, or access
  // change is performed here. The reviewed digest is server-side, never a URL
  // or key supplied by a request. Missing attestation means no gallery.
  if (process.env.VERCEL==="1") {
    const hash=process.env.YVAE_PRIVATE_MEDIA_ATTESTATION_SHA256;
    if (!hash) return null;
    if (!/^[a-f0-9]{64}$/.test(hash)) throw Error("Invalid attestation");
    // O bucket de documentos aceita CSV e não JSON; a mesma atestação pode estar em qualquer dos dois formatos.
    const raw=await readPrivateObject("documents",`attestations/point-media/${hash}.csv`,2*1024*1024)
      .catch(()=>readPrivateObject("documents",`attestations/point-media/${hash}.json`,2*1024*1024));
    if (sha(raw)!==hash) throw Error("Unverified attestation");
    const rows:Attestation[]=parseAttestationText(raw.toString("utf8"));
    if (!Array.isArray(rows) || rows.some(r=>r.file!==undefined)) throw Error("Invalid storage attestation");
    return rows;
  }
  const index=process.env.YVAE_PRIVATE_MEDIA_INDEX || (!process.env.VERCEL && process.platform==="win32" && process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA,"Yvae","point-media-20261122","reviewed-v1.json") : "");
  if (!index) return null;
  try {
    const rows:Attestation[]=JSON.parse((await privateFile(index,2*1024*1024)).toString("utf8"));
    if (!Array.isArray(rows)) throw Error("Invalid index");
    return rows;
  } catch(e) { if ((e as NodeJS.ErrnoException).code==="ENOENT") return null; throw e; }
}
export async function pointMedia(campaign:number,sia:number):Promise<Scope> {
  const rows=await readAttestations();
  return rows ? resolveAttestedMedia(rows,campaign,sia) : {installed:false,items:[],conflict:false};
}
export async function mediaById(id:string) {
  const rows=await readAttestations();
  const row=rows?.find(r=>mediaId(r.campaign,r.sia,r)===id);
  if (!rows || !row) return null;
  const item=resolveAttestedMedia(rows,row.campaign,row.sia).items.find(r=>mediaId(row.campaign,row.sia,r)===id);
  return item ? {campaign:row.campaign,sia:row.sia,item} : null;
}
export async function imageBytes(item:MediaItem) {
  const b=item.file ? await privateFile(item.file,32*1024*1024) : await readPrivateObject("photos",item.storagePath??"",32*1024*1024);
  if (sha(b)!==item.digest) throw Error("Unverified image");
  return b;
}
/** First reviewed photo of each SIA in a campaign (map card), only for scopes without conflict. */
export async function campaignCoverMedia(campaign:number):Promise<Map<number,{id:string;item:MediaItem}>> {
  const rows=await readAttestations();
  const covers=new Map<number,{id:string;item:MediaItem}>();
  if (!rows) return covers;
  for (const sia of [...new Set(rows.filter(r=>r.campaign===campaign).map(r=>r.sia))]) {
    const {items,conflict}=resolveAttestedMedia(rows,campaign,sia);
    const first=[...items].sort((a,b)=>String(a.date??"").localeCompare(String(b.date??"")))[0];
    if (!conflict && first) covers.set(sia,{id:mediaId(campaign,sia,first),item:first});
  }
  return covers;
}
