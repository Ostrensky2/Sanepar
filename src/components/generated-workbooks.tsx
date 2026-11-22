"use client";

import {createContext, useContext, useEffect, useState} from "react";

export const WorkbookOwner = createContext<string | null>(null);
type Artifact = { id:string; campaign:number; filename:string; sha256:string; size:number; version:string; createdAt:string; state:"generated"; createdBy:string; sourcesDeclared:{filename:string;sha256:string}[]; pendingCount:number; corroboration:"workbook-internal" };
const endpoint = "/api/imports/sia-workbooks";
const changed = "yvae:generated-workbooks-updated";

function isArtifact(value: unknown): value is Artifact {
  if (!value || typeof value !== "object") return false;
  const a = value as Partial<Artifact>;
  return a.state === "generated" && typeof a.id === "string" && !!a.id &&
    Number.isSafeInteger(a.campaign) && typeof a.filename === "string" &&
    typeof a.sha256 === "string" && /^[a-f0-9]{64}$/.test(a.sha256) &&
    a.version === a.sha256 && Number.isSafeInteger(a.size) &&
    a.corroboration === "workbook-internal" && typeof a.createdBy === "string" && !!a.createdBy &&
    typeof a.pendingCount === "number" && Number.isSafeInteger(a.pendingCount) && a.pendingCount >= 0 &&
    Array.isArray(a.sourcesDeclared) && a.sourcesDeclared.every(source=>source && typeof source.filename==="string" && typeof source.sha256==="string" && /^[a-f0-9]{64}$/.test(source.sha256)) &&
    typeof a.createdAt === "string" && Number.isFinite(Date.parse(a.createdAt));
}

async function sha256(bytes:ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b=>b.toString(16).padStart(2,"0")).join("");
}
async function requireSuccess(response:Response) {
  if(response.ok)return;
  if(response.status===401 || response.status===403)throw Error("A sessão não tem acesso ao acervo.");
  if(response.status===507 || response.status===413)throw Error("Limite de armazenamento ou tamanho excedido.");
  throw Error("O servidor não confirmou a operação.");
}
export function GeneratedFileStatus({campaign,file}:{campaign:number;file:{filename:string;bytes:ArrayBuffer}}){
  const owner=useContext(WorkbookOwner);
  const [message,status]=useState("");
  const [failed,setFailed]=useState(false);
  const [attempt,retry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    async function save(){
      if(!owner){status("Aguardando identidade da sessão.");return}
      setFailed(false);
      status("Guardando o XLSX no acervo…");
      const limits=await fetch(endpoint+"?limits=1",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
      if(!limits.ok)throw Error("Não foi possível verificar o limite de armazenamento.");
      const {maxUploadBytes}=await limits.json();
      if(!Number.isSafeInteger(maxUploadBytes)||maxUploadBytes<=0)throw Error("Limite de armazenamento indisponível.");
      if(file.bytes.byteLength>maxUploadBytes)throw Error("O arquivo excede o limite de "+maxUploadBytes.toLocaleString("pt-BR")+" bytes para esta instalação.");
      const hash=await sha256(file.bytes);
      if(controller.signal.aborted)return;
      const query=new URLSearchParams({campaign:String(campaign),filename:file.filename});
      const response=await fetch(endpoint+"?"+query,{method:"POST",body:file.bytes,headers:{"x-content-sha256":hash,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});
      await requireSuccess(response);
      const {artifact}=await response.json();
      if(!isArtifact(artifact)||artifact.sha256!==hash||artifact.filename!==file.filename||artifact.campaign!==campaign||artifact.size!==file.bytes.byteLength)throw Error("Recibo do XLSX incompatível.");
      if(!controller.signal.aborted){status("Arquivo gerado e guardado no acervo.");window.dispatchEvent(new Event(changed))}
    }
    save().catch(error=>{if(!controller.signal.aborted){setFailed(true);status((error instanceof Error?error.message:"Falha de gravação.")+" A guarda do XLSX não foi confirmada. Você ainda pode baixar o arquivo gerado.")}});
    return ()=>controller.abort();
  },[owner,campaign,file,attempt]);
  return <div><p role="status">{message}</p>{failed&&<button type="button" onClick={()=>retry(n=>n+1)}>Tentar guardar novamente</button>}</div>;
}

export function orderWorkbookVersions<T extends Pick<Artifact, "id" | "campaign" | "createdAt">>(items: readonly T[]) {
  const ordered = [...items].sort((a, b) => a.campaign - b.campaign ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id, "en"));
  return ordered.map((item, index) => ({item, latest: index === 0 || ordered[index - 1].campaign !== item.campaign}));
}

