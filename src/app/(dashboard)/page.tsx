import { HomeCanonicalKpis } from "@/components/home-canonical-kpis";
import { HomeProjectSummary } from "@/components/home-project-summary";
import { HomeRiskMapSection } from "@/components/home-risk-map-section";
import { ProjectStatusPanel } from "@/components/project-status-panel";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dashboardData = await loadDashboardData();
  const {
    campaignPoints,
    laboratoryRiskPoints,
    pointSummary,
  } = dashboardData;

  return (
    <div className="app-container space-y-4">
      <HomeCanonicalKpis
        laboratoryRiskPoints={laboratoryRiskPoints}
        pointSummary={pointSummary}
      />
      <HomeRiskMapSection
        campaignPoints={campaignPoints}
        points={laboratoryRiskPoints}
      />
      <ProjectStatusPanel compact reserveRightRail />
      <HomeProjectSummary pointSummary={pointSummary} />
    </div>
  );
}
