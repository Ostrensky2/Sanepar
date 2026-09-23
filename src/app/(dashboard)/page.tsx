import { ResultsReviewDialog } from "@/components/results-review-dialog";
import { HomeResultsV2 } from "@/modules/results/components/home-results-v2";
import { cache, Suspense } from "react";
import { HomeOperationalKpis } from "@/components/home-canonical-kpis";
import { HomeProjectSummary } from "@/components/home-project-summary";
import { loadDashboardData } from "@/lib/dashboard-data";

const readOperationalDashboard = cache(loadDashboardData);

async function OperationalKpis() {
  const { pointSummary } = await readOperationalDashboard();
  return <HomeOperationalKpis monitored={pointSummary.monitored} />;
}

async function OperationalSummary() {
  const { pointSummary } = await readOperationalDashboard();
  return <HomeProjectSummary pointSummary={pointSummary} />;
}

export const dynamic = "force-dynamic";

const SHOW_RESULTS_REVIEW_NOTICE = true;

export default function DashboardPage() {
  return (
    <div className="app-container space-y-4">
      <h1 className="heading-font type-page-title text-[var(--brand-navy-strong)]">
        Painel de Monitoramento
      </h1>
      {SHOW_RESULTS_REVIEW_NOTICE ? <ResultsReviewDialog /> : null}
      <HomeResultsV2
        operationalKpis={<Suspense fallback={<div className="app-card min-h-32 animate-pulse" aria-label="Carregando pontos amostrados" />}><OperationalKpis /></Suspense>}
        projectSummary={<Suspense fallback={<p role="status">Carregando síntese operacional…</p>}><OperationalSummary /></Suspense>}
      />
    </div>
  );
}
