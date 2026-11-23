"use client";
import React, { useEffect, useState } from "react";
import type { EffectSummary } from "@/lib/capture-index/effect-summary";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

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
  const chip = "inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-soft)] px-3 py-1 text-sm";
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3";
  return <section className="space-y-5" aria-label="Evidência por tipo de efeito">
    {error?<p role="alert" className="app-card p-4">Não foi possível consultar o quadro da campanha.</p>:!s?<p role="status" className="app-card p-4">Carregando o quadro de efeitos…</p>:!s.observations?<p className="app-card p-4">Sem observações publicadas em C{campaign}. Não há denominador.</p>:<>
      <div className="app-card space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1"><h2 className="text-xl font-bold text-[var(--brand-navy-strong)]">Evidência por tipo de efeito</h2>
              <ResultsInterpretationHelp title="Como ler o quadro de tipos de efeito">
                <p>O quadro mostra, para a C{campaign}, em quantos pontos cada mecanismo tem ficha contribuindo para a nota. Cada ponto é contado uma vez por efeito.</p>
                <p>“No componente determinante” significa que a ficha contribuiu no componente que definiu a nota do domínio, não que foi sua única causa. “Só em outro componente” não aumenta essa nota. Alertas de baixo suporte podem coexistir com outras fichas; não some as colunas.</p>
                <p>Os totais descrevem a campanha. Para abrir a ficha de um ponto, escolha um SIA da campanha ou digite o código. As sugestões incluem os pontos da campanha independentemente do efeito selecionado. Ao voltar, a campanha e o tipo de efeito selecionado são preservados.</p>
                <p>Uma associação bibliográfica não confirma um efeito observado. O “?” de cada cartão traz o limite daquele efeito.</p>
              </ResultsInterpretationHelp></div>
            <p className="text-sm text-[var(--text-secondary)]">C{campaign} · {s.observations} pontos · {data?.version}</p>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Cobertura dos marcadores">
            <li className={chip}><strong>16S</strong> {s.eligible["16S"]}/{s.observations}</li>
            <li className={chip}><strong>COI</strong> {s.eligible.COI}/{s.observations}</li>
            <li className={chip} title="Leitura do mesmo 16S, não um terceiro marcador"><strong>Algas (cloroplasto do 16S)</strong> {s.eligible.ALGAS}/{s.observations}</li>
          </ul>
        </div>
        <div className="grid items-end gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold">Tipo de efeito <select aria-label="Tipo de efeito" className={field} value={selected} onChange={e=>{
            const effect = e.target.value;
            select(effect);
            const url = new URL(window.location.href);
            if (effect) url.searchParams.set("effect", effect); else url.searchParams.delete("effect");
            window.history.replaceState(window.history.state, "", url);
          }}>
            <option value="">Todos os tipos</option>{s.effects.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
          <form action="/resultados/indice-captacao" className="flex items-end gap-2">
            <input type="hidden" name="campaign" value={campaign} />
            <input type="hidden" name="origem" value="efeitos" />
            {selected && <input type="hidden" name="effect" value={selected} />}
            <label className="block min-w-0 flex-1 text-sm font-semibold">Abrir a ficha de um ponto
              <input name="sia" list={`sias-campanha-${campaign}`} required pattern={String.raw`([Ss][Ii][Aa][\s\-]*)?[0-9]+`} placeholder="Ex.: SIA-0011" className={field} />
            </label>
            <datalist id={`sias-campanha-${campaign}`}>
              {orderedCampaignSias(siaCodes).map(sia => <option key={sia} value={sia} />)}
            </datalist>
            <button className="min-h-11 rounded-lg bg-[var(--brand-navy-strong)] px-4 font-semibold text-white">Abrir ficha</button>
          </form>
        </div>
      </div>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{s.effects.filter(e=>!selected||selected===e.id).map(e=>{
        const hits = e.counts ? e.counts.winning+e.counts.other : 0, share = e.counts && e.denominator ? hits/e.denominator : 0;
        return <li className={"app-card flex flex-col gap-3 p-4 sm:p-5 "+(e.counts?"":"opacity-80")} key={e.id}>
        <div className="flex items-start justify-between gap-1"><h3 className="text-lg font-bold leading-snug">{e.title}</h3>
          <ResultsInterpretationHelp title={e.title}>
            <p>{e.note}</p>
            {e.counts
              ? <><p>Na C{campaign}, {hits} de {e.denominator} pontos com {e.component} utilizável têm ficha deste efeito contribuindo para a nota.</p>
                <p>No componente determinante: {e.counts.winning}. A ficha está no componente que definiu a nota do domínio, sem ser necessariamente a única causa. Só em outro componente: {e.counts.other}. Contribui, mas não aumenta essa nota. Alerta de baixo suporte: {e.counts.low} de {e.denominator}. Pode coexistir com outras fichas, por isso as colunas não se somam.</p></>
              : <p>Sem contagem nesta campanha. Isso não demonstra ausência do efeito.</p>}
            <p>É associação documentada nas fichas; o efeito não foi medido.</p>
          </ResultsInterpretationHelp></div>
        {e.counts?<>
          <div>
            <p className="flex items-baseline gap-2"><strong className="text-3xl font-extrabold tabular-nums text-[var(--brand-navy-strong)]">{hits}</strong><span className="text-sm text-[var(--text-secondary)]">de {e.denominator} pontos · base com {e.component} utilizável</span></p>
            <span aria-hidden="true" className="mt-2 block h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"><span className="block h-full rounded-full bg-[var(--brand-teal)]" style={{width:`${Math.max(share*100, hits?2:0)}%`}} /></span>
            <p className="sr-only">{hits} de {e.denominator} pontos com contribuição positiva</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-[var(--surface-soft)] p-2"><dt className="text-xs leading-tight text-[var(--text-secondary)]">No componente determinante</dt><dd className="text-lg font-bold tabular-nums">{e.counts.winning}</dd></div>
            <div className="rounded-lg bg-[var(--surface-soft)] p-2"><dt className="text-xs leading-tight text-[var(--text-secondary)]">Só em outro componente</dt><dd className="text-lg font-bold tabular-nums">{e.counts.other}</dd></div>
            <div className="rounded-lg bg-[var(--surface-soft)] p-2"><dt className="text-xs leading-tight text-[var(--text-secondary)]">Alerta de baixo suporte</dt><dd className="text-lg font-bold tabular-nums">{e.counts.low}/{e.denominator}</dd></div>
          </dl></>
        :<p className="w-fit rounded-full border border-dashed border-[var(--ink-soft)] px-3 py-1 text-sm font-semibold">{e.denominator===null?"Sem avaliação pelo método.":"Sem biblioteca utilizável para este mecanismo."}</p>}
      </li>;})}</ul>
      <div className="app-card space-y-3 p-4 sm:p-6">
        <div className="flex items-center gap-1"><h3 className="text-lg font-bold">Outras contribuições, por domínio</h3>
          <ResultsInterpretationHelp title="Outras contribuições, por domínio">
            <p>Das {s.positiveContributions} contribuições positivas, {s.unmappedContributions} não têm correspondência na lista de mecanismos deste quadro. O domínio é conhecido; não atribuímos um mecanismo pelo nome do organismo. As notas oficiais já incluem essas contribuições.</p>
            <p>Um ponto pode aparecer em mais de um domínio. Zero no quadro significa nenhuma ficha listada nesse estado, não ausência de organismo ou de dano.</p>
          </ResultsInterpretationHelp></div>
        <p className="text-sm text-[var(--text-secondary)]">{s.unmappedContributions} de {s.positiveContributions} contribuições positivas sem tipo de efeito listado.</p>
        <ul className="grid gap-3 sm:grid-cols-3">{s.residualDomains.map(d=><li key={d.domain} className="rounded-lg bg-[var(--surface-soft)] p-3"><span className="block text-sm font-semibold text-[var(--text-secondary)]">{d.domain}</span><strong className="text-2xl font-extrabold tabular-nums text-[var(--brand-navy-strong)]">{d.contributions}</strong><span className="text-sm"> registros · {d.points} pontos</span></li>)}</ul>
      </div>
    </>}
  </section>;
}
