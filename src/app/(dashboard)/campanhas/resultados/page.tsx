import { CampaignsPageContent } from "@/components/campaigns-page-content";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function CampanhasResultadosPage({ searchParams }: { searchParams: Promise<{ campaign?: string; publicationId?: string; sourceHash?: string; sia?: string }> }) {
  const { campaign, publicationId, sourceHash, sia } = await searchParams;
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
