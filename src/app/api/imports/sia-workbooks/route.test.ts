import { expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { Workbook } from "exceljs";
import { resolveCanonicalCampaign } from "@/lib/campaign-identity";
import { tmpdir } from "node:os";
import path from "node:path";
import { digest, workbookStore } from "@/lib/sia-workbook-store";
const auth=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/api-auth",()=>({requireApiSession:auth}));
import { GET,POST } from "./route";

it("nega lista, conteúdo e criação quando falta data.import",async()=>{
  auth.mockImplementation(async()=>({ok:false,response:new Response(null,{status:403})}));
  for(const [handler,url] of [[GET,""],[GET,"?id="+"a".repeat(64)],[POST,""]] as const){
    const request=new Request("http://localhost/api/imports/sia-workbooks"+url,{method:handler===POST?"POST":"GET"});
    expect((await handler(request)).status).toBe(403);
    expect(auth).toHaveBeenCalledWith(request,"data.import");
  }
});
it("gravação concorrente cria um recibo; nova versão preserva bytes; corrupção é recusada",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"sia-workbook-test-"));
  try{
    const store=workbookStore(dir), bytes=Buffer.from("fixture"), next=Buffer.from("fixture2");
    const attribution={createdBy:"actor",sourcesDeclared:[],pendingCount:0,corroboration:"workbook-internal" as const};
    const receipts=await Promise.all([1,2].map(()=>store.save(1,"fixture.xlsx",bytes,digest(bytes),attribution)));
    expect(receipts.filter(x=>x.created)).toHaveLength(1);
    await store.save(1,"fixture.xlsx",next,digest(next),attribution);
    expect(await workbookStore(dir).list()).toHaveLength(2);
    const {id}=receipts[0].artifact;
    expect((await workbookStore(dir).read(id)).bytes).toEqual(bytes);
    const file=path.join(dir,id),data=await readFile(file);
    data[data.length-1]^=1;await writeFile(file,data);
    await expect(store.read(id)).rejects.toThrow("INTEGRITY");
  }finally{await rm(dir,{recursive:true,force:true});}
});

it("valida campanha em todas as abas antes da escrita e reabre em outra sessão autorizada",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"sia-workbook-auth-"));
  await mkdir(path.join(dir,".local-nuvem"));
  await writeFile(path.join(dir,".local-nuvem/rodar-local.ps1"),"");
  const cwd=vi.spyOn(process,"cwd").mockReturnValue(path.join(dir,"web"));
  try{
    const wb=new Workbook(), source="f".repeat(64),base="http://localhost/api/imports/sia-workbooks";
    wb.addWorksheet("Resumo").addRows([["Item","Valor"],["Campanha",resolveCanonicalCampaign(1)!.name]]);
    wb.addWorksheet("Fontes").addRows([["Arquivo","SHA-256","Campanha","Marcador","Nível","Plataforma / run","Bibliotecas"],["teste.xlsx",source,1,"COI","generos","run",1]]);
    wb.addWorksheet("Pendências").addRows([["SIA / dataset","Condição"],["SIA-0001","Data pendente"]]);
    wb.addWorksheet("Vínculos laboratoriais").addRows([["Campanha","SIA","Marcador","Corrida","Nível taxonômico","Matriz de origem","SHA-256 da matriz"],[1,"SIA-0001","COI","run","generos","teste.xlsx",source]]);
    wb.addWorksheet("Evidências de campo").addRow(["Campanha","SIA original"]);
    const results=wb.addWorksheet("Resultados finais");results.addRows([["Campanha","SIA"],[1,"SIA-0001"]]);
    const post=(b:Buffer,c:number)=>POST(new Request(base+"?campaign="+c+"&filename=fixture.xlsx&createdBy=forjado",{method:"POST",body:new Uint8Array(b),headers:{"x-content-sha256":digest(b)}}));
    auth.mockResolvedValue({ok:true,session:{userId:"autor"}});
    const bytes=Buffer.from(await wb.xlsx.writeBuffer());
    for(const campaign of [2,4])expect((await post(bytes,campaign)).status).toBe(422);
    results.getCell("A2").value=2;
    expect((await post(Buffer.from(await wb.xlsx.writeBuffer()),1)).status).toBe(422);
    expect(await (await GET(new Request(base))).json()).toMatchObject({artifacts:[]});
    const saved=await post(bytes,1);expect(saved.status).toBe(201);
    const {artifact}=await saved.json();
    expect(artifact).toMatchObject({createdBy:"autor",pendingCount:1,sourcesDeclared:[{filename:"teste.xlsx",sha256:source}],corroboration:"workbook-internal"});
    auth.mockResolvedValue({ok:true,session:{userId:"leitor"}});
    expect(await (await GET(new Request(base))).json()).toMatchObject({artifacts:[artifact]});
    expect(Buffer.from(await (await GET(new Request(base+"?id="+artifact.id))).arrayBuffer())).toEqual(bytes);
  }finally{cwd.mockRestore();await rm(dir,{recursive:true,force:true});}
});
