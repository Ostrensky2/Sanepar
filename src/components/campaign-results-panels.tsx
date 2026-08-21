import { BarChart3, Download, ExternalLink, FileSpreadsheet, FlaskConical, Info, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPriorityMunicipalities,
  CampaignHydroMap,
  type CampaignHydroMapPoint,
} from "@/components/campaign-hydro-map";
import {
  MetabarcodingStagesIndicator,
  type MetabarcodingStage,
} from "@/components/metabarcoding-stages";
import { DashboardSkeleton, ErrorBoundary } from "@/components/operational-feedback";
import { type CampaignView } from "@/lib/campaign-management";
import { laboratoryRiskColor, laboratoryRiskLabel } from "@/lib/laboratory-risk";

type CampaignResultsPanelsProps = {
  children?: ReactNode;
  isHydrating?: boolean;
  resultsUnavailable?: boolean;
  showUnavailableNotice?: boolean;
  campaign?: CampaignView;
  stages?: MetabarcodingStage[];
  stageTitle?: string;
  points?: CampaignHydroMapPoint[];
  canDownload?: boolean;
  isDownloading?: boolean;
  downloadMessage?: string;
  onDownload?: () => void;
  onDismissUnavailableNotice?: () => void;
};

export function CampaignResultsPanels({
  children,
  isHydrating,
  resultsUnavailable,
  showUnavailableNotice,
  campaign,
  stages,
  stageTitle,
  points,
  canDownload,
  isDownloading,
  downloadMessage,
  onDownload,
  onDismissUnavailableNotice,
}: CampaignResultsPanelsProps) {
  if (children) {
    return <div className="space-y-6">{children}</div>;
  }

  if (!campaign || !stages || !stageTitle || !points || !onDismissUnavailableNotice) {
    return null;
  }

  if (isHydrating) {
    return <DashboardSkeleton rows={4} />;
  }

  return (
    <ErrorBoundary title="Falha nos resultados da campanha">
      {resultsUnavailable ? (
        <>
          <UnavailableResultsNotice
            campaignName={campaign.title}
            open={Boolean(showUnavailableNotice)}
            onClose={onDismissUnavailableNotice}
          />
          <ResultsUnavailablePanel campaign={campaign} />
        </>
      ) : (
        <>
          <ResultsDashboardSection
            campaign={campaign}
            canDownload={Boolean(canDownload)}
            isDownloading={Boolean(isDownloading)}
            downloadMessage={downloadMessage}
            onDownload={onDownload}
          />
          <MetabarcodingStagesIndicator stages={stages} title={stageTitle} />
          <AnalyticResultsMap points={points} />
        </>
      )}
    </ErrorBoundary>
  );
}

