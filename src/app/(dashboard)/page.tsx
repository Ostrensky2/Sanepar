import { HomeCanonicalKpis } from "@/components/home-canonical-kpis";
import { HomeProjectSummary } from "@/components/home-project-summary";
import { HomeRiskEvolution } from "@/components/home-risk-evolution";
import { HomeRiskMapSection } from "@/components/home-risk-map-section";
import { ProjectStatusPanel } from "@/components/project-status-panel";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const SHOW_RESULTS_REVIEW_NOTICE = true;

export default async function DashboardPage() {
  const dashboardData = await loadDashboardData();
  const {
    campaignPoints,
    laboratoryRiskPoints,
    pointSummary,
  } = dashboardData;

  return (
    <div className="app-container space-y-4">
      <h1 className="heading-font type-page-title text-[var(--brand-navy-strong)]">
        Painel de Monitoramento
      </h1>
      {SHOW_RESULTS_REVIEW_NOTICE ? <ResultsReviewDialog /> : null}
      <HomeCanonicalKpis
        laboratoryRiskPoints={laboratoryRiskPoints}
        pointSummary={pointSummary}
      />
      <HomeRiskEvolution points={laboratoryRiskPoints} />
      <HomeRiskMapSection
        campaignPoints={campaignPoints}
        points={laboratoryRiskPoints}
      />
      <ProjectStatusPanel compact reserveRightRail />
      <HomeProjectSummary pointSummary={pointSummary} />
    </div>
  );
}
