"use client";

import { useEffect, useState } from "react";

type Card = { id:string; taxon:string; rank:string; topic:string; finding:string; limits:string; sourceIds:string[] };
type Library = {version:string; cards:Card[]; sources:{id:string;citation:string;url:string}[]; counts:{cards:number;identities:number;sources:number}};

const fold=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim();
export function ScientificLibrary() {
  const [library,setLibrary]=useState<Library>();
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  useEffect(()=>{
    const ctl=new AbortController();
    async function read(){
      try{
        const res=await fetch("/api/results/curation/library",{credentials:"same-origin",cache:"no-store",signal:ctl.signal});
        if(!res.ok)throw new Error([401,403].includes(res.status)?"Seu perfil não tem acesso ao acervo.":"Não foi possível consultar o acervo.");
        const payload:Library=await res.json();
        if(!ctl.signal.aborted)setLibrary(payload);
      }catch(e){if(!ctl.signal.aborted)setError(e instanceof Error?e.message:"Acervo indisponível.");}
    }
    void read();return ()=>ctl.abort();
  },[]);
  const term=fold(query);
  const cards=library?.cards.filter(c=>fold(c.taxon+" "+c.topic).includes(term))??[];
  return <section aria-labelledby="acervo-cientifico" className="app-card min-w-0 space-y-3 p-4 sm:p-6">
    <h2 id="acervo-cientifico" className="type-section-title scroll-mt-24">Acervo de fichas científicas</h2>
    {error?<p role="alert">{error}</p>:!library?<p role="status">Carregando fichas…</p>:<>
    <p>Versão {library.version} · {library.counts.cards} fichas revisadas · {library.counts.identities} assuntos distintos · {library.counts.sources} fontes. Candidatos aguardam revisão e ficam fora desta consulta.</p>
    <label className="block type-label">Buscar fichas por nome ou tema<input type="search" value={query} onChange={e=>setQuery(e.target.value)} className="mt-1 block min-h-11 w-full max-w-lg rounded-lg border border-[var(--line-strong)] px-3"/></label>
    <p role="status">{cards.length} de {library.counts.cards} fichas.</p>
    {!cards.length&&<p>Nenhuma ficha corresponde à busca.</p>}
    <ul className="divide-y divide-[var(--line-strong)]">{cards.map(c=><li key={c.id}><details><summary className="min-h-11 cursor-pointer break-words py-2 font-semibold">{c.taxon} · {c.rank} · {c.topic}</summary>
    <dl className="space-y-2 pb-3 type-metadata"><div><dt className="font-semibold">Achado documentado</dt><dd>{c.finding}</dd></div><div><dt className="font-semibold">Limites de interpretação</dt><dd>{c.limits}</dd></div><div><dt className="font-semibold">Fontes da ficha</dt><dd><ul>{c.sourceIds.map(id=>{const source=library.sources.find(s=>s.id===id);return <li key={id}>{source && /^https:\/\//i.test(source.url)?<a href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center break-words underline">{source.citation}</a>:source?.citation??"Referência indisponível"}</li>})}</ul></dd></div></dl>
    </details></li>)}</ul></>}
  </section>;
}