export function GeneratedWorkbookList({owner}:{owner:string}){
  const [items,setItems]=useState<Artifact[]|null>(null);
  const [error,setError]=useState("");
  const [attempt,retry]=useState(0);
  const [opened,open]=useState<{item:Artifact;sheets:{name:string;rows:string[][]}[]}|null>(null);
  const [sheet,select]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    let generation=0;
    async function refresh(){
      const seq=++generation;
      try{
        const response=await fetch(endpoint,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
        await requireSuccess(response);
        const {artifacts}=await response.json();
        if(!Array.isArray(artifacts)||!artifacts.every(isArtifact))throw Error("Resposta inválida do acervo.");
        if(!controller.signal.aborted&&seq===generation){setItems(artifacts);setError("")}
      }catch(error){if(!controller.signal.aborted&&seq===generation){setItems(null);open(null);setError("Falha ao consultar as planilhas. "+(error instanceof Error?error.message:""))}}
    }
    void refresh();window.addEventListener(changed,refresh);
    return ()=>{controller.abort();window.removeEventListener(changed,refresh)};
  },[owner,attempt]);
  async function useFile(item:Artifact,preview:boolean){
    try{
      setError("");
      const response=await fetch(endpoint+"?"+new URLSearchParams({id:item.id}),{cache:"no-store",signal:AbortSignal.timeout(60000)});
      await requireSuccess(response);
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength!==item.size||await sha256(bytes)!==item.sha256)throw Error("Os bytes recebidos divergem da versão escolhida.");
      if(preview){
        const {Workbook}=await import("exceljs");
        const workbook=new Workbook();await workbook.xlsx.load(bytes);
        const sheets=workbook.worksheets.map(s=>({name:s.name,rows:Array.from({length:Math.min(25,s.rowCount)},(_,r)=>Array.from({length:Math.min(12,s.columnCount)},(_,c)=>s.getCell(r+1,c+1).text))}));
        select(0);open({item,sheets});
      }else{
        const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
        const link=document.createElement("a");link.href=url;link.download=item.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
      }
    }catch(error){open(null);setError("Falha ao abrir o XLSX. "+(error instanceof Error?error.message:""))}
  }
  return <section className="app-card space-y-3"><h2 className="type-section-title">Planilhas geradas</h2>
    <p>Arquivos compartilhados entre usuários com permissão de importação. A guarda do XLSX confirma sua geração. Consulte a etapa de incorporação para verificar o recibo dos grupos.</p>
    {error&&<div role="alert">{error} <button type="button" onClick={()=>retry(n=>n+1)}>Consultar novamente</button></div>}
    {!error&&items===null&&<p role="status">Consultando planilhas…</p>}
    {!error&&items?.length===0&&<p>Nenhuma planilha guardada.</p>}
    <ul className="space-y-2">{orderWorkbookVersions(items ?? []).map(({item,latest})=><li className="break-words" key={item.id}>
      {latest ? <strong className="block text-[var(--brand-navy-strong)]">Mais recente da campanha</strong> : <span className="block type-metadata">Versão anterior · Histórico</span>}
      <strong>{item.filename}</strong> · C{item.campaign} · Versão SHA-256 <span title={item.version}>{item.version.slice(0,12)}</span> · {new Date(item.createdAt).toLocaleString("pt-BR")} <details><summary>Recibo de geração</summary><p>Conta registrada: {item.createdBy} · Pendências no XLSX: {item.pendingCount}</p><p>Conferência interna da campanha entre as abas. Fontes declaradas no arquivo:</p><ul>{item.sourcesDeclared.map((source,i)=><li key={i}>{source.filename} · SHA-256 {source.sha256}</li>)}</ul></details><button type="button" onClick={()=>void useFile(item,true)}>Reabrir</button> <button type="button" onClick={()=>void useFile(item,false)}>Baixar original</button></li>)}</ul>
    {opened&&<div><h3>{opened.item.filename}</h3><label>Aba da cópia guardada <select value={sheet} onChange={e=>select(Number(e.target.value))}>{opened.sheets.map((s,i)=><option key={s.name} value={i}>{s.name}</option>)}</select></label>
    <p>Prévia das primeiras 25 linhas e 12 colunas de cada aba.</p><div className="max-w-full overflow-auto"><table><tbody>{opened.sheets[sheet]?.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div></div>}
  </section>
}
