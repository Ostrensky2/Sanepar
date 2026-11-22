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

export function countWorkbookPoints(workbook: import("exceljs").Workbook) {
  const roster = workbook.getWorksheet("Coletas");
  if (roster?.getCell("A1").text !== "SIA") throw Error("Rol de pontos indisponível.");
  const sias = new Set<string>();
  roster.eachRow((row, index) => {
    if (index === 1) return;
    const match = /^(?:SIA-)?(\d+)$/i.exec(row.getCell(1).text.trim());
    if (!match) throw Error("SIA inválida no rol de pontos.");
    sias.add(match[1].replace(/^0+(?=\d)/, ""));
  });
  return sias.size;
}

export function GeneratedWorkbookList({owner}:{owner:string}){
  const [items,setItems]=useState<Artifact[]|null>(null);
  const [error,setError]=useState("");
  const [attempt,retry]=useState(0);
  const [opened,open]=useState<{item:Artifact;sheets:{name:string;rows:string[][]}[]}|null>(null);
  const [sheet,select]=useState(0);
  const [counts, setCounts] = useState<Record<string, number | "loading" | "error">>({});
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
  async function useFile(item:Artifact,action:"preview" | "download" | "count"){
    try{
      if (action === "count") setCounts(prev => ({...prev, [item.id]: "loading"}));
      else setError("");
      const response=await fetch(endpoint+"?"+new URLSearchParams({id:item.id}),{cache:"no-store",signal:AbortSignal.timeout(60000)});
      await requireSuccess(response);
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength!==item.size||await sha256(bytes)!==item.sha256)throw Error("Os bytes recebidos divergem da versão escolhida.");
      if(action !== "download"){
        const {Workbook}=await import("exceljs");
        const workbook=new Workbook();await workbook.xlsx.load(bytes);
        if (action === "count") {
          const count = countWorkbookPoints(workbook);
          setCounts(prev => ({...prev, [item.id]: count}));
          return;
        }
        const sheets=workbook.worksheets.map(s=>({name:s.name,rows:Array.from({length:Math.min(25,s.rowCount)},(_,r)=>Array.from({length:Math.min(12,s.columnCount)},(_,c)=>s.getCell(r+1,c+1).text))}));
        select(0);open({item,sheets});
      }else{
        const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
        const link=document.createElement("a");link.href=url;link.download=item.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
      }
    } catch (error) {
      if (action === "count") setCounts(prev => ({...prev, [item.id]: "error"}));
      else {open(null);setError("Falha ao abrir o XLSX. "+(error instanceof Error?error.message:""))}
    }
  }
  const campaigns = new Map<number, Artifact[]>();
  for (const {item} of orderWorkbookVersions(items ?? [])) {
    const versions = campaigns.get(item.campaign);
    if (versions) versions.push(item);
    else campaigns.set(item.campaign, [item]);
  }

  function version(item: Artifact, current: boolean) {
    return <div className="min-w-0 space-y-2 break-words">
      <p className="type-metadata">{current && "Versão atual · "}<time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("pt-BR")}</time></p>
      <p className="type-body">{item.filename}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={current ? "min-h-11 rounded-lg bg-[var(--brand-navy-strong)] px-4 font-semibold text-white" : "min-h-11 underline"} onClick={()=>void useFile(item,"download")}>
          {current ? "Baixar Excel unificado" : "Baixar esta versão"}
        </button>
        <button type="button" className="min-h-11 underline" onClick={()=>void useFile(item,"preview")}>Reabrir</button>
      </div>
      <div className="type-metadata">
        <span role="status">{typeof counts[item.id] === "number" ? `${counts[item.id]} pontos`
          : counts[item.id] === "loading" ? "Conferindo pontos…"
          : counts[item.id] === "error" ? "Não foi possível conferir os pontos desta versão."
          : "Quantidade de pontos ainda não conferida."}</span>
        {typeof counts[item.id] !== "number" && <button type="button" disabled={counts[item.id] === "loading"}
          className="ms-2 min-h-11 underline" onClick={()=>void useFile(item,"count")}>Conferir pontos</button>}
      </div>
      <details><summary className="cursor-pointer">Recibo de geração</summary>
        <p className="break-all">SHA-256 {item.version}</p>
        <p>Conta registrada: {item.createdBy} · Pendências no XLSX: {item.pendingCount}</p>
        <ul>{item.sourcesDeclared.map(source=><li className="break-all" key={source.filename+source.sha256}>{source.filename} · SHA-256 {source.sha256}</li>)}</ul>
      </details>
    </div>;
  }

  return <div className="min-w-0 space-y-3">
    {error&&<div role="alert">{error} <button type="button" onClick={()=>{setError("");retry(n=>n+1)}}>Consultar novamente</button></div>}
    {!error&&items===null&&<p role="status">Consultando planilhas…</p>}
    {!error&&items?.length===0&&<p>Nenhuma planilha unificada guardada. Em Preparar matrizes por SIA, confira as matrizes e gere o Excel para salvar a primeira versão.</p>}
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(21rem,calc((100%_-_3rem)/3))),1fr))] items-start gap-x-6 gap-y-4">{Array.from(campaigns, ([campaign, [current, ...history]]) => <li key={campaign} className="min-w-0 space-y-2 border-t border-[var(--line-strong)] pt-3">
      <h3 className="type-panel-title">Campanha {campaign}</h3>
      {version(current, true)}
      {history.length > 0 && <details><summary className="min-h-11 cursor-pointer py-2">Histórico ({history.length})</summary>
        <ul className="space-y-3">{history.map(item => <li key={item.id}>{version(item, false)}</li>)}</ul>
      </details>}
    </li>)}</ul>
    {opened&&<div><h3>{opened.item.filename}</h3><label>Aba da cópia guardada <select value={sheet} onChange={e=>select(Number(e.target.value))}>{opened.sheets.map((s,i)=><option key={s.name} value={i}>{s.name}</option>)}</select></label>
    <p>Prévia das primeiras 25 linhas e 12 colunas de cada aba.</p><div className="max-w-full overflow-auto"><table><tbody>{opened.sheets[sheet]?.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div></div>}
  </div>
}
