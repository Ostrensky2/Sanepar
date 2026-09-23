import "server-only";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPublishedResultsSource, ResultsStoreError } from "./results-publication-store";
import type { MethodologyDocument, MethodologyDocumentResponse, MethodologyDocumentTarget } from "./results-methodology-document-contract";

const hashPattern=/^[a-f0-9]{64}$/;
function invalid(message:string):never {throw new ResultsStoreError("invalid_methodology_document",422,message);}

/** No HTTP request, redirect resolution, DNS lookup or file download is performed. */
export function validateMethodologyDocument(value:unknown):MethodologyDocument {
  if(!value||typeof value!=="object"||Array.isArray(value))return invalid("Informe nome e URL do documento.");
  const input=value as Record<string,unknown>;
  if(typeof input.name!=="string"||!input.name.trim()||input.name.trim().length>200||/[\u0000-\u001f\u007f]/.test(input.name))return invalid("Nome do documento inválido.");
  if(typeof input.url!=="string"||input.url.length>2048||/[\u0000-\u0020\u007f]/.test(input.url))return invalid("URL inválida.");
  let url:URL;try{url=new URL(input.url);}catch{return invalid("URL absoluta HTTP(S) obrigatória.");}
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.hash||url.port||isIP(url.hostname.replace(/^\[|\]$/g,""))||!url.hostname.includes(".")||/(?:^|\.)(?:localhost|local|internal)$/i.test(url.hostname))return invalid("URL deve ser pública, HTTP(S), sem credenciais ou fragmentos.");
  // Conservative durable-link allowlist: never persist signed/access-token query strings.
  const allowedQuery=new Set(["id","usp","download","export","format","web","action"]);
  for(const [key,val] of url.searchParams)if(!allowedQuery.has(key.toLowerCase())||val.length>256||/[\u0000-\u0020<>]/.test(val)||/https?:/i.test(val))return invalid("Use um link permanente, sem token, assinatura ou parâmetros temporários.");
  let path:string;try{path=decodeURIComponent(url.pathname);}catch{return invalid("URL com codificação inválida.");}
  if(/\/(?:sign|signed|token|auth)\//i.test(path)||/[\u0000-\u001f]/.test(path))return invalid("Link temporário/assinado não pode ser cadastrado como descrição permanente.");
  const inferred=/\.pdf$/i.test(path)?"pdf":/\.docx?$/i.test(path)?"word":null;
  if(input.type!==undefined&&input.type!==null&&input.type!=="pdf"&&input.type!=="word")return invalid("Tipo permitido: PDF ou Word.");
  if(inferred&&input.type&&input.type!==inferred)return invalid("Tipo informado diverge da extensão da URL.");
  return {url:url.href,name:input.name.trim(),type:inferred??(input.type as "pdf"|"word"|null|undefined)??null};
}

async function targetFor(client:SupabaseClient,query:URLSearchParams):Promise<MethodologyDocumentTarget> {
  const {parsed,source}=await readPublishedResultsSource(client,query);
  return {publicationId:source.publicationId,sourceHash:source.sha256.toLowerCase(),calculationVersion:parsed.calculationVersion,catalogVersion:parsed.catalogVersion};
}
const packageKey=(target:MethodologyDocumentTarget)=>`methodology:${target.publicationId}`;
const sameTarget=(value:unknown,target:MethodologyDocumentTarget)=>{
  if(!value||typeof value!=="object")return false;
  const record=value as Record<string,unknown>;
  return Object.entries(target).every(([key,val])=>record[key]===val);
};
function unavailable(error:{code?:string;message?:string}):never {
  if(error.code==="PGRST202"||error.code==="42883")throw new ResultsStoreError("methodology_persistence_pending",503,"Persistência deste cadastro ainda não habilitada. Nenhum link foi cadastrado.");
  if(error.code==="40001")throw new ResultsStoreError("stale_methodology_document",409,"A revisão mudou. Atualize antes de cadastrar.");
  if(error.code==="22023")throw new ResultsStoreError("invalid_methodology_document",422,"Cadastro incompatível ou chave de repetição reutilizada.");
  throw new ResultsStoreError("methodology_persistence_unavailable",503,"Persistência da descrição metodológica indisponível; nenhum cadastro foi confirmado.");
}
export async function readMethodologyDocument(client:SupabaseClient,query:URLSearchParams):Promise<MethodologyDocumentResponse> {
  const target=await targetFor(client,query),revisionHash=query.get("revisionHash");
  if(revisionHash!==null&&!hashPattern.test(revisionHash))return invalid("Hash da revisão inválido.");
  const {data,error}=await client.rpc("read_results_preparation",{p_package_key:packageKey(target),p_revision_hash:revisionHash});
  if(error)unavailable(error);
  if(data===null) {
    if(revisionHash)throw new ResultsStoreError("methodology_revision_missing",404,"Revisão não encontrada para esta metodologia.");
    return {status:"missing",target,revisionHash:null,document:null};
  }
  if(!data||data.manifest?.kind!=="methodology_description"||data.manifest?.scope?.type!=="methodology"||!sameTarget(data.manifest.scope.target,target)||!hashPattern.test(data.revisionHash??"")||(revisionHash&&data.revisionHash!==revisionHash))throw new ResultsStoreError("methodology_target_mismatch",409,"Documento não corresponde à publicação/metodologia selecionada.");
  return {status:"registered",target,revisionHash:data.revisionHash,document:validateMethodologyDocument(data.manifest.methodologyDocument)};
}
