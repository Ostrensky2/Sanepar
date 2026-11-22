"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCaptureIndex } from "@/lib/capture-index/format";
import { defaultCampaigns, readCampaignManagement, type CampaignManagementById } from "@/lib/campaign-management";
import { CircleDot, FlaskConical, CheckCircle2 } from "lucide-react";
import { HomeIndexEvolution } from "./home-index-evolution";
import { CanonicalKpi, countOperationallyActiveCampaigns } from "@/components/home-canonical-kpis";
import { ProjectStatusPanel } from "@/components/project-status-panel";
import { continuousResultColor } from "@/components/campaign-hydro-map";
import { buildResultsV2PhotoMap } from "@/components/campaigns-page-content";
import { readFieldDiaryEntries, type FieldDiaryEntry } from "@/lib/field-diary";
import { campaignIdentityKey } from "@/lib/campaign-identity";
import type { ResultsCampaign } from "@/modules/results";
import { ResultsIndexDashboard } from "@/modules/results/components/results-index-dashboard";

export function HomeResultsV2({ operationalKpis, projectSummary }: { operationalKpis?: React.ReactNode; projectSummary?: React.ReactNode }) {
  const [campaigns, setCampaigns] = useState<ResultsCampaign[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [diary, setDiary] = useState<FieldDiaryEntry[] | null>(null);
  const [management, setManagement] = useState<CampaignManagementById | null>(null);

  useEffect(() => {
    let active = true;
    void readFieldDiaryEntries().then((entries) => { if (active) setDiary(entries); });
    void readCampaignManagement(defaultCampaigns).then((value) => { if (active) setManagement(value); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // O índice exibido é o de captação (IR-CAPTACAO), entregue no formato das telas de resultados.
    // As publicações antigas (SANEPAR-INDICE-0.3) continuam guardadas, mas não alimentam mais a Home.
    void fetch("/api/results/capture-index/campaigns", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("results unavailable");
        return (await response.json()) as { campaigns: ResultsCampaign[] };
      })
      .then((payload) => orderCaptureCampaignsForHome(payload.campaigns))
      .then(setCampaigns)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  if (failed) {
    return (
      <section className="app-card p-5" role="status">
        <h2 className="heading-font type-section-title text-[var(--brand-navy-strong)]">
          Resultados temporariamente indisponíveis
        </h2>
        <p className="type-body mt-2 text-[var(--ink-soft)]">
          Não foi possível consultar as publicações agora. Nenhum resultado anterior foi usado como substituto.
        </p>
      </section>
    );
  }

  if (campaigns === null) {
    return <section className="app-card h-40 animate-pulse bg-[var(--surface-soft)]" aria-label="Carregando resultados por índices" />;
  }

  const labels = Object.fromEntries(defaultCampaigns.map((campaign, index) => [`C${index + 1}`, campaign.title]));
  const fieldPhotos = Object.assign({}, ...campaigns.map((campaign) => {
    const id = defaultCampaigns[campaignNumber(campaign.campaignCode) - 1]?.id;
    return buildResultsV2PhotoMap(campaign, (diary ?? []).filter((entry) => campaignIdentityKey(entry.campaignId, entry.campaignName) === id));
  }));
  const activeCampaigns = management ? countOperationallyActiveCampaigns(Object.values(management).map((item) => item.status)) : null;
  return (
    <>
    <ResultsIndexDashboard
      summary
      campaigns={campaigns}
      initialCampaignCode={campaigns[0]?.campaignCode}
      campaignLabels={labels}
      fieldPhotos={fieldPhotos}
      overview={(campaign) => {
        const stats = completeOverallSummary(campaign);
        return <>
          <section className="grid grid-cols-2 items-stretch gap-3 xl:grid-cols-4" aria-label="Indicadores da operação e da campanha">
            <CanonicalKpi icon={CheckCircle2} label="Pontos com resultado" value={String(campaign.counts.complete)} detail={`${campaign.campaignCode} · ${campaign.counts.total} pontos na campanha · ${campaign.counts.unavailable} sem medição`} />
            <CanonicalKpi icon={FlaskConical} label="Índice médio da rede" value={formatMean(stats.mean)} detail={`${campaign.campaignCode} · média de ${stats.count} pontos medidos, um voto por ponto`} accentColor={stats.mean === null ? undefined : continuousResultColor(stats.mean)} />
            <CanonicalKpi icon={CircleDot} label="Campanhas ativas" value={activeCampaigns === null ? "—" : String(activeCampaigns)} detail="em campo, laboratório ou análise" />
            {operationalKpis}
          </section>
          <section className="app-card space-y-2 p-4" aria-labelledby="campaign-reading">
            <h2 id="campaign-reading" className="type-section-title text-[var(--brand-navy-strong)]">O que olhar nesta campanha</h2>
            <p><strong>{labels[campaign.campaignCode]}</strong> · {stats.count} de {campaign.counts.total} pontos com índice calculado.</p>
            <p className="type-metadata text-[var(--text-secondary)]">Bibliotecas utilizáveis: 16S em {campaign.points.filter(point => point.components.bacteria.included).length} pontos e COI em {campaign.points.filter(point => point.components.coi.included).length}. Um marcador ausente limita a interpretação.</p>
            <p className="type-metadata">{campaigns.filter(item => item.points.some(point => Number.isFinite(point.overall.value))).length} campanhas com medição, de {defaultCampaigns.length} previstas no planejamento.</p>
            <Link className="inline-flex min-h-11 items-center font-semibold underline" href={`/campanhas/resultados?campaign=${defaultCampaigns[campaignNumber(campaign.campaignCode)-1]?.id ?? campaign.campaignCode}#results-index-dashboard`}>Consultar mapa e pontos</Link>
          </section>
          <HomeIndexEvolution campaigns={campaigns} />
        </>;
      }}
    />
    <ProjectStatusPanel compact />
    {projectSummary}
    </>
  );
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
