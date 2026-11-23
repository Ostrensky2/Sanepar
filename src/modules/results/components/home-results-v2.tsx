"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCaptureIndex } from "@/lib/capture-index/format";
import { defaultCampaigns, readCampaignManagement, type CampaignManagementById } from "@/lib/campaign-management";
import { CircleDot, FlaskConical, CheckCircle2 } from "lucide-react";
import { CanonicalKpi, countOperationallyActiveCampaigns } from "@/components/home-canonical-kpis";
import { ProjectStatusPanel } from "@/components/project-status-panel";
import { CampaignHydroMap } from "@/components/campaign-hydro-map";
import { RESULTS_08_CAMPAIGNS, RESULTS_08_SOURCE_SHA256, type Results08HomeStatistics } from "@/lib/results-08-contract";
import type { ResultsCampaign } from "@/modules/results";

export function HomeResultsV2({ operationalKpis, projectSummary }: { operationalKpis?: React.ReactNode; projectSummary?: React.ReactNode }) {
  // Uma estatística por campanha. As campanhas são independentes e nunca entram numa média única.
  const [stats, setStats] = useState<Results08HomeStatistics[] | null>();
  const [management, setManagement] = useState<CampaignManagementById | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void readCampaignManagement(defaultCampaigns).then(value => { if (!controller.signal.aborted) setManagement(value); });
    async function load() {
      const response = await fetch("/api/results/campaign-distribution", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      const rows = RESULTS_08_CAMPAIGNS.map(code => payload.campanhas?.[code]?.geral as Results08HomeStatistics | undefined);
      if (payload.versao !== "0.8" || payload.sourceSha256 !== RESULTS_08_SOURCE_SHA256 || rows.some(row => !row ||
          !Number.isInteger(row.numericos) || !Number.isInteger(row.nulos) || row.observados !== row.numericos + row.nulos ||
          (row.numericos === 0 ? row.media !== null : !Number.isFinite(row.media)))) throw new Error();
      if (!controller.signal.aborted) setStats(rows as Results08HomeStatistics[]);
    }
    void load().catch(() => { if (!controller.signal.aborted) setStats(null); });
    return () => controller.abort();
  }, []);
  const status = stats === undefined ? "Consultando…" : "Indisponível";
  const campaignList = RESULTS_08_CAMPAIGNS.join(" · ");
  return <>
    <section className="grid grid-cols-2 items-stretch gap-3 xl:grid-cols-4" aria-label="Indicadores da operação e das campanhas">
      <CanonicalKpi icon={CheckCircle2} label="Observações com estimativa · por campanha" value={stats ? stats.map(row => row.numericos).join(" · ") : status} detail={stats ? `${campaignList}, de ${stats.map(row => row.observados).join(" · ")} observações` : "C1 a C3 · método 0.8"} />
      <CanonicalKpi icon={FlaskConical} label="Índice geral médio 0.8 · por campanha" value={stats ? stats.map(row => row.media === null ? "sem estimativa" : formatMean(row.media)).join(" · ") : status} detail={`${campaignList}. Cada campanha é calculada à parte; não há média entre campanhas.`} />
      <CanonicalKpi icon={CircleDot} label="Campanhas ativas" value={management ? String(countOperationallyActiveCampaigns(Object.values(management).map(item => item.status))) : "—"} detail="em campo, laboratório ou análise" />
      {operationalKpis}
    </section>
    <details className="app-card p-4"><summary className="min-h-11 cursor-pointer type-panel-title">Mapa de navegação</summary>
      <CampaignHydroMap points={[]} layers={{ roadMap: true, basins: true, dailyRoutes: false, dayTransitions: false, planned: false, effective: false, displacement: false }} />
    </details>
    <Link href="/campanhas/resultados" className="inline-flex min-h-11 items-center underline">Consultar resultados das campanhas</Link>
    <ProjectStatusPanel compact />{projectSummary}
  </>;
}

/** A campanha mais recente abre a Home. */
export function orderCaptureCampaignsForHome(campaigns: ResultsCampaign[]) {
  return [...campaigns].sort((left, right) => campaignNumber(right.campaignCode) - campaignNumber(left.campaignCode));
}

export function completeOverallSummary(campaign?: ResultsCampaign) {
  const values = (campaign?.points ?? []).flatMap((point) =>
    point.completeness === "complete" && point.overall.value !== null && Number.isFinite(point.overall.value)
      ? [point.overall.value] : [],
  );
  return { count: values.length, mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
}

function formatMean(value: number | null) {
  return formatCaptureIndex(value);
}

export function orderPublishedResultsForHome(
  entries: Array<{ campaign: ResultsCampaign; publishedAt: string }>,
) {
  return [...entries]
    .sort((left, right) =>
      Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
      campaignNumber(right.campaign.campaignCode) - campaignNumber(left.campaign.campaignCode),
    )
    .map((entry) => entry.campaign);
}

function campaignNumber(campaignCode: string) {
  const number = Number(campaignCode.match(/\d+/)?.[0]);
  return Number.isFinite(number) ? number : 0;
}
