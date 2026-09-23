import { Download, FileSpreadsheet, FlaskConical, ImageIcon, Info, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { LegacyPublishedResults } from "@/modules/results/components/legacy-published-results";
import {
  buildPriorityMunicipalities,
  CampaignHydroMap,
  type CampaignHydroMapPoint,
} from "@/components/campaign-hydro-map";
import type { MetabarcodingStage } from "@/components/metabarcoding-stages";
import { DashboardSkeleton, ErrorBoundary } from "@/components/operational-feedback";
import { RiskPhotoModal } from "@/components/home-risk-map-section";
import { type CampaignView } from "@/lib/campaign-management";
import {
  laboratoryRiskColor,
  laboratoryRiskLabel,
  laboratoryRiskTextColor,
} from "@/lib/laboratory-risk";
import type { ResultsPublication } from "@/lib/imports/results-contract";
import { getPhotoPreview } from "@/lib/photo-preview";
import { CampaignResultsDashboard } from "@/modules/results/components/campaign-results-dashboard";
import type { ResultsCampaign } from "@/modules/results";
import type { ResultsPublicationV2 } from "@/lib/results-v2-persistence";

type CampaignResultsPanelsProps = {
  children?: ReactNode;
  isHydrating?: boolean;
  resultsUnavailable?: boolean;
  showUnavailableNotice?: boolean;
  campaign?: CampaignView;
  publication?: ResultsPublication;
  resultsV2?: ResultsCampaign[];
  resultsV2Publication?: Pick<ResultsPublicationV2, "publicationId" | "source">;
  resultsV2Photos?: Record<string, string>;
  resultsV2PayloadUnavailable?: boolean;
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
  publication,
  resultsV2,
  resultsV2Publication,
  resultsV2Photos,
  resultsV2PayloadUnavailable,
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

  const hasV2Results = Boolean(resultsV2?.length);

  return (
    <ErrorBoundary title="Falha nos resultados da campanha">
      {resultsV2PayloadUnavailable ? (
        <EmptyCampaignPanel
          title="Publicação localizada, conteúdo indisponível"
          description="A publicação desta campanha existe, mas os pontos auditados não estão disponíveis para consulta. Nenhum resultado anterior foi usado como substituto."
        />
      ) : resultsUnavailable && !hasV2Results ? (
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
           {hasV2Results ? (
             <div className="space-y-4">
               <CampaignResultsDashboard
                 key={`${resultsV2?.[0]?.campaignCode}:${resultsV2Publication?.publicationId}:${resultsV2Publication?.source.sha256}`}
                 campaign={resultsV2![0]}
                 publication={resultsV2Publication}
                 campaignLabel={campaign.title}
                 fieldPhotos={resultsV2Photos}
               />
             </div>
          ) : (
            <ResultsDashboardSection
              campaign={campaign}
              publication={publication}
              canDownload={Boolean(canDownload)}
              isDownloading={Boolean(isDownloading)}
              downloadMessage={downloadMessage}
              onDownload={onDownload}
            />
          )}
          {!hasV2Results ? <AnalyticResultsMap points={points} /> : null}
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

  const selectedPoint = points.find((point) => point.id === selectedPointId) ?? points[0];

  return (
    <section aria-labelledby="risk-map-title" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,34%)]">
      <div className="min-w-0">
        <h2 id="risk-map-title" className="sr-only">Mapa único de risco molecular</h2>
        <div className="relative h-[500px] overflow-hidden radius-panel border border-[var(--line-ghost)] bg-[image:var(--map-surface)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)] max-sm:h-[420px]">
          <CampaignHydroMap
            points={points}
            selectedPointId={selectedPoint.id}
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
        <SelectedResultPoint point={selectedPoint} />
        <div className="border-b border-[var(--line-ghost)] px-4 py-4">
          <h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">
            Municípios prioritários
          </h3>
          <p className="type-help mt-1 text-[var(--ink-soft)]">
            {municipalities.length} municípios ordenados pelo maior score entre seus {points.length} pontos.
          </p>
        </div>
        <div className="overflow-x-auto md:overflow-y-auto">
          <table className="type-table w-full min-w-[300px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[var(--surface-soft)] text-[var(--brand-navy-strong)]">
              <tr>
                <th className="px-3 py-2 font-black">Município</th>
                <th className="px-2 py-2 text-center font-black">Pts</th>
                <th className="px-3 py-2 text-right font-black">Score máx.</th>
              </tr>
            </thead>
            <tbody>
              {municipalities.map((municipality) => {
                const selected = municipality.priorityPoint.id === selectedPoint.id;
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
                          className="type-caption mt-1 inline-flex rounded-full border px-2 py-0.5 font-bold"
                          style={{
                            backgroundColor: laboratoryRiskColor(municipality.riskLevel),
                            borderColor: laboratoryRiskColor(municipality.riskLevel),
                            color: laboratoryRiskTextColor(municipality.riskLevel),
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

export function SelectedResultPoint({ point }: { point: CampaignHydroMapPoint }) {
  const preview = getPhotoPreview(point.photoUrl || point.photos?.[0]?.url);
  const [failedUrl, setFailedUrl] = useState("");
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);
  const photoUrl = preview?.kind === "image" ? preview.src : "";
  const hasPhoto = Boolean(photoUrl && failedUrl !== photoUrl);

  return (
    <>
      <section aria-live="polite" className="border-b border-[var(--line-ghost)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row md:flex-col xl:flex-row">
        <div className="h-32 w-full shrink-0 overflow-hidden rounded-xl bg-[var(--surface-soft)] sm:w-44 md:w-full xl:w-40">
          {hasPhoto ? (
            <button
              type="button"
              className="relative min-h-11 min-w-11 h-full w-full focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-teal)]"
              aria-label={`Ampliar foto de campo do ponto ${point.code}`}
              onClick={() => setIsPhotoExpanded(true)}
              onDoubleClick={() => setIsPhotoExpanded(true)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`Foto de campo do ponto ${point.code}${point.municipality ? ` em ${point.municipality}` : ""}`}
                className="h-full w-full object-cover"
                onError={() => setFailedUrl(photoUrl)}
                src={photoUrl}
              />
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-caption font-bold text-white">
                ampliar
              </span>
            </button>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-slate-500" role="status">
              <ImageIcon className="h-6 w-6 text-slate-400" />
              <span className="text-xs font-bold">Foto de campo indisponível</span>
            </div>
          )}
        </div>
        <div className="min-w-0 self-center">
          <p className="text-xs font-black text-[var(--brand-teal)]">{point.code}</p>
          <h3 className="mt-1 text-sm font-black leading-5 text-[var(--brand-navy-strong)]">
            {point.point || point.waterBody}
          </h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
            {point.municipality || "Município não informado"}
          </p>
          {point.riskLevel ? (
            <p className="mt-2 text-xs font-bold text-slate-700">
              {laboratoryRiskLabel(point.riskLevel)}
              {typeof point.score === "number" ? ` · Score ${formatRiskScore(point.score)}` : ""}
            </p>
          ) : null}
        </div>
        </div>
      </section>
      {isPhotoExpanded && hasPhoto ? (
        <RiskPhotoModal
          point={{ code: point.code, municipality: point.municipality, photoUrl }}
          onClose={() => setIsPhotoExpanded(false)}
        />
      ) : null}
    </>
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
      <p className="type-eyebrow text-[var(--brand-teal)]">
        Resultados indisponíveis
      </p>
      <h3 className="heading-font type-section-title mt-2 max-w-2xl text-[var(--brand-navy-strong)]">
        Ainda não temos resultados publicados para {campaign.title}
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
        A campanha pode ser acompanhada nas telas de campo e diário de campo. Esta área será liberada após uma publicação válida na Central de dados.
      </p>
      <Link
        href="/dados/resultados"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]"
      >
        Ir para Central de dados
      </Link>
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
        <p className="type-eyebrow text-[var(--brand-teal)]">
          Sem resultados publicados
        </p>
        <h3
          className="heading-font type-section-title mt-2 text-[var(--brand-navy-strong)]"
          id="unavailable-results-title"
        >
          Ainda não temos resultados da {campaignName}
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Esta campanha ainda não possui uma publicação válida. Assim que o modelo canônico for publicado na Central de dados, a visualização ficará disponível.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            className="inline-flex items-center justify-center rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-[var(--brand-blue)]"
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

function ResultsDashboardSection({ campaign, publication, canDownload, isDownloading, downloadMessage, onDownload }: {
  campaign: CampaignView;
  publication?: ResultsPublication;
  canDownload: boolean;
  isDownloading: boolean;
  downloadMessage?: string;
  onDownload?: () => void;
}) {
  return <section className="min-w-0 space-y-3">
    {publication ? <LegacyPublishedResults publication={publication} /> : <EmptyCampaignPanel title="Resultados indisponíveis" description={`Nenhuma publicação disponível para ${campaign.title}.`} />}
    <button type="button" onClick={onDownload} disabled={!canDownload || isDownloading || !onDownload} className="type-button inline-flex min-h-11 items-center gap-2 rounded border border-[var(--line-strong)] px-4 disabled:opacity-50"><Download className="h-4 w-4" />{isDownloading ? "Gerando planilha..." : "Resultados"}</button>
    {downloadMessage && <p role="status" className="type-metadata">{downloadMessage}</p>}
  </section>;
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
