import ExcelJS from "exceljs";
import { expect,it,vi } from "vitest";
import { bibliographyPreparationModel,buildResultsPreparation,parsePreparationInput,saveResultsPreparation,type PreparationStored } from "./results-preparation";
import { queryResultsResearch } from "./results-research";
const input=()=>parsePreparationInput({kind:"bibliography",scope:{type:"global-bibliography"},roles:["catalog"],dependencies:[]});
async function file(name="Riscos_bibliografia") {
  const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet(name);sheet.getRow(5).values=["ID organismo","Organismo do banco"];sheet.getRow(6).values=["SYNTHETIC","Synthetic species"];
  return {name:"synthetic.xlsx",bytes:new Uint8Array(await workbook.xlsx.writeBuffer())};
}
it("keeps a real single-sheet bibliography pending, content-addressed and never a campaign publication",async()=>{
  const f=await file(),result=await buildResultsPreparation([f],input());
  expect(result.preview).toMatchObject({source:{kind:"preparation",published:false},persisted:false,missingRoles:["evidence","criteria"]});
  expect(result.preview.manifest.state).toBe("pending");expect(result.preview.manifest.scope).toEqual({type:"global-bibliography"});
  expect(result.artifacts[0].originalBase64).toBe(Buffer.from(f.bytes).toString("base64"));
  expect((await buildResultsPreparation([f],input())).preview.manifest).toEqual(result.preview.manifest);
});
it("rejects wrong declared role and fictitious bibliography campaigns",async()=>{
  await expect(buildResultsPreparation([await file("Metadados")],input())).rejects.toThrow(/papel/);
  expect(()=>parsePreparationInput({...input(),scope:{type:"campaigns",campaignCodes:["C1"]}})).toThrow(/global/);
});
it("unresolved pinned dependencies remain pending",async()=>{
  const result=await buildResultsPreparation([await file()],{...input(),dependencies:[{role:"evidence",revisionHash:"a".repeat(64)}]});
  expect(result.preview.manifest.state).toBe("pending");expect(result.preview.manifest.diagnostics[0]).toContain("não resolvida");
});
it("save is isolated to preparation RPC with CAS; never lab publication",async()=>{
  const f=await file(),form=new FormData();form.set("files",new File([new Uint8Array(f.bytes)],f.name));form.set("preparation",JSON.stringify(input()));
  form.set("requestId","00000000-0000-4000-8000-000000000001");form.set("packageKey","synthetic-bibliography");form.set("expectedRevisionHash","");
  const rpc=vi.fn().mockResolvedValue({data:{revisionHash:"b".repeat(64)}});
  const result=await saveResultsPreparation({rpc} as never,form);
  expect(result.source.published).toBe(false);expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][0]).toBe("save_results_preparation");expect(rpc.mock.calls[0][1].p_expected_revision_hash).toBeNull();
});
it("reads a pinned independent bibliography through resolved bindings without a fake ResultsWorkbookImport",async()=>{
  const definitions=[
    {role:"catalog" as const,name:"Riscos_bibliografia",header:5,headers:["ID organismo","Organismo do banco","Score ambiental","Score operacional","Score saúde humana","Versão do catálogo"],row:["T1","Synthetic species",1,"NA","NA","SANEPAR-RISCOS-0.3"]},
    {role:"evidence" as const,name:"Evidencias_risco",header:5,headers:["Chave organismo-domínio","ID organismo","Organismo do banco","Domínio","Score bibliográfico","Versão do catálogo","Código do efeito"],row:["T1|A","T1","Synthetic species","Ambiental",1,"SANEPAR-RISCOS-0.3","A1"]},
    {role:"criteria" as const,name:"Criterios_scores",header:32,headers:["Código","Domínio","Nome","Escopo"],row:["A1","Ambiental","Synthetic effect","Synthetic scope"]},
  ];
  const files=await Promise.all(definitions.map(async d=>{const book=new ExcelJS.Workbook(),s=book.addWorksheet(d.name);s.getRow(d.header).values=d.headers;s.getRow(d.header+1).values=d.row;return {name:d.name+".xlsx",bytes:new Uint8Array(await book.xlsx.writeBuffer())};}));
  const built=await buildResultsPreparation(files,{...input(),roles:definitions.map(d=>d.role)});
  expect(built.preview.manifest.state).toBe("ready");
  const stored:PreparationStored={revisionHash:"e".repeat(64),manifest:built.preview.manifest,state:"ready",parsedBindings:built.parsedBindings.map((b,i)=>({...b,parsedSha256:String(i)})),resolvedRoles:Object.fromEntries(definitions.map((d,i)=>[d.role,{artifactSha256:built.parsedBindings[i].artifactSha256,parsedSha256:String(i)}]))};
  const original=JSON.stringify(stored),model=bibliographyPreparationModel(stored);
  const source={kind:"preparation" as const,published:false as const,publicationId:null,sha256:null,revisionHash:stored.revisionHash,packageKey:"synthetic",fileName:"synthetic"};
  const dto=queryResultsResearch(model,null,source,new URLSearchParams());
  expect(dto.revision.campaignCodes).toEqual([]);expect(dto.revision.calculationVersion).toBeNull();expect(dto.counts.associations).toBe(1);
  expect(dto.rows[0].provenance.sourceHash).toBe(built.parsedBindings[1].artifactSha256);
  expect(()=>queryResultsResearch(model,null,source,new URLSearchParams("section=occurrences"))).toThrow(/indisponível/);
  expect(()=>bibliographyPreparationModel({...stored,state:"pending"})).toThrow(/incompleta/);
  const transitive={...stored,parsedBindings:[],dependencyRevisions:[stored]};
  expect(bibliographyPreparationModel(transitive).sheets).toEqual(model.sheets);
  expect(JSON.stringify(stored)).toBe(original);
});
