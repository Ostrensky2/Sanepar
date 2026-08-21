import { CampaignsPageContent } from "@/components/campaigns-page-content";
import { loadCampaign1DashboardMapPoints, loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function CampanhasResultadosPage() {
  const [{ laboratoryRiskPoints }, dashboardMapPoints] = await Promise.all([
    loadDashboardData(),
    loadCampaign1DashboardMapPoints(),
  ]);

  return (
    <CampaignsPageContent
      campaignPoints={dashboardMapPoints.length ? dashboardMapPoints : laboratoryRiskPoints}
      resultExportPoints={laboratoryRiskPoints}
      view="resultados"
    />
  );
}
