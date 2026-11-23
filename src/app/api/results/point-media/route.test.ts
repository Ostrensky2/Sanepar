import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(()=>vi.fn());
const download = vi.hoisted(()=>vi.fn());
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:()=>({storage:{from:(bucket:string)=>({download:(key:string)=>download(bucket,key)})}})}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:auth}));
const indexRows=vi.hoisted(()=>vi.fn(async (_campaign:number,sia:number)=>[2,3].includes(sia)));
vi.mock("@/lib/results/point-media-scope",()=>({authorizedDiaryPointExists:indexRows}));
vi.mock("@/lib/results/point-media",async importOriginal=>{
  const m=await importOriginal<typeof import("@/lib/results/point-media")>();
  return {...m,pointMedia:vi.fn(m.pointMedia),mediaById:vi.fn(m.mediaById),imageBytes:vi.fn(m.imageBytes)};
});
import {GET} from "./route";
import {imageBytes,mediaById,mediaId,pointMedia,resolveAttestedMedia,type Attestation} from "@/lib/results/point-media";

const request=(q:string)=>GET(new Request("http://localhost/api/results/point-media?"+q));
let dir:string, file:string, manifest:string, row:Attestation;
beforeAll(async()=>{
  dir=await mkdtemp(path.join(tmpdir(),"yv-gallery-"));file=path.join(dir,"synthetic.png");manifest=path.join(dir,"fixture.json");
  const b=await sharp({create:{width:3,height:2,channels:3,background:"white"}}).png().toBuffer();
  await writeFile(file,b,{flag:"wx"});
  row={campaign:2,sia:2,date:"2026-01-02",conflict:false,file,digest:createHash("sha256").update(b).digest("hex")};
  await writeFile(manifest,JSON.stringify([row]),{flag:"wx"});
});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()});
afterAll(async()=>{await unlink(manifest);await unlink(file);await rmdir(dir)});
describe("galeria privada por seleção",()=>{
  it.each([401,403])("valida sessão e permissão antes do índice inclusive para binário (%s)",async status=>{
    auth.mockResolvedValue({ok:false,response:new Response(null,{status})});
    for (const q of ["campaign=2&sia=2","id="+"a".repeat(64)]) expect((await request(q)).status).toBe(status);
    expect(auth.mock.calls.every(c=>c[1]==="data.view")).toBe(true);
  });
  it("sem acervo instalado não expõe vínculo, nem aceita caminho ou chave não atestada",async()=>{
    vi.stubEnv("YVAE_PRIVATE_MEDIA_INDEX",path.join(dir,"missing"));auth.mockResolvedValue({ok:true});
    expect(await (await request("campaign=2&sia=2")).json()).toEqual({installed:false,status:"unavailable",visits:[]});
    expect((await request("id="+"a".repeat(64))).status).toBe(404);
    expect((await request("campaign=2&sia=2&path=x")).status).toBe(400);
    expect((await request("campaign=2&sia=99")).status).toBe(404);
  });
  it("data.view sem campaigns.view recebe 403 sem acesso ao índice, manifesto, arquivo ou Storage",async()=>{
    auth.mockImplementation(async (_req,permission)=>permission==="data.view"?{ok:true}:{ok:false,response:new Response(null,{status:403})});
    for(const q of ["campaign=2&sia=2","id="+"a".repeat(64)]) expect((await request(q)).status).toBe(403);
    expect(auth.mock.calls.map(c=>c[1])).toEqual(["data.view","campaigns.view","data.view","campaigns.view"]);
    for(const io of [indexRows,pointMedia,mediaById,imageBytes,download]) expect(io).not.toHaveBeenCalled();
  });
  it("no runtime remoto não usa disco ou Diário sem atestação; com atestação verifica manifesto e bytes privados",async()=>{
    auth.mockResolvedValue({ok:true});vi.stubEnv("VERCEL","1");vi.stubEnv("YVAE_PRIVATE_MEDIA_INDEX",manifest);
    vi.stubEnv("YVAE_PRIVATE_MEDIA_ATTESTATION_SHA256","");
    expect((await (await request("campaign=2&sia=2")).json()).installed).toBe(false);
    expect(download).not.toHaveBeenCalled();
    const signed=JSON.stringify([{...row,file:undefined,storagePath:"synthetic/sample.png"}]);
    const hash=createHash("sha256").update(signed).digest("hex");
    vi.stubEnv("YVAE_PRIVATE_MEDIA_ATTESTATION_SHA256",hash);
    const png=new Uint8Array(await readFile(file));
    download.mockImplementation(async(bucket:string)=>({data:bucket==="documents"?new Blob([signed]):new Blob([png]),error:null}));
    const list=await (await request("campaign=2&sia=2")).json();const query=list.visits[0].photos[0].src.split("?")[1];
    expect(JSON.stringify(list)).not.toContain("sample.png");expect((await request(query)).status).toBe(200);
    expect(download).toHaveBeenCalledWith("photos","synthetic/sample.png");
    download.mockImplementation(async(bucket:string)=>({data:new Blob([bucket==="documents"?signed:"tampered"]),error:null}));
    expect((await request(query)).status).toBe(503);
    download.mockResolvedValue({data:new Blob(["tampered"]),error:null});expect((await request("campaign=2&sia=2")).status).toBe(503);
  });
  it("metadados sem caminho; id opaco devolve JPEG decodificável privado e sem EXIF",async()=>{
    vi.stubEnv("YVAE_PRIVATE_MEDIA_INDEX",manifest);auth.mockResolvedValue({ok:true});
    const res=await request("campaign=2&sia=2");const json=await res.json();
    expect(JSON.stringify(json)).not.toContain("synthetic");expect(JSON.stringify(json)).not.toContain(row.digest);
    expect(json.status).toBe("available");expect(json.visits[0].date).toBe(row.date);
    const src=json.visits[0].photos[0].src;expect(src).toMatch(/^\/api\/results\/point-media\?id=[a-f0-9]{64}$/);
    const img=await request(src.split("?")[1]);expect(img.status).toBe(200);expect(img.headers.get("cache-control")).toContain("no-store");
    expect(auth.mock.calls.map(c=>c[1])).toEqual(["data.view","campaigns.view","data.view","campaigns.view"]);
    const info=await sharp(Buffer.from(await img.arrayBuffer())).metadata();expect(info.format).toBe("jpeg");expect(info.exif).toBeUndefined();
    expect((await request("campaign=1&sia=2")).status).toBe(200);expect((await (await request("campaign=1&sia=2")).json()).visits).toEqual([]);
  });
  it("não escolhe visita conflitante; preserva múltiplas fotos legítimas, datas separadas e histórico sem data",()=>{
    const other={...row,digest:"a".repeat(64)},later={...row,date:"2026-01-03",digest:"b".repeat(64)};
    expect(resolveAttestedMedia([row,row,other,later],2,2).items).toHaveLength(3);
    expect(resolveAttestedMedia([row,{...row,sia:3}],2,2)).toMatchObject({conflict:true,items:[]});
    expect(resolveAttestedMedia([row,{...row,date:"2026-01-03"}],2,2).items).toEqual([]);
    expect(resolveAttestedMedia([{...row,conflict:true}],2,2).items).toEqual([]);
    expect(resolveAttestedMedia([{...row,date:null}],2,2).items[0].date).toBeNull();
    expect(mediaId(1,2,row)).not.toBe(mediaId(2,2,row));
  });
});