function AnalyticResultsMap({ points }: { points: CampaignHydroMapPoint[] }) {
  const [selectedPointId, setSelectedPointId] = useState<string>();
  const municipalities = useMemo(() => buildPriorityMunicipalities(points), [points]);

  if (!points.length) {
    return (
      <EmptyCampaignPanel
        title="Mapa de risco aguardando pontos"
        description="Os pontos homologados de risco ainda não foram carregados para esta visualização."
      />
    );
  }

  return (
    <section aria-labelledby="risk-map-title" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,34%)]">
      <div className="min-w-0">
        <h2 id="risk-map-title" className="sr-only">Mapa único de risco molecular</h2>
        <div className="relative h-[500px] overflow-hidden radius-panel border border-[var(--line-ghost)] bg-[linear-gradient(180deg,#eef5f8,#e6eef3)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)] max-sm:h-[420px]">
          <CampaignHydroMap
            points={points}
            selectedPointId={selectedPointId}
            onSelectPoint={(point) => setSelectedPointId(point.id)}
            layers={{
              roadMap: true,
              basins: true,
              dailyRoutes: false,
              dayTransitions: false,
              planned: false,
              effective: true,
              displacement: false,
            }}
            markerMode="risk"
            showPointTooltip
            clipBaseTilesToBasins
            caption="Paraná · cor = classe · área = score integrado"
          />
        </div>
      </div>

      <aside className="flex min-h-0 flex-col overflow-hidden radius-panel border border-[var(--line-ghost)] bg-white md:max-h-[500px]">
        <div className="border-b border-[var(--line-ghost)] px-4 py-4">
          <h3 className="heading-font text-lg font-extrabold text-[var(--brand-navy-strong)]">
            Municípios prioritários
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {municipalities.length} municípios ordenados pelo maior score entre seus {points.length} pontos.
          </p>
        </div>
        <div className="overflow-x-auto md:overflow-y-auto">
          <table className="w-full min-w-[300px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--surface-soft)] text-[var(--brand-navy-strong)]">
              <tr>
                <th className="px-3 py-2 font-black">Município</th>
                <th className="px-2 py-2 text-center font-black">Pts</th>
                <th className="px-3 py-2 text-right font-black">Score máx.</th>
              </tr>
            </thead>
            <tbody>
              {municipalities.map((municipality) => {
                const selected = municipality.priorityPoint.id === selectedPointId;
                return (
                  <tr
                    key={municipality.municipality}
                    className={`border-t border-[var(--line-ghost)] ${selected ? "bg-[var(--surface-soft)]" : "hover:bg-slate-50"}`}
                  >
                    <td className="p-0">
                      <button
                        type="button"
                        className="min-h-11 w-full px-3 py-2 text-left font-bold text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-teal)]"
                        onClick={() => setSelectedPointId(municipality.priorityPoint.id)}
                        aria-label={`Selecionar ${municipality.municipality}, ${municipality.pointCount} pontos, score máximo ${formatRiskScore(municipality.maxScore)}, prioridade ${laboratoryRiskLabel(municipality.riskLevel)}`}
                      >
                        <span className="block">{municipality.municipality}</span>
                        <span
                          className="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black"
                          style={{
                            backgroundColor: laboratoryRiskColor(municipality.riskLevel),
                            borderColor: laboratoryRiskColor(municipality.riskLevel),
                            color: municipality.riskLevel === "baixo" ? "#fff" : "#111827",
                          }}
                        >
                          {laboratoryRiskLabel(municipality.riskLevel)}
                        </span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-center font-bold text-slate-700">{municipality.pointCount}</td>
                    <td className="px-3 py-2 text-right font-black tabular-nums text-[var(--brand-navy-strong)]">
                      {formatRiskScore(municipality.maxScore)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </aside>
    </section>
  );
}

function formatRiskScore(score: number) {
  return score.toFixed(3).replace(".", ",");
}

function ResultsUnavailablePanel({ campaign }: { campaign: CampaignView }) {
  return (
    <section className="glass-panel flex min-h-[520px] flex-col items-center justify-center radius-panel p-8 text-center">
      <div className="mb-5 rounded-2xl bg-[var(--surface-soft)] p-4 text-[var(--brand-navy)]">
        <FlaskConical className="h-9 w-9" />
      </div>
      <p className="text-caption font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
        Resultados indisponíveis
      </p>
      <h3 className="heading-font mt-2 max-w-2xl text-2xl font-extrabold text-[var(--brand-navy-strong)]">
        Ainda não temos resultados publicados para {campaign.title}
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
        A campanha pode ser acompanhada nas telas de campo e diário de campo. Esta área será liberada quando a planilha de resultados ou o dashboard eDNA forem publicados.
      </p>
    </section>
  );
}

function UnavailableResultsNotice({
  campaignName,
  open,
  onClose,
}: {
  campaignName: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div
        aria-labelledby="unavailable-results-title"
        aria-modal="true"
        className="w-full max-w-lg radius-panel border border-[var(--line-ghost)] bg-white p-5 shadow-[0_30px_90px_-38px_rgba(0,66,98,0.48)]"
        role="dialog"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="rounded-2xl bg-[var(--surface-soft)] p-3 text-[var(--brand-navy)]">
            <Info className="h-6 w-6" />
          </div>
          <button
            aria-label="Fechar aviso de resultados indisponíveis"
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            type="button"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-caption font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
          Sem resultados publicados
        </p>
        <h3
          className="heading-font mt-2 text-2xl font-extrabold text-[var(--brand-navy-strong)]"
          id="unavailable-results-title"
        >
          Ainda não temos resultados da {campaignName}
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Esta campanha ainda não possui planilha de resultados ou dashboard eDNA publicados. Assim que os dados forem inseridos, a visualização de resultados ficará disponível.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            className="inline-flex items-center justify-center rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[var(--brand-blue)]"
            type="button"
            onClick={onClose}
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultsDashboardSection({
  campaign,
  canDownload,
  isDownloading,
  downloadMessage,
  onDownload,
}: {
  campaign: CampaignView;
  canDownload: boolean;
  isDownloading: boolean;
  downloadMessage?: string;
  onDownload?: () => void;
}) {
  const hasDashboard = Boolean(campaign.resultsDashboardUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const observerCleanupRef = useRef<(() => void) | null>(null);
  const [iframeHeight, setIframeHeight] = useState(640);

  useEffect(() => () => observerCleanupRef.current?.(), []);

  function syncIframeHeight() {
    observerCleanupRef.current?.();
    const frame = iframeRef.current;
    const document = frame?.contentDocument;
    if (!frame || !document) return;

    let animationFrame = 0;
    let releaseFrame = 0;
    let measuring = false;
    const sync = () => {
      if (measuring) return;
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        measuring = true;
        frame.style.height = "0px";
        const nextHeight = Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight,
        );
        frame.style.height = `${nextHeight}px`;
        setIframeHeight((current) => (current === nextHeight ? current : nextHeight));
        releaseFrame = requestAnimationFrame(() => {
          measuring = false;
        });
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(document.body);
    frame.contentWindow?.addEventListener("resize", sync);
    observerCleanupRef.current = () => {
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(releaseFrame);
      observer.disconnect();
      frame.contentWindow?.removeEventListener("resize", sync);
    };
    sync();
  }

  return (
    <section className="scroll-mt-20 overflow-hidden radius-panel border border-[var(--line-ghost)] bg-white">
      <div className="flex flex-col gap-3 border-b border-[var(--line-ghost)] bg-[var(--surface-soft)]/55 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]">
            <BarChart3 className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="type-caption font-bold uppercase tracking-[0.12em] text-[var(--brand-teal)]">
              Resultados Monitoramento
            </p>
            <h2 className="heading-font type-section-title mt-1 text-[var(--brand-navy-strong)]">
              Dashboard de resultados
            </h2>
            <p className="type-metadata mt-1 font-semibold text-[var(--ink-soft)]">{campaign.title}</p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          {hasDashboard ? (
            <a
              href={campaign.resultsDashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--brand-navy-strong)] transition hover:bg-[var(--brand-blue-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-blue)] sm:w-auto"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir dashboard
            </a>
          ) : null}
          <button
            type="button"
            onClick={onDownload}
            disabled={!canDownload || isDownloading || !onDownload}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--brand-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-blue)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            {isDownloading ? "Gerando planilha..." : "Baixar planilha (.xlsx)"}
          </button>
          {downloadMessage ? (
            <p aria-live="polite" className="text-xs font-semibold text-[var(--ink-soft)] sm:basis-full sm:text-right">
              {downloadMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        {hasDashboard ? (
          <iframe
            ref={iframeRef}
            src={campaign.resultsDashboardUrl}
            title={`Dashboard de resultados - ${campaign.title}`}
            className="block w-full border-0 bg-white"
            style={{ height: iframeHeight }}
            loading="lazy"
            onLoad={syncIframeHeight}
          />
        ) : (
          <div className="flex min-h-[520px] flex-col items-center justify-center bg-[var(--surface-soft)] p-8 text-center">
            <div className="mb-4 rounded-2xl bg-[var(--brand-teal-soft)] p-4 text-[var(--brand-teal)]">
              <BarChart3 className="h-8 w-8" />
            </div>
            <p className="heading-font text-2xl font-extrabold text-[var(--brand-navy-strong)]">
              Dashboard aguardando resultados
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ink-soft)]">
              O espaço desta campanha seguirá o mesmo padrão quando o dashboard de resultados for publicado.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyCampaignPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center radius-panel border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
      <FileSpreadsheet className="mb-4 h-10 w-10 text-slate-400" />
      <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">{title}</p>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
