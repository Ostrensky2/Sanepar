"use client";

import { useEffect, useState } from "react";
import { formatResultIndex } from "../format-index";
import { defaultCampaigns, readCampaignManagement, type CampaignManagementById } from "@/lib/campaign-management";
import { CircleDot, FlaskConical, CheckCircle2 } from "lucide-react";
import { HomeIndexEvolution } from "./home-index-evolution";
import { CanonicalKpi, countOperationallyActiveCampaigns } from "@/components/home-canonical-kpis";
import { ProjectStatusPanel } from "@/components/project-status-panel";
import { continuousResultColor } from "@/components/campaign-hydro-map";
import { buildResultsV2PhotoMap } from "@/components/campaigns-page-content";
import { readFieldDiaryEntries, type FieldDiaryEntry } from "@/lib/field-diary";
import { campaignIdentityKey } from "@/lib/campaign-identity";
import { isPublishedLegacyResponse, isPublishedV2Response, type PublishedResultsResponse as ResultsResponse } from "../published-response";
import type { ResultsPublication } from "@/lib/imports/results-contract";
import { LegacyPublishedResults } from "./legacy-published-results";
import type { ResultsCampaign } from "@/modules/results";
import { ResultsIndexDashboard } from "@/modules/results/components/results-index-dashboard";

export function HomeResultsV2({ operationalKpis, projectSummary }: { operationalKpis?: React.ReactNode; projectSummary?: React.ReactNode }) {
  const [campaigns, setCampaigns] = useState<ResultsCampaign[] | null>(null);
  const [legacy, setLegacy] = useState<ResultsPublication[]>([]);
  const [failed, setFailed] = useState(false);
  const [partialFailure, setPartialFailure] = useState(false);
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
    // 1) Inventário leve diz quais campanhas têm publicação; 2) só essas são carregadas.
    //    allSettled: uma campanha com falha momentânea não derruba as demais.
    void publishedCampaignNumbers(controller.signal)
      .then((numbers) => Promise.allSettled(numbers.map(async (number) => {
        const response = await fetch(`/api/imports/results?campaignNumber=${number}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("results unavailable");
        return await response.json() as ResultsResponse;
      })))
      .then((settled) => {
        if (controller.signal.aborted) return [];
        const rejected = settled.filter((item) => item.status === "rejected").length;
        if (settled.length && rejected === settled.length) throw new Error("results unavailable");
        setPartialFailure(rejected > 0);
        const responses = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));
        setLegacy(responses.filter(isPublishedLegacyResponse).map((response) => response.publication));
        return responses;
      })
      .then((responses) => orderPublishedResultsForHome(responses.flatMap((response) => {
        if (!isPublishedV2Response(response) || !response.campaign.points) return [];
        return [{
          campaign: {
            campaignCode: response.campaign.campaignCode,
            points: response.campaign.points,
            counts: response.campaign.counts,
          } satisfies ResultsCampaign,
          publishedAt: response.publication.publishedAt,
        }];
      })))
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
    {partialFailure ? (
      <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Algumas campanhas não puderam ser consultadas agora; as demais estão abaixo. Recarregue a página em instantes.
      </p>
    ) : null}
    {legacy.map((publication) => <LegacyPublishedResults key={publication.campaignId} publication={publication} />)}
    {!campaigns.length && legacy.length > 0 && operationalKpis}
    {(campaigns.length > 0 || !legacy.length) && <ResultsIndexDashboard
      summary
      campaigns={campaigns}
      initialCampaignCode={campaigns[0]?.campaignCode}
      campaignLabels={labels}
      fieldPhotos={fieldPhotos}
      overview={(campaign) => {
        const stats = completeOverallSummary(campaign);
        return <>
          <section className="grid grid-cols-2 items-stretch gap-3 xl:grid-cols-4" aria-label="Indicadores da operação e da campanha">
            <CanonicalKpi icon={CheckCircle2} label="Pontos com resultado" value={String(campaign.counts.total)} detail={`${campaign.campaignCode} · ${campaign.counts.complete} completos · ${campaign.counts.partialWithOneSet + campaign.counts.partialWithTwoSets} parciais`} />
            <CanonicalKpi icon={FlaskConical} label="Índice médio — pontos completos" value={formatMean(stats.mean)} detail={`${campaign.campaignCode} · média de ${stats.count} pontos completos; parciais fora da média`} accentColor={stats.mean === null ? undefined : continuousResultColor(stats.mean)} />
            <CanonicalKpi icon={CircleDot} label="Campanhas ativas" value={activeCampaigns === null ? "—" : String(activeCampaigns)} detail="em campo, laboratório ou análise" />
            {operationalKpis}
          </section>
          <HomeIndexEvolution campaigns={campaigns} />
        </>;
      }}
    />}
    <ProjectStatusPanel compact />
    {projectSummary}
    </>
  );
}

/** Números das campanhas com publicação vigente; se o inventário falhar, consulta todas. */
async function publishedCampaignNumbers(signal: AbortSignal) {
  const all = defaultCampaigns.map((_, index) => index + 1);
  try {
    const response = await fetch("/api/imports/results?inventory=1", { cache: "no-store", signal });
    if (!response.ok) return all;
    const inventory = (await response.json()) as { campaigns?: Array<{ campaignCode: string }> };
    if (!Array.isArray(inventory.campaigns)) return all;
    return inventory.campaigns.map((item) => campaignNumber(item.campaignCode)).filter((number) => number > 0);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return all;
  }
}

export function completeOverallSummary(campaign?: ResultsCampaign) {
  const values = (campaign?.points ?? []).flatMap((point) =>
    point.completeness === "complete" && point.overall.value !== null && Number.isFinite(point.overall.value)
      ? [point.overall.value] : [],
  );
  return { count: values.length, mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
}

function formatMean(value: number | null) {
  return formatResultIndex(value, "Indisponível");
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
