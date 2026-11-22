"use client";
import { useEffect, useState } from "react";

type Gallery = {installed:boolean;status:"available"|"unavailable"|"partial"|"ambiguous";visits:{date:string|null;photos:{id:string;src:string}[]}[]};
const endpoint="/api/results/point-media";
function Photo({id,description}:{id:string;description:string}) {
  const [failed,setFailed]=useState(false);
  const src=endpoint+"?id="+id;
  return failed ? <p role="status">Não foi possível abrir esta foto privada.</p> :
    <a href={src} target="_blank" rel="noreferrer" aria-label={`Ampliar: ${description} (nova aba)`}>
      {/* Native same-origin request preserves the session. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} referrerPolicy="no-referrer" loading="lazy" alt={description} onError={()=>setFailed(true)} className="h-auto max-h-96 max-w-full rounded-lg object-contain" />
    </a>;
}
function GalleryForSelection({campaign,sia}:{campaign:number;sia:string}) {
  const [state,setState]=useState<Gallery|"error"|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(endpoint+"?"+new URLSearchParams({campaign:String(campaign),sia}),{signal:controller.signal,cache:"no-store",credentials:"same-origin",redirect:"error"})
      .then(async r=>{if (!r.ok) throw Error(); return await r.json() as Gallery;})
      .then(g=>{if (!controller.signal.aborted) setState(g);})
      .catch(()=>{if (!controller.signal.aborted) setState("error");});
    return ()=>controller.abort();
  },[campaign,sia]);
  return <section aria-label="Fotos de campo" className="space-y-3">
    <h3 className="font-semibold">Fotos de campo</h3>
    {!state ? <p role="status">Consultando registros privados…</p> : state==="error" ? <p role="status">Não foi possível consultar as fotos desta seleção.</p> : <>
      {!state.installed ? <p>Acervo privado não disponível nesta instalação.</p> : state.status==="unavailable" ? <p>Sem foto com vínculo comprovado para este ponto nesta campanha.</p> : null}
      {(state.status==="partial" || state.status==="ambiguous") && <p>Há vínculo de ponto ou data divergente. As fotos em dúvida não são exibidas.</p>}
      {state.visits.map(v=><div key={v.date??"history"}><h4>{v.date ? "Visita de "+v.date.split("-").reverse().join("/") : "Registro histórico do ponto; visita e data não comprovadas"}</h4>
        <div className="grid gap-2 sm:grid-cols-2">{v.photos.filter(p=>/^[a-f0-9]{64}$/.test(p.id) && p.src===endpoint+"?id="+p.id).map((p,i)=><Photo key={p.id} id={p.id} description={`Foto de campo ${i+1} do ponto selecionado`}/>)}</div>
      </div>)}
    </>}
  </section>;
}
export function PointMediaGallery({campaign,sia}:{campaign:number;sia:string}) {
  const s=/^(?:SIA[- ]*)?(\d{1,6})$/i.exec(sia.trim());
  if (!s || !Number(s[1]) || ![1,2,3].includes(campaign)) return null;
  return <GalleryForSelection key={campaign+"|"+Number(s[1])} campaign={campaign} sia={String(Number(s[1]))}/>;
}
