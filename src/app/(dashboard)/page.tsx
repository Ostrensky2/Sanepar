import {
  Activity,
  Info,
  MapPinned,
} from "lucide-react";
import { AppDocumentHighlights, AppDocumentMetric } from "@/components/app-document-home";
import { HomeRiskMapSection } from "@/components/home-risk-map-section";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dashboardData = await loadDashboardData();
  const {
    laboratoryRiskPoints,
    campaignSummary,
    pointSummary,
  } = dashboardData;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-3">
        <article className="glass-panel rounded-[28px] border-b-2 border-[var(--brand-green)] p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Campanhas sazonais
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[var(--brand-navy-strong)]">
              {String(campaignSummary.totalCampaigns).padStart(2, "0")}
            </span>
            <span className="text-xs font-medium text-slate-500">
              registradas / {String(campaignSummary.completedCampaigns).padStart(2, "0")} concluídas
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-[var(--brand-teal)]">
            <Activity className="h-3 w-3" /> {campaignSummary.activeCampaigns} em andamento •{" "}
            {campaignSummary.period}
          </p>
        </article>

        <article className="glass-panel rounded-[28px] border-b-2 border-[var(--brand-teal)] p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Pontos monitorados
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[var(--brand-navy-strong)]">
              {pointSummary.total}
            </span>
            <span className="text-xs font-medium text-slate-500">registros de campanha</span>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-[var(--brand-teal)]">
            <MapPinned className="h-3 w-3" /> Originais {pointSummary.original} / efetivos{" "}
            {pointSummary.effective}
          </p>
        </article>

        <AppDocumentMetric />
      </section>

      <aside
        role="note"
        className="flex items-start gap-3 rounded-[22px] border-l-4 border-amber-500 bg-amber-50/80 p-4 shadow-[0_10px_30px_-22px_rgba(180,83,9,0.45)]"
      >
        <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800">
          <Info className="h-4 w-4" />
        </span>
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700">
            Visualização representativa
          </p>
          <p className="text-sm leading-6 text-amber-900">
            As análises da <strong className="font-bold">primeira campanha ainda não foram finalizadas</strong>.
            O mapa e os indicadores abaixo utilizam <strong className="font-bold">dados fictícios</strong> apenas
            para <strong className="font-bold">ilustrar</strong> como os resultados serão apresentados visualmente
            quando os <strong className="font-bold">laudos laboratoriais</strong> estiverem disponíveis.
          </p>
        </div>
      </aside>

      <HomeRiskMapSection points={laboratoryRiskPoints} />

      <AppDocumentHighlights />
    </div>
  );
}
