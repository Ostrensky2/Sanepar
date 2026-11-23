"use client";

import { useEffect, useState } from "react";
import { defaultCampaigns, readCampaignManagement, type CampaignManagementById } from "@/lib/campaign-management";
import { CircleDot, FlaskConical } from "lucide-react";
import { CanonicalKpi, countOperationallyActiveCampaigns } from "@/components/home-canonical-kpis";
import { ProjectStatusPanel } from "@/components/project-status-panel";
import { CampaignHydroMap } from "@/components/campaign-hydro-map";
import { RESULTS_08_CAMPAIGNS } from "@/lib/results-08-contract";
import { CampaignDistribution } from "./campaign-distribution";
import type { ResultsCampaign } from "@/modules/results";

export function HomeResultsV2({ operationalKpis, projectSummary }: { operationalKpis?: React.ReactNode; projectSummary?: React.ReactNode }) {
  const [management, setManagement] = useState<CampaignManagementById | null>(null);
  useEffect(() => {
    let active = true;
    void readCampaignManagement(defaultCampaigns).then(value => { if (active) setManagement(value); });
    return () => { active = false; };
  }, []);
  return <>
    <section className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-3" aria-label="Indicadores da operação e das campanhas">
      <CanonicalKpi icon={FlaskConical} label="Campanhas com índice de captação" value={String(RESULTS_08_CAMPAIGNS.length)} detail={`${RESULTS_08_CAMPAIGNS.join(", ")} · metodologia 0.8`} />
      <CanonicalKpi icon={CircleDot} label="Campanhas ativas" value={management ? String(countOperationallyActiveCampaigns(Object.values(management).map(item => item.status))) : "—"} detail="em campo, laboratório ou análise" />
      {operationalKpis}
    </section>
    {/* Uma leitura por campanha, lado a lado. As campanhas são independentes: não há total nem média entre campanhas. */}
    <CampaignDistribution />
    <ProjectStatusPanel compact />{projectSummary}
    <details className="disclosure app-card p-4"><summary className="flex min-h-11 cursor-pointer items-center type-panel-title">Mapa de navegação</summary>
      <div className="relative mt-3 h-[420px] overflow-hidden rounded-xl bg-[var(--surface-soft)] max-sm:h-[340px]">
        <CampaignHydroMap points={[]} layers={{ roadMap: true, basins: true, dailyRoutes: false, dayTransitions: false, planned: false, effective: false, displacement: false }} />
      </div>
    </details>
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
