import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readResultsPreparationModel, validateResultsPreparationModel } from "@/modules/results/workbook";
import { canonicalSheetName, RESULTS_SHEETS } from "@/modules/results/sheet-names";
import type { ResultsWorkbookExportModel } from "@/modules/results/types";
import { PREPARATION_ROLES, type PreparationInput, type PreparationManifest, type PreparationPreview, type PreparationRole } from "./results-preparation-contract";
import { ResultsStoreError } from "./results-publication-store";
import type { ResearchModel } from "./results-research";

const ROLE_SHEETS:Record<Exclude<PreparationRole,"full_workbook">,string>={molecular:"Metadados",catalog:"Riscos_bibliografia",evidence:"Evidencias_risco",criteria:"Criterios_scores",indices:"Indices_pontos",components:"Calculo_conjuntos",method:"Metodo_calculo"};
type NormalizedModel={sheets:ResultsWorkbookExportModel["sheets"]};
type Binding={artifactSha256:string;parserVersion:"yvae-results/2.0";parsedSha256?:string;data:NormalizedModel};
export type PreparationStored={packageKey?:string;revisionHash:string;manifest:PreparationManifest;parsedBindings:Binding[];state?:PreparationManifest["state"];resolvedRoles?:Record<string,{artifactSha256:string;parsedSha256:string}>;dependencyRevisions?:PreparationStored[]};

export function bibliographyPreparationModel(stored:PreparationStored):ResearchModel {
  if(stored.state!=="ready")throw new ResultsStoreError("preparation_pending",409,"Revisão incompleta/conflitante: consulta científica ainda indisponível.");
  const bindings=[stored,...(stored.dependencyRevisions??[])].flatMap(r=>r.parsedBindings);
  const sheets:ResultsWorkbookExportModel["sheets"]=[],sheetSources:NonNullable<ResearchModel["sheetSources"]>={};
  for(const role of ["catalog","evidence","criteria"] as const) {
    const resolved=stored.resolvedRoles?.[role];
    if(!resolved)throw new ResultsStoreError("preparation_pending",409,`Dependência não resolvida: ${role}.`);
    const matches=bindings.filter(b=>b.artifactSha256===resolved.artifactSha256&&b.parsedSha256===resolved.parsedSha256).flatMap(b=>b.data.sheets).filter(s=>canonicalSheetName(s.name)===ROLE_SHEETS[role]);
    const unique=new Map(matches.map(s=>[JSON.stringify(s),s]));
    if(unique.size!==1)throw new ResultsStoreError("preparation_conflict",409,`Fonte ausente/ambígua: ${role}.`);
    const sheet=[...unique.values()][0];sheets.push(sheet);
    sheetSources[sheet.name]={sha256:resolved.artifactSha256,fileName:[stored,...(stored.dependencyRevisions??[])].flatMap(s=>s.manifest.files).find(f=>f.sha256===resolved.artifactSha256)?.fileName??sheet.name};
  }
  validateResultsPreparationModel(sheets,"bibliography");
  const catalog=sheets.find(s=>s.name==="Riscos_bibliografia")!,column=catalog.rows[4].indexOf("Versão do catálogo");
  const versions=new Set(catalog.rows.slice(5).filter(r=>r[0]).map(r=>r[column]));
  if(versions.size!==1||typeof [...versions][0]!=="string")throw new ResultsStoreError("preparation_conflict",409,"Versão bibliográfica ausente/ambígua.");
  return {sheets,campaignCodes:[],catalogVersion:String([...versions][0]),sheetSources};
}

