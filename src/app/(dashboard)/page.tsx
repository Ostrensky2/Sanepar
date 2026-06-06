import { HomeProjectSummary } from "@/components/home-project-summary";
import { HomeRiskMapSection } from "@/components/home-risk-map-section";
import { ProjectStatusPanel } from "@/components/project-status-panel";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dashboardData = await loadDashboardData();
  const {
    laboratoryRiskPoints,
    pointSummary,
  } = dashboardData;

  return (
    <div className="space-y-4">
      <HomeProjectSummary pointSummary={pointSummary} />

      <ProjectStatusPanel />

      <HomeRiskMapSection points={laboratoryRiskPoints} />
    </div>
  );
}
