"use client";
import React, { useEffect, useState } from "react";
import type { EffectSummary } from "@/lib/capture-index/effect-summary";

type ResponseData = {version:string;summary:EffectSummary};
export function CaptureEffectsSummary({campaign}:{campaign:number}) {
  // Reset data, failure and selection before the first render of another campaign.
  return <CampaignEvidence key={campaign} campaign={campaign} />;
}
function CampaignEvidence({campaign}:{campaign:number}) {
  const [data,setData]=useState<ResponseData|null>(null),[error,setError]=useState(false);
  const [selected,select]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    const url = new URL(window.location.href);
    const initialEffect = url.searchParams.get("effect");
    fetch(`/api/results/capture-index/effects?campaign=${campaign}`,{cache:"no-store",signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error();return await r.json() as ResponseData;})
      .then(v=>{
        if(controller.signal.aborted)return;
        if(v.summary.campaign!==campaign)throw new Error("Campanha divergente");
        if (v.summary.effects.some(effect => effect.id === initialEffect)) select(initialEffect ?? "");
        setData(v);
      })
      .catch(()=>{if(!controller.signal.aborted)setError(true);});
    return ()=>controller.abort();
  },[campaign]);
  const s=data?.summary;
  return <section className="app-card space-y-3 p-4" aria-label="Evidência por tipo de efeito">
    <h2 className="type-section-title">Evidência por tipo de efeito</h2>
    {error?<p role="alert">Não foi possível consultar o quadro da campanha.</p>:!s?<p role="status">Carregando o quadro de efeitos…</p>:!s.observations?<p>Sem observações publicadas em C{campaign}. Não há denominador.</p>:<>
      <p>C{campaign} · {s.observations} pontos · {data?.version}. Cobertura: 16S {s.eligible["16S"]}/{s.observations}; COI {s.eligible.COI}/{s.observations}.
      Algas pelo cloroplasto: {s.eligible.ALGAS}/{s.observations}, leitura do mesmo 16S, não um terceiro marcador.</p>
      <label>Tipo de efeito <select aria-label="Tipo de efeito" className="rounded border p-2" value={selected} onChange={e=>{
        const effect = e.target.value;
        select(effect);
        const url = new URL(window.location.href);
        if (effect) url.searchParams.set("effect", effect); else url.searchParams.delete("effect");
        window.history.replaceState(window.history.state, "", url);
      }}>
        <option value="">Todos os tipos</option>{s.effects.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
      <form action="/resultados/indice-captacao" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="campaign" value={campaign} />
        <input type="hidden" name="origem" value="efeitos" />
        {selected && <input type="hidden" name="effect" value={selected} />}
        <label className="type-label">Consultar uma amostra por SIA conhecido
          <input name="sia" required pattern={String.raw`([Ss][Ii][Aa][\s\-]*)?[0-9]+`} placeholder="Ex.: SIA-0011" className="mt-1 block min-h-11 w-full rounded border px-3" />
        </label>
        <button className="min-h-11 rounded bg-[var(--brand-navy-strong)] px-4 type-label text-white">Abrir ficha</button>
      </form>
      <p className="type-metadata">Os totais descrevem a campanha. Para consultar uma amostra individual, informe um SIA conhecido. Ao voltar, a campanha e o tipo de efeito selecionado são preservados. Uma associação bibliográfica não confirma um efeito observado.</p>
      <p>Contamos uma vez cada ponto por efeito. “No componente determinante” significa que a ficha contribuiu no componente que definiu a nota do domínio, não que foi sua única causa. “Só em outro componente” não aumenta essa nota. Alertas de baixo suporte podem coexistir com outras fichas; não some as colunas.</p>
      <ul className="space-y-3">{s.effects.filter(e=>!selected||selected===e.id).map(e=><li key={e.id}>
        <h3 className="font-semibold">{e.title}</h3><p>{e.note}</p>
        {e.counts?<p>Com contribuição positiva: {e.counts.winning+e.counts.other}/{e.denominator}. No componente determinante: {e.counts.winning}. Só em outro componente: {e.counts.other}. Com alerta de baixo suporte: {e.counts.low}/{e.denominator}. Base: pontos com {e.component} utilizável.</p>
        :<p>{e.denominator===null?"Sem avaliação pelo método.":"Sem biblioteca utilizável para este mecanismo."}</p>}
      </li>)}</ul>
      <h3 className="font-semibold">Outras contribuições, por domínio</h3>
      <p>Das {s.positiveContributions} contribuições positivas, {s.unmappedContributions} não têm correspondência na lista de mecanismos deste quadro. O domínio é conhecido; não atribuímos um mecanismo pelo nome do organismo. As notas oficiais já incluem essas contribuições.</p>
      <ul>{s.residualDomains.map(d=><li key={d.domain}>{d.domain}: {d.contributions} registros em {d.points} pontos distintos.</li>)}</ul>
      <p>Um ponto pode aparecer em mais de um domínio. Zero no quadro significa nenhuma ficha listada nesse estado, não ausência de organismo ou de dano.</p>
    </>}
  </section>;
}
