"use client";
import React, { useEffect, useState } from "react";
import type { EffectSummary } from "@/lib/capture-index/effect-summary";

type ResponseData = {version:string;summary:EffectSummary};
export function orderedCampaignSias(siaCodes?: readonly string[]) {
  return Array.from(new Set(siaCodes)).sort((a, b) => a.localeCompare(b, "pt-BR", {numeric:true}));
}

type CampaignEvidenceProps = {campaign: number; siaCodes?: string[]};
export function CaptureEffectsSummary({campaign, siaCodes}: CampaignEvidenceProps) {
  // Reset data, failure and selection before the first render of another campaign.
  return <CampaignEvidence key={campaign} campaign={campaign} siaCodes={siaCodes} />;
}
function CampaignEvidence({campaign, siaCodes}: CampaignEvidenceProps) {
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
        <label className="type-label">SIA da amostra
          <input name="sia" list={`sias-campanha-${campaign}`} required pattern={String.raw`([Ss][Ii][Aa][\s\-]*)?[0-9]+`} placeholder="Ex.: SIA-0011" className="mt-1 block min-h-11 w-full rounded border px-3" />
        </label>
        <datalist id={`sias-campanha-${campaign}`}>
          {orderedCampaignSias(siaCodes).map(sia => <option key={sia} value={sia} />)}
        </datalist>
        <button className="min-h-11 rounded bg-[var(--brand-navy-strong)] px-4 type-label text-white">Abrir ficha</button>
      </form>
      <p className="type-metadata">Os totais descrevem a campanha. Escolha um SIA da campanha ou digite o código. As sugestões incluem os pontos da campanha independentemente do efeito selecionado. Ao voltar, a campanha e o tipo de efeito selecionado são preservados. Uma associação bibliográfica não confirma um efeito observado.</p>
      <p>Contamos uma vez cada ponto por efeito. “No componente determinante” significa que a ficha contribuiu no componente que definiu a nota do domínio, não que foi sua única causa. “Só em outro componente” não aumenta essa nota. Alertas de baixo suporte podem coexistir com outras fichas; não some as colunas.</p>
      <ul className="divide-y divide-[var(--line-strong)]">{s.effects.filter(e=>!selected||selected===e.id).map(e=><li className="py-3" key={e.id}>
        <h3 className="type-panel-title">{e.title}</h3>
        {e.counts?<><p className="type-metadata"><strong>{e.counts.winning+e.counts.other} de {e.denominator}</strong> pontos com contribuição positiva · base com {e.component} utilizável.</p>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 type-metadata">
            <div><dt>No componente determinante</dt><dd className="font-semibold">{e.counts.winning}</dd></div>
            <div><dt>Só em outro componente</dt><dd className="font-semibold">{e.counts.other}</dd></div>
            <div><dt>Alerta de baixo suporte</dt><dd className="font-semibold">{e.counts.low}/{e.denominator}</dd></div>
          </dl></>
        :<p>{e.denominator===null?"Sem avaliação pelo método.":"Sem biblioteca utilizável para este mecanismo."}</p>}
        <p className="mt-1 type-metadata text-[var(--text-secondary)]">{e.note}</p>
      </li>)}</ul>
      <h3 className="font-semibold">Outras contribuições, por domínio</h3>
      <p>Das {s.positiveContributions} contribuições positivas, {s.unmappedContributions} não têm correspondência na lista de mecanismos deste quadro. O domínio é conhecido; não atribuímos um mecanismo pelo nome do organismo. As notas oficiais já incluem essas contribuições.</p>
      <ul>{s.residualDomains.map(d=><li key={d.domain}>{d.domain}: {d.contributions} registros em {d.points} pontos distintos.</li>)}</ul>
      <p>Um ponto pode aparecer em mais de um domínio. Zero no quadro significa nenhuma ficha listada nesse estado, não ausência de organismo ou de dano.</p>
    </>}
  </section>;
}
