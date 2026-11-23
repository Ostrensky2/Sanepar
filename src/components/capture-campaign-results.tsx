"use client";
import { useEffect, useRef, useState } from "react";
import { CaptureIndexPanel } from "@/components/capture-index-panel";
import { CaptureEffectsSummary } from "@/components/capture-effects-summary";
import { CaptureExoticsReconciliation } from "@/components/capture-exotics-reconciliation";
import { defaultCampaigns } from "@/lib/campaign-management";
import type { ResultsCampaign } from "@/modules/results";
import { ResultsIndexDashboard } from "@/modules/results/components/results-index-dashboard";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; campaigns: ResultsCampaign[] };

const sections = [
  ["tipos-de-efeito", "Tipos de efeito"],
  ["exoticas", "Exóticas"],
  ["consulta-por-sia", "Consulta por SIA"],
] as const;
const anchorOffset = "scroll-mt-[calc(5rem+env(safe-area-inset-top))]";

/** Resultados de uma campanha pelo índice de captação: o painel com mapa, ranking, municípios e evolução,
 * seguido do detalhe por ponto (fichas que formam cada nota, alertas e espécies exóticas). */
export function CaptureCampaignResults({ campaign, fieldPhotos }: { campaign: number; fieldPhotos?: Record<string, string> }) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/results/capture-index/campaigns", { cache: "no-store", signal: controller.signal })
      .then(async (response): Promise<State> => response.ok ? { status: "ready", campaigns: ((await response.json()) as { campaigns: ResultsCampaign[] }).campaigns } : { status: "error" })
      .catch((error: unknown): State | null => error instanceof DOMException && error.name === "AbortError" ? null : { status: "error" })
      .then(next => { if (next) setState(next); });
    return () => controller.abort();
  }, []);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = content.current;
    if (!root) return;
    let observer: ResizeObserver | undefined;
    function stop() { observer?.disconnect(); }
    function followHash() {
      stop();
      const id = window.location.hash.slice(1);
      if (!sections.some(([key]) => key === id) && id !== `detalhe-sia-c${campaign}`) return;
      const target = document.getElementById(id);
      if (!target || !root?.contains(target)) return;
      const group = target.closest("details");
      if (group) group.open = true;
      target.focus({preventScroll:true});
      const align = () => target.scrollIntoView({block:"start", behavior:"instant"});
      align();
      // O mapa e as consultas anteriores ao alvo podem ganhar altura após a primeira pintura.
      observer = new ResizeObserver(align);
      observer.observe(root);
    }
    followHash();
    window.addEventListener("hashchange", followHash);
    const interactions = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
    for (const event of interactions) window.addEventListener(event, stop, {passive:true, capture:true});
    return () => {
      stop();
      window.removeEventListener("hashchange", followHash);
      for (const event of interactions) window.removeEventListener(event, stop, true);
    };
  }, [campaign]);
  const code = `C${campaign}`;
  const campaignPoints = state.status === "ready" ? state.campaigns.find(item => item.campaignCode === code)?.points : undefined;
  const labels = Object.fromEntries(defaultCampaigns.map((item, index) => [`C${index + 1}`, item.title]));
  return <div ref={content} className="space-y-6">
    <nav aria-label="Navegação nos resultados da campanha" className="flex flex-wrap gap-x-5 gap-y-1">
      {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center font-semibold text-[var(--brand-navy-strong)] underline underline-offset-4 focus-visible:outline-2">{label}</a>)}
    </nav>
    {state.status === "loading" && <section className="app-card h-40 animate-pulse bg-[var(--surface-soft)]" aria-label="Carregando resultados da campanha" />}
    {state.status === "error" && <section className="app-card p-4" role="alert">Não foi possível carregar o mapa e o ranking agora. O detalhe por ponto segue abaixo.</section>}
    {state.status === "ready" && campaignPoints &&
      <ResultsIndexDashboard key={code} campaigns={state.campaigns} initialCampaignCode={code} campaignLabels={labels} fieldPhotos={fieldPhotos} />}
    <details className="disclosure app-card p-4"><summary className="min-h-11 cursor-pointer py-2 type-panel-title">Consultar ficha individual por SIA</summary>
    <div id="consulta-por-sia" tabIndex={-1} aria-label="Consulta por SIA" className={anchorOffset}><section id={`detalhe-sia-c${campaign}`} tabIndex={-1} aria-label="Consulta individual por SIA" className={`app-card p-4 ${anchorOffset}`}><CaptureIndexPanel key={campaign} campaign={campaign} /></section></div>
    </details>
    <details className="disclosure app-card p-4"><summary className="min-h-11 cursor-pointer py-2 type-panel-title">Evidência por tipo de efeito</summary>
    <div id="tipos-de-efeito" tabIndex={-1} aria-label="Tipos de efeito" className={anchorOffset}><CaptureEffectsSummary key={`effects-${campaign}`} campaign={campaign} siaCodes={campaignPoints?.map(point => point.siaCode)} /></div>
    </details>
    <details className="disclosure app-card p-4"><summary className="min-h-11 cursor-pointer py-2 type-panel-title">Espécies exóticas</summary>
    <div id="exoticas" tabIndex={-1} aria-label="Exóticas" className={anchorOffset}><CaptureExoticsReconciliation campaign={campaign} /></div>
    </details>
  </div>;
}
