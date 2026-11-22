import { CaptureResultsEntry, type ResultsQuery } from "@/components/capture-results-entry";
import { CampaignsPageContent } from "@/components/campaigns-page-content";
import { campaignFromQuery } from "@/lib/campaign-identity";
import { InvalidCampaignNotice } from "@/components/invalid-campaign-notice";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function CampanhasResultadosPage({ searchParams }: { searchParams: Promise<ResultsQuery> }) {
  const query = await searchParams;
  const { campaign: value, publicationId, sourceHash, sia } = query;
  const requested = campaignFromQuery(value);
  if (requested === null || (!requested && (publicationId || sourceHash || sia))) {
    return <InvalidCampaignNotice href="/campanhas/resultados" label="Escolher campanha em Resultados" />;
  }
  if (query.painel !== "operacional" && publicationId === undefined && sourceHash === undefined && !(requested && /^campanha-[4-9]$/.test(requested.id))) {
    return <CaptureResultsEntry query={query} path="/campanhas/resultados"/>;
  }
  if (Array.isArray(publicationId) || Array.isArray(sourceHash) || Array.isArray(sia)) return <InvalidCampaignNotice href="/campanhas/resultados" label="Escolher campanha em Resultados" />;
  const campaign = requested?.id;
  // Os pontos de campo alimentam o cabeçalho comum (pontos coletados), igual à aba Campo.
  const { campaignPoints } = await loadDashboardData();
  return (
    <CampaignsPageContent
      key={`${campaign ?? ""}:${publicationId ?? ""}:${sourceHash ?? ""}:${sia ?? ""}`}
      initialCampaignId={campaign}
      initialPublicationId={publicationId}
      initialSourceHash={sourceHash}
      initialSia={sia}
      campaignPoints={campaignPoints}
      view="resultados"
    />
  );
}
