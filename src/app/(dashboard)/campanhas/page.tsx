import { CampaignsPageContent } from "@/components/campaigns-page-content";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function CampanhasPage() {
  const { campaignPoints } = await loadDashboardData();

  return <CampaignsPageContent campaignPoints={campaignPoints} />;
}
