"use client";
import { useEffect, useState } from "react";
import { CaptureIndexPanel } from "@/components/capture-index-panel";
import { defaultCampaigns } from "@/lib/campaign-management";
import type { ResultsCampaign } from "@/modules/results";
import { ResultsIndexDashboard } from "@/modules/results/components/results-index-dashboard";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; campaigns: ResultsCampaign[] };

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
  const code = `C${campaign}`;
  const labels = Object.fromEntries(defaultCampaigns.map((item, index) => [`C${index + 1}`, item.title]));
  return <div className="space-y-6">
    {state.status === "loading" && <section className="app-card h-40 animate-pulse bg-[var(--surface-soft)]" aria-label="Carregando resultados da campanha" />}
    {state.status === "error" && <section className="app-card p-4" role="alert">Não foi possível carregar o mapa e o ranking agora. O detalhe por ponto segue abaixo.</section>}
    {state.status === "ready" && state.campaigns.some(item => item.campaignCode === code) &&
      <ResultsIndexDashboard key={code} campaigns={state.campaigns} initialCampaignCode={code} campaignLabels={labels} fieldPhotos={fieldPhotos} />}
    <section className="app-card p-4"><CaptureIndexPanel key={campaign} campaign={campaign} /></section>
  </div>;
}
