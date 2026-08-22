import { HomeCanonicalKpis } from "@/components/home-canonical-kpis";
import { HomeProjectSummary } from "@/components/home-project-summary";
import { HomeRiskEvolution } from "@/components/home-risk-evolution";
import { HomeRiskMapSection } from "@/components/home-risk-map-section";
import { ProjectStatusPanel } from "@/components/project-status-panel";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const SHOW_C2_RESULTS_REVIEW_NOTICE = true;

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
      {SHOW_C2_RESULTS_REVIEW_NOTICE ? (
        <section
          role="status"
          aria-live="polite"
          className="rounded-xl border-4 border-[var(--brand-danger)] bg-[rgba(186,26,26,0.06)] px-4 py-3 text-[var(--ink)]"
        >
          <h2 className="heading-font type-section-title text-center font-extrabold text-[var(--brand-danger)]">
            Resultados da 2ª Campanha em revisão
          </h2>
          <p className="type-body mx-auto mt-1 max-w-3xl text-center text-[var(--ink)]">
            Os resultados atualmente exibidos são preliminares e ainda não são definitivos. Os resultados definitivos serão divulgados em breve.
          </p>
        </section>
      ) : null}
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