export function parsePreparationInput(value:unknown):PreparationInput {
  if(!value||typeof value!=="object")throw new Error("Metadados explícitos da preparação obrigatórios.");
  const input=value as PreparationInput;
  if(!["bibliography","campaign_fragment"].includes(input.kind)||!Array.isArray(input.roles)||input.roles.length<1||input.roles.length>8||input.roles.some(r=>!PREPARATION_ROLES.includes(r))||!Array.isArray(input.dependencies)||input.dependencies.length>7)throw new Error("Tipo/papéis inválidos.");
  if(input.kind==="bibliography") {
    if(input.scope?.type!=="global-bibliography"||input.roles.some(r=>!["catalog","evidence","criteria"].includes(r)))throw new Error("Bibliografia requer escopo global e papéis bibliográficos.");
  } else if(input.scope?.type!=="campaigns"||!Array.isArray(input.scope.campaignCodes)||!input.scope.campaignCodes.length||input.scope.campaignCodes.some(c=>!/^C[1-9]$/.test(c))||new Set(input.scope.campaignCodes).size!==input.scope.campaignCodes.length)throw new Error("Campanhas explícitas inválidas.");
  for(const dependency of input.dependencies)if(!PREPARATION_ROLES.includes(dependency.role)||dependency.role==="full_workbook"||!/^[a-f0-9]{64}$/.test(dependency.revisionHash))throw new Error("Dependência deve fixar papel e revisão por hash.");
  return input;
}
export async function buildResultsPreparation(files:Array<{name:string;bytes:Uint8Array}>, input:PreparationInput, dependencies:PreparationStored[]=[]) {
  if(files.length!==input.roles.length||!files.length||files.some(f=>!f.name||!f.bytes.length||f.bytes.length>12*1024*1024)||files.reduce((sum,f)=>sum+f.bytes.length,0)>24*1024*1024)throw new Error("Arquivos/papéis ou limite de tamanho inválidos.");
  const artifacts:Array<{sha256:string;originalBase64:string}>=[],parsedBindings:Binding[]=[],manifestFiles:PreparationManifest["files"]=[],diagnostics:string[]=[];
  const combined=new Map<string,ResultsWorkbookExportModel["sheets"][number]>();
  const add=(sheet:ResultsWorkbookExportModel["sheets"][number])=>{
    const key=canonicalSheetName(sheet.name),existing=combined.get(key);
    if(existing&&JSON.stringify(existing)!==JSON.stringify(sheet))diagnostics.push(`Conflito de conteúdo/nome para ${key}.`);
    else combined.set(key,sheet);
  };
  for(let i=0;i<files.length;i++) {
    const file=files[i],role=input.roles[i],hash=createHash("sha256").update(file.bytes).digest("hex"),data=await readResultsPreparationModel(file.bytes);
    const names=data.sheets.map(s=>canonicalSheetName(s.name));
    if(role==="full_workbook"?names.length!==7||RESULTS_SHEETS.some(n=>!names.includes(n)):names.length!==1||names[0]!==ROLE_SHEETS[role])throw new Error(`Arquivo não corresponde ao papel declarado: ${role}.`);
    data.sheets.forEach(add);
    if(!artifacts.some(a=>a.sha256===hash)){artifacts.push({sha256:hash,originalBase64:Buffer.from(file.bytes).toString("base64")});parsedBindings.push({artifactSha256:hash,parserVersion:"yvae-results/2.0",data});}
    manifestFiles.push({sha256:hash,fileName:file.name,mediaType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",role});
  }
  for(const pin of input.dependencies) {
    const dependency=dependencies.find(d=>d.revisionHash===pin.revisionHash);
    if(!dependency){diagnostics.push(`Dependência não resolvida: ${pin.role}.`);continue;}
    const resolved=dependency.resolvedRoles?.[pin.role];
    const bindings=[dependency,...(dependency.dependencyRevisions??[])].flatMap(d=>d.parsedBindings);
    const selected=resolved?bindings.filter(b=>b.artifactSha256===resolved.artifactSha256&&b.parsedSha256===resolved.parsedSha256):dependency.parsedBindings;
    const matches=selected.flatMap(b=>b.data.sheets).filter(s=>canonicalSheetName(s.name)===ROLE_SHEETS[pin.role as Exclude<PreparationRole,"full_workbook">]);
    if(matches.length!==1){diagnostics.push(`Dependência ambígua ou ausente: ${pin.role}.`);continue;}
    add(matches[0]);
  }
  const required:PreparationRole[]=input.kind==="bibliography"?["catalog","evidence","criteria"]:["molecular","catalog","evidence","criteria","indices","components","method"];
  const missingRoles=required.filter(role=>!combined.has(ROLE_SHEETS[role as Exclude<PreparationRole,"full_workbook">]));
  if(!missingRoles.length&&!diagnostics.length) {
    try {validateResultsPreparationModel([...combined.values()],input.kind);}catch(error){diagnostics.push(error instanceof Error?error.message:"Validação científica incompatível.");}
  }
  if(input.scope.type==="campaigns")for(const sheet of combined.values()) {
    if(!["Metadados","Indices_pontos","Calculo_conjuntos"].includes(canonicalSheetName(sheet.name)))continue;
    const headerIndex=canonicalSheetName(sheet.name)==="Metadados"?0:4, column=sheet.rows[headerIndex]?.indexOf("Campanha");
    if(column===undefined||column<0) {diagnostics.push(`Cabeçalho Campanha ausente: ${sheet.name}.`);continue;}
    const actual=new Set(sheet.rows.slice(headerIndex+1).map(r=>r[column]).filter(Boolean));
    if([...actual].some(c=>!input.scope || input.scope.type!=="campaigns"||!input.scope.campaignCodes.includes(String(c))))diagnostics.push(`Campanha fora do escopo declarado em ${sheet.name}.`);
  }
  const conflict=diagnostics.some(d=>!d.startsWith("Dependência não resolvida"));
  const manifest:PreparationManifest={contractVersion:"yvae-preparation/1",kind:input.kind,scope:input.scope,parserVersion:"yvae-results/2.0",schemaVersion:"yvae-preparation/1",files:manifestFiles,dependencies:input.dependencies,state:conflict?"conflict":missingRoles.length||diagnostics.length?"pending":"ready",diagnostics};
  const preview:PreparationPreview={source:{kind:"preparation",published:false},manifest,missingRoles,recognizedSheets:[...combined.keys()],persisted:false};
  return {preview,artifacts,parsedBindings};
}
export async function readResultsPreparation(client:SupabaseClient,packageKey:string|null,revisionHash:string|null):Promise<PreparationStored> {
  if((!packageKey&&!revisionHash)||(packageKey!==null&&(!packageKey||packageKey.length>120))||revisionHash!==null&&!/^[a-f0-9]{64}$/.test(revisionHash))throw new Error("Identidade da preparação inválida.");
  const {data,error}=await client.rpc("read_results_preparation",{p_package_key:packageKey,p_revision_hash:revisionHash});
  if(error)throw new ResultsStoreError("preparation_unavailable",503,"Preparação privada indisponível; nenhuma publicação alterada.");
  if(!data||!data.manifest||!Array.isArray(data.parsedBindings))throw new ResultsStoreError("preparation_unavailable",409,"Revisão privada não encontrada.");
  return data as PreparationStored;
}
export async function prepareResultsForm(form:FormData,client:SupabaseClient|null) {
  const input=parsePreparationInput(JSON.parse(String(form.get("preparation")??"null")));
  const files=form.getAll("files");
  if(files.some(f=>!(f instanceof File)))throw new Error("Arquivos de preparação inválidos.");
  const dependencies:PreparationStored[]=[];
  // Pinned dependencies are resolved read-only. An absent RPC is a hard error, never a published fallback.
  for(const pin of input.dependencies) {
    if(!client)throw new Error("Dependências privadas indisponíveis.");
    try {dependencies.push(await readResultsPreparation(client,null,pin.revisionHash));}
    catch(error) {if(!(error instanceof ResultsStoreError)||error.status!==409)throw error;}
  }
  return buildResultsPreparation(await Promise.all((files as File[]).map(async f=>({name:f.name,bytes:new Uint8Array(await f.arrayBuffer())}))),input,dependencies);
}
export async function saveResultsPreparation(client:SupabaseClient,form:FormData) {
  const requestId=String(form.get("requestId")??""),packageKey=String(form.get("packageKey")??""),expected=form.get("expectedRevisionHash");
  if(!/^[a-f0-9-]{36}$/i.test(requestId)||!packageKey||packageKey.length>120||!form.has("expectedRevisionHash")||expected!==""&&!/^[a-f0-9]{64}$/.test(String(expected)))throw new Error("Prévia/CAS/requestId obrigatórios.");
  const built=await prepareResultsForm(form,client);
  // SQL derives structural readiness. Never let invalid science be re-labelled ready there.
  if(built.preview.manifest.state==="conflict")throw new ResultsStoreError("invalid_preparation",422,built.preview.manifest.diagnostics.join(" "));
  const {data,error}=await client.rpc("save_results_preparation",{p_request_id:requestId,p_package_key:packageKey,p_expected_revision_hash:expected||null,p_manifest:built.preview.manifest,p_artifacts:built.artifacts,p_parsed_bindings:built.parsedBindings});
  if(error)throw new ResultsStoreError(error.code==="40001"?"stale_preparation":"preparation_unavailable",error.code==="40001"?409:503,"Preparação não confirmada; consulte a revisão antes de repetir. Publicações não foram alteradas.");
  return {source:{kind:"preparation",published:false},preparation:data};
}
