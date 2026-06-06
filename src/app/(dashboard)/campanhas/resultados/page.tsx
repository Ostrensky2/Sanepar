import { CampaignsPageContent } from "@/components/campaigns-page-content";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function CampanhasResultadosPage() {
  const { laboratoryRiskPoints } = await loadDashboardData();

  return <CampaignsPageContent campaignPoints={laboratoryRiskPoints} view="resultados" />;
}
