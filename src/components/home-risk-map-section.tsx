"use client";

import { AlertTriangle, ImageIcon, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CampaignHydroMap,
  type CampaignMapLayerVisibility,
  type CampaignHydroMapPoint,
} from "@/components/campaign-hydro-map";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import {
  hydrateLaboratoryRiskPointPhotos,
  laboratoryRiskColor,
  laboratoryRiskTextColor,
  type LaboratoryRiskLevel,
  type LaboratoryRiskPoint,
} from "@/lib/laboratory-risk";
import { getPhotoPreview } from "@/lib/photo-preview";

const riskLayers: CampaignMapLayerVisibility = {
  roadMap: true,
  basins: true,
  dailyRoutes: false,
  dayTransitions: false,
  planned: false,
  effective: true,
  displacement: false,
};

export function HomeRiskMapSection({
  campaignPoints,
  points,
}: {
  campaignPoints: CampaignMapPoint[];
  points: LaboratoryRiskPoint[];
}) {
  const [activePoints, setActivePoints] = useState(points);
  const [campaignFilter, setCampaignFilter] = useState(points[0]?.campaign || "Todas");
  const [classificationFilter, setClassificationFilter] = useState("Todas");
  const [riskFilter, setRiskFilter] = useState<LaboratoryRiskLevel | "todos">("todos");
  const [pointSearch, setPointSearch] = useState("");
  const [selectedPointId, setSelectedPointId] = useState<string | undefined>(points[0]?.id);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(true);
  const [expandedPhotoPoint, setExpandedPhotoPoint] =
    useState<LaboratoryRiskPoint | null>(null);

  useEffect(() => {
    if (!canUseBrowserOnlyPersistence()) {
      return;
    }

    const timer = window.setTimeout(() => {
      const storedResults = window.localStorage.getItem("yvae:lab-risk-results");

      if (!storedResults) {
        return;
      }

      try {
        const parsed = JSON.parse(storedResults) as LaboratoryRiskPoint[];
        const storedCampaignPoints = readStoredCampaignPoints(campaignPoints);

        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (point) =>
              point?.laboratoryStatus === "homologado" &&
              point.environmentalRiskLevel &&
              point.operationalRiskLevel &&
              point.sanitaryRiskLevel,
          )
        ) {
          const hydratedPoints = hydrateLaboratoryRiskPointPhotos(parsed, storedCampaignPoints);

          setActivePoints(hydratedPoints);
          setSelectedPointId(parsed[0].id);
        } else {
          window.localStorage.removeItem("yvae:lab-risk-results");
        }
      } catch {
        window.localStorage.removeItem("yvae:lab-risk-results");
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [campaignPoints]);

  const campaigns = useMemo(
    () => ["Todas", ...new Set(activePoints.map((point) => point.campaign).filter(Boolean))],
    [activePoints],
  );
  const campaignFilteredPoints = useMemo(
    () =>
      campaignFilter === "Todas"
        ? activePoints
        : activePoints.filter((point) => point.campaign === campaignFilter),
    [activePoints, campaignFilter],
  );
  const classifications = useMemo(
    () => [
      "Todas",
      ...Array.from(
        new Set(campaignFilteredPoints.map((point) => point.riskClassification).filter(Boolean)),
      ).sort(),
    ],
    [campaignFilteredPoints],
  );
  const classificationFilteredPoints = useMemo(
    () =>
      classificationFilter === "Todas"
        ? campaignFilteredPoints
        : campaignFilteredPoints.filter(
            (point) => point.riskClassification === classificationFilter,
          ),
    [campaignFilteredPoints, classificationFilter],
  );
  const filteredPoints = useMemo(
    () =>
      riskFilter === "todos"
        ? classificationFilteredPoints
        : classificationFilteredPoints.filter((point) => point.riskLevel === riskFilter),
    [classificationFilteredPoints, riskFilter],
  );
  const selectedPoint = useMemo(
    () =>
      filteredPoints.find((point) => point.id === selectedPointId) ?? filteredPoints[0],
    [filteredPoints, selectedPointId],
  );
  const campaignSummary = useMemo(
    () => buildRiskSummary(classificationFilteredPoints),
    [classificationFilteredPoints],
  );
  const searchMatches = useMemo(() => {
    const query = pointSearch.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return filteredPoints
      .filter((point) =>
        [point.code, point.municipality, point.eta, point.waterBody]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query)),
      )
      .slice(0, 5);
  }, [filteredPoints, pointSearch]);
  const mapHeightClass = "h-[clamp(420px,52vh,620px)]";
  const sidePanelHeightClass = "h-[calc(clamp(420px,52vh,620px)+20rem)]";

  return (
    <section className="relative space-y-[var(--space-3)] overflow-visible">
      <div className="glass-panel radius-panel border border-[var(--line-ghost)] p-4">
        <div className="flex flex-col gap-[var(--space-3)] xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-caption font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
              Mapa de risco eDNA
            </p>
            <h2 className="heading-font type-section-title mt-1 text-[var(--brand-navy-strong)]">
              Pontos monitorados e grau de risco estimado
            </h2>
          </div>
          <div className="flex flex-col gap-[var(--space-2)] sm:flex-row sm:items-center">
            <label className="flex min-w-56 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)]">
              <span className="text-caption uppercase tracking-[0.16em] text-slate-400">
                Campanha
              </span>
              <select
                aria-label="Filtrar campanha do mapa"
                className="min-w-0 flex-1 bg-transparent font-bold text-[var(--brand-navy-strong)] outline-none"
                value={campaignFilter}
                onChange={(event) => {
                  setCampaignFilter(event.target.value);
                  setClassificationFilter("Todas");
                  setRiskFilter("todos");
                  setSelectedPointId(undefined);
                }}
              >
                {campaigns.map((campaign) => (
                  <option key={campaign} value={campaign}>
                    {formatCampaignLabel(campaign)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-56 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)]">
              <span className="text-caption uppercase tracking-[0.16em] text-slate-400">
                Classificação
              </span>
              <select
                aria-label="Filtrar classificação de risco"
                className="min-w-0 flex-1 bg-transparent font-bold text-[var(--brand-navy-strong)] outline-none"
                value={classificationFilter}
                onChange={(event) => {
                  setClassificationFilter(event.target.value);
                  setRiskFilter("todos");
                  setSelectedPointId(undefined);
                }}
              >
                {classifications.map((classification) => (
                  <option key={classification} value={classification}>
                    {classification === "Todas" ? "Todas" : classification}
                  </option>
                ))}
              </select>
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Buscar ponto por SIA, município ou ETA"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs font-semibold text-[var(--brand-navy-strong)] placeholder:text-slate-400 sm:w-56"
                placeholder="Ir para ponto"
                value={pointSearch}
                onChange={(event) => setPointSearch(event.target.value)}
              />
              {searchMatches.length ? (
                <div className="absolute right-0 top-[calc(100%+0.35rem)] z-20 w-72 overflow-hidden radius-card border border-[var(--line-ghost)] bg-white shadow-[0_24px_56px_-36px_rgba(0,66,98,0.36)]">
                  {searchMatches.map((point) => (
                    <button
                      key={point.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition hover:bg-[var(--surface-soft)]"
                      onClick={() => {
                        setSelectedPointId(point.id);
                        setPointSearch("");
                      }}
                    >
                      <span>
                        <span className="block font-black text-[var(--brand-navy-strong)]">{point.code}</span>
                        <span className="block font-semibold text-slate-500">{point.municipality}</span>
                      </span>
                      <RiskBadge label={point.riskLabel} tone={point.riskLevel} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="relative grid items-stretch gap-[var(--layout-gutter)] overflow-visible lg:grid-cols-[minmax(0,1.86fr)_minmax(0,0.8fr)]">
        <div className={`relative overflow-hidden radius-panel border border-[var(--line-ghost)] bg-[linear-gradient(180deg,#eef5f8,#e6eef3)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)] ${mapHeightClass}`}>
          {filteredPoints.length ? (
            <CampaignHydroMap
              points={filteredPoints}
              selectedPointId={selectedPoint?.id}
              layers={riskLayers}
              markerMode="risk"
              showPointTooltip
              zoomOnSelect={false}
              clipBaseTilesToBasins
              caption="Base hidrográfica do Paraná · Pontos efetivos SIA · Resultados eDNA"
              onSelectPoint={(point) => setSelectedPointId(point.id)}
            />
          ) : (
            <EmptyMapState />
          )}
          <div className="absolute left-3 top-3 z-10">
            {isLegendCollapsed ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 radius-control border border-[var(--line-ghost)] bg-white/95 px-3 py-2 text-label font-black text-[var(--brand-navy-strong)] shadow-[0_16px_36px_-26px_rgba(0,66,98,0.42)] backdrop-blur"
                onClick={() => setIsLegendCollapsed(false)}
              >
                Mapa de risco eDNA
              </button>
            ) : (
              <RiskContributionLegend
                activeRisk={riskFilter}
                summary={campaignSummary}
                onClose={() => setIsLegendCollapsed(true)}
                onSelectRisk={(level) => {
                  setRiskFilter(level);
                  setSelectedPointId(undefined);
                }}
              />
            )}
          </div>
        </div>

        <aside className={`min-h-0 lg:absolute lg:right-0 lg:top-0 lg:z-10 lg:w-[30%] ${sidePanelHeightClass}`}>
          <div
            className="flex h-full min-h-0 flex-col overflow-hidden radius-panel border bg-white shadow-[0_34px_90px_-42px_rgba(0,66,98,0.46)]"
            style={{ borderColor: `${riskHexColor(selectedPoint?.riskLevel ?? "baixo")}33` }}
          >
            {selectedPoint ? (
              <div className="flex h-full min-h-0 flex-col overflow-y-auto">
                <div
                  className="h-1.5 flex-shrink-0"
                  style={{ backgroundColor: riskHexColor(selectedPoint.riskLevel) }}
                />
                <div className="flex flex-col gap-2.5 p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
                    <p className="text-caption font-bold uppercase tracking-[0.22em] text-slate-400">
                      Ponto em destaque
                    </p>
                    <p className="text-center text-caption font-bold uppercase tracking-[0.16em] text-slate-400">
                      Escore
                    </p>
                    <h3 className="heading-font min-w-0 text-xl font-black text-[var(--brand-navy-strong)]">
                      {selectedPoint.code}
                    </h3>
                    <span
                      className="heading-font justify-self-center text-lg font-black"
                      style={{ color: riskHexColor(selectedPoint.riskLevel) }}
                    >
                      {formatRiskScore(selectedPoint.score)}
                    </span>
                    <p className="min-w-0 text-xs font-semibold text-slate-500">
                      {selectedPoint.eta} · {selectedPoint.municipality}
                    </p>
                    <span className="justify-self-center">
                      <RiskBadge label={selectedPoint.riskLabel} tone={selectedPoint.riskLevel} />
                    </span>
                  </div>

                <RiskPointPhoto
                  point={selectedPoint}
                  onExpand={() => setExpandedPhotoPoint(selectedPoint)}
                />

                <div className="grid gap-2 text-xs">
                  <RiskRows
                    rows={[
                      {
                        label: "Ambiental",
                        value: selectedPoint.environmentalRisk,
                        tone: selectedPoint.environmentalRiskLevel,
                      },
                      {
                        label: "Operacional",
                        value: selectedPoint.operationalRisk,
                        tone: selectedPoint.operationalRiskLevel,
                      },
                      {
                        label: "Sanitário",
                        value: selectedPoint.sanitaryRisk,
                        tone: selectedPoint.sanitaryRiskLevel,
                      },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-[var(--line-ghost)] pt-2 text-caption font-semibold text-slate-500">
                  <span>Latitude {selectedPoint.effective?.lat.toFixed(5) ?? "Não informado"}</span>
                  <span>Longitude {selectedPoint.effective?.lon.toFixed(5) ?? "Não informado"}</span>
                </div>

                <MarkerMiniCharts
                  markers={selectedPoint.detectedMarkers}
                  referencePoints={campaignFilteredPoints}
                />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm font-medium text-slate-500">
                Nenhum ponto efetivo disponível para o filtro selecionado.
              </div>
            )}
          </div>
        </aside>
      </div>

      {expandedPhotoPoint ? (
        <RiskPhotoModal
          point={expandedPhotoPoint}
          onClose={() => setExpandedPhotoPoint(null)}
        />
      ) : null}
    </section>
  );
}

function buildRiskSummary(points: LaboratoryRiskPoint[]) {
  const totals = points.reduce(
    (accumulator, point) => ({
      ...accumulator,
      [point.riskLevel]: accumulator[point.riskLevel] + 1,
    }),
    { baixo: 0, baixoModerado: 0, moderado: 0, alto: 0 },
  );

  return {
    ...totals,
    total: points.length,
  };
}

function readStoredCampaignPoints(fallbackPoints: CampaignMapPoint[]) {
  const storedPoints = window.localStorage.getItem("yvae:campaign-map-points");

  if (!storedPoints) {
    return fallbackPoints;
  }

  try {
    const parsed = JSON.parse(storedPoints) as CampaignMapPoint[];

    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallbackPoints;
  } catch {
    window.localStorage.removeItem("yvae:campaign-map-points");
    return fallbackPoints;
  }
}

function RiskContributionLegend({
  activeRisk,
  summary,
  onClose,
  onSelectRisk,
}: {
  activeRisk: LaboratoryRiskLevel | "todos";
  summary: ReturnType<typeof buildRiskSummary>;
  onClose: () => void;
  onSelectRisk: (level: LaboratoryRiskLevel | "todos") => void;
}) {
  const segments: Array<{ level: LaboratoryRiskLevel; label: string; value: number }> = [
    { level: "baixo", label: "Baixo", value: summary.baixo },
    { level: "baixoModerado", label: "Baixo a moderado", value: summary.baixoModerado },
    { level: "moderado", label: "Moderado", value: summary.moderado },
    { level: "alto", label: "Alto", value: summary.alto },
  ];
  const total = Math.max(summary.total, 1);

  return (
    <div className="w-[min(22rem,calc(100vw-3.5rem))] radius-card border border-[var(--line-ghost)] bg-white/95 p-3 shadow-[0_16px_36px_-26px_rgba(0,66,98,0.42)] backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-label font-black text-[var(--brand-navy-strong)]">
            Mapa de risco eDNA
          </p>
          <p className="text-caption font-semibold text-slate-500">
            Classes integradas
          </p>
        </div>
        <button
          type="button"
          aria-label="Recolher legenda do mapa"
          className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
        {segments.map((segment) => {
          const percent = (segment.value / total) * 100;

          return (
            <button
              key={segment.level}
              type="button"
              aria-label={`Filtrar risco ${segment.label}: ${segment.value} pontos`}
              className={`h-full transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy-strong)] ${
                activeRisk !== "todos" && activeRisk !== segment.level ? "opacity-35" : "opacity-100"
              }`}
              style={{
                width: `${Math.max(percent, segment.value ? 7 : 0)}%`,
                backgroundColor: riskHexColor(segment.level),
              }}
              onClick={() => onSelectRisk(activeRisk === segment.level ? "todos" : segment.level)}
            />
          );
        })}
      </div>

      <div className="mt-3 grid gap-2">
        <button
          type="button"
          className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-bold transition ${
            activeRisk === "todos" ? "bg-[var(--surface-soft)] text-[var(--brand-navy-strong)]" : "text-slate-500 hover:bg-slate-50"
          }`}
          onClick={() => onSelectRisk("todos")}
        >
          <span>Todos os riscos</span>
        </button>
        {segments.map((segment) => {
          const percent = summary.total ? Math.round((segment.value / summary.total) * 100) : 0;

          return (
            <button
              key={segment.level}
              type="button"
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                activeRisk === segment.level ? "bg-[var(--surface-soft)] text-[var(--brand-navy-strong)]" : "text-slate-500 hover:bg-slate-50"
              }`}
              onClick={() => onSelectRisk(activeRisk === segment.level ? "todos" : segment.level)}
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: riskHexColor(segment.level) }}
                />
                {segment.label}
              </span>
              <span>{percent}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyMapState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,#eef5f8,#e6eef3)] p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[var(--brand-teal)] shadow">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="heading-font text-xl font-black text-[var(--brand-navy-strong)]">
          Nenhum ponto neste recorte
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Ajuste a campanha ou o nível de risco para reenquadrar o mapa com pontos disponíveis.
        </p>
      </div>
    </div>
  );
}

function RiskPointPhoto({
  point,
  onExpand,
}: {
  point: LaboratoryRiskPoint;
  onExpand: () => void;
}) {
  const preview = getPhotoPreview(point.photoUrl);
  const [photoState, setPhotoState] = useState<{
    previewKey?: string;
    candidateIndex: number;
    isLoaded: boolean;
    hasError: boolean;
  }>({ candidateIndex: 0, isLoaded: false, hasError: false });
  const previewKey = preview?.originalUrl;
  const activeState =
    photoState.previewKey === previewKey
      ? photoState
      : { candidateIndex: 0, isLoaded: false, hasError: false };
  const activeSrc = preview?.candidates[activeState.candidateIndex] ?? preview?.src;
  const isLoaded = activeState.isLoaded;
  const hasError = activeState.hasError;

  if (!preview || hasError) {
    return (
      <div className="relative flex aspect-[4/3] h-[clamp(176px,22vh,240px)] w-[clamp(235px,29.333vh,320px)] max-w-full flex-shrink-0 flex-col items-center justify-center gap-2 self-center overflow-hidden radius-card border border-slate-200 bg-[var(--surface-soft)] px-5 text-center text-slate-400">
        <ImageIcon className="h-9 w-9 text-slate-300" />
        <span className="text-xs font-bold text-slate-500">Foto representativa indisponível</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="relative aspect-[4/3] h-[clamp(176px,22vh,240px)] w-[clamp(235px,29.333vh,320px)] max-w-full flex-shrink-0 self-center overflow-hidden radius-card border border-slate-200 bg-slate-100 text-slate-400 transition hover:brightness-95 disabled:cursor-default disabled:hover:brightness-100"
      onClick={onExpand}
      onDoubleClick={onExpand}
      aria-label="Expandir foto representativa do ponto"
    >
      {!isLoaded ? (
        <div className="absolute inset-0 z-10 animate-pulse bg-[linear-gradient(110deg,#e2e8f0,#f8fafc,#e2e8f0)]" />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={`Foto representativa do ponto ${point.code}`}
        className="h-full w-full object-cover"
        onError={() => {
          setPhotoState((current) => {
            const candidateIndex =
              current.previewKey === previewKey ? current.candidateIndex : 0;
            const nextCandidateIndex = candidateIndex + 1;

            if (nextCandidateIndex < preview.candidates.length) {
              return {
                previewKey,
                candidateIndex: nextCandidateIndex,
                isLoaded: false,
                hasError: false,
              };
            }

            return {
              previewKey,
              candidateIndex,
              isLoaded: false,
              hasError: true,
            };
          });
        }}
        onLoad={() =>
          setPhotoState({
            previewKey,
            candidateIndex: activeState.candidateIndex,
            isLoaded: true,
            hasError: false,
          })
        }
        src={activeSrc}
      />
      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-caption font-bold uppercase tracking-[0.14em] text-white">
        ampliar
      </span>
    </button>
  );
}

export function RiskPhotoModal({
  point,
  onClose,
}: {
  point: Pick<CampaignHydroMapPoint, "code" | "municipality" | "photoUrl">;
  onClose: () => void;
}) {
  const preview = getPhotoPreview(point.photoUrl);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeButtonRef.current?.focus();

    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener("keydown", trapFocus);
    return () => {
      dialog.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previousFocus?.focus();
    };
  }, []);

  if (!preview) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="risk-photo-title"
      aria-modal="true"
      className="m-auto h-[82vh] w-[calc(100%_-_2rem)] max-w-5xl overflow-hidden radius-panel border border-white/20 bg-white p-0 shadow-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && event.detail === 1) onClose();
      }}
    >
      <div className="relative h-full w-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-caption font-bold uppercase tracking-[0.18em] text-slate-400">
              Foto representativa
            </p>
            <h3 id="risk-photo-title" className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">
              {point.code} · {point.municipality}
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar foto expandida"
            className="min-h-11 min-w-11 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] focus-visible:ring-offset-2"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="h-[calc(100%-76px)] bg-slate-100">
          {/* eslint-disable @next/next/no-img-element */}
          {candidateIndex < preview.candidates.length ? (
            <img
              alt={`Foto representativa do ponto ${point.code}`}
              className="h-full w-full object-contain"
              onError={() => setCandidateIndex((current) => current + 1)}
              src={preview.candidates[candidateIndex]}
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm font-bold text-slate-500">
              <ImageIcon className="h-6 w-6" />
              Foto representativa indisponível
            </div>
          )}
          {/* eslint-enable @next/next/no-img-element */}
        </div>
      </div>
    </dialog>
  );
}

function RiskRows({
  rows,
}: {
  rows: Array<{ label: string; value?: string; tone: LaboratoryRiskLevel }>;
}) {
  return (
    <div className="rounded-lg border border-[var(--line-ghost)] bg-white p-2">
      <p className="mb-2 px-1 text-caption font-bold uppercase tracking-[0.16em] text-slate-400">
        Elementos de risco
      </p>
      <div className="grid gap-2">
        {rows.map((row) => (
          <article
            key={row.label}
            className="overflow-hidden rounded-md border border-slate-100 bg-[var(--surface-soft)]"
          >
            <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 px-3 py-2">
              <span className="text-xs font-black leading-normal text-slate-600">
                {row.label}
              </span>
              <span className="justify-self-start">
                <RiskBadge label={row.value || "Não informado"} tone={row.tone} />
              </span>
            </div>
            <div className="h-px w-full opacity-55" style={{ backgroundColor: riskHexColor(row.tone) }} />
          </article>
        ))}
      </div>
    </div>
  );
}

function MarkerMiniCharts({
  markers,
  referencePoints,
}: {
  markers: string[];
  referencePoints: LaboratoryRiskPoint[];
}) {
  const items = parseMarkerChartItems(markers);
  const maxValueByLabel = buildMarkerMaxValueByLabel(referencePoints);

  return (
    <div className="rounded-lg border border-[var(--line-ghost)] bg-white p-2">
      <p className="mb-2 px-1 text-caption font-bold uppercase tracking-[0.16em] text-slate-400">
        Marcadores observados
      </p>
      <div className="grid gap-2">
        {items.map((item) => {
          const categoryMax = Math.max(maxValueByLabel.get(item.label) ?? 0, 1);
          const width = item.value ? Math.max((item.value / categoryMax) * 100, 8) : 0;

          return (
            <article key={item.label} className="rounded-md bg-[var(--surface-soft)] px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-xs font-black text-slate-600">{item.label}</span>
                <span className="text-caption font-black text-[var(--brand-navy-strong)]">
                  {item.displayValue}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-[var(--brand-teal)]"
                  style={{ width: `${width}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RiskBadge({ label, tone }: { label: string; tone: LaboratoryRiskLevel }) {
  const color = riskHexColor(tone);

  return (
    <span
      className="whitespace-nowrap rounded-full border px-3 py-1 text-caption font-black"
      style={{
        backgroundColor: color,
        borderColor: color,
        color: getRiskTextColor(tone),
      }}
    >
      {label}
    </span>
  );
}

function formatCampaignLabel(campaign: string) {
  if (campaign === "Todas") {
    return "Todas elegíveis";
  }

  return campaign.replace(" - ", " – ");
}

function formatRiskScore(score: number | null) {
  return score === null ? "Não informado" : score.toFixed(3).replace(".", ",");
}

function parseMarkerChartItems(markers: string[]) {
  return markers.map((marker) => {
    const [rawLabel, rawValue] = marker.split(":");
    const parsedValue = rawValue
      ? Number(rawValue.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."))
      : null;
    const value = Number.isFinite(parsedValue) ? parsedValue : null;

    return {
      label: formatMarkerLabel(rawLabel.trim() || marker),
      value,
      displayValue: value !== null
        ? new Intl.NumberFormat("pt-BR").format(value)
        : "sem leitura",
    };
  });
}

function buildMarkerMaxValueByLabel(points: LaboratoryRiskPoint[]) {
  const maxValueByLabel = new Map<string, number>();

  for (const point of points) {
    for (const item of parseMarkerChartItems(point.detectedMarkers)) {
      if (item.value === null) {
        continue;
      }

      maxValueByLabel.set(
        item.label,
        Math.max(maxValueByLabel.get(item.label) ?? 0, item.value),
      );
    }
  }

  return maxValueByLabel;
}

function formatMarkerLabel(label: string) {
  const normalized = label.toLowerCase().replace(".", "").trim();

  if (normalized === "ciano") {
    return "Cianobactérias";
  }

  if (normalized === "bact") {
    return "Bactérias";
  }

  if (normalized === "coi") {
    return "COI";
  }

  return label;
}

function riskHexColor(level: LaboratoryRiskLevel) {
  return laboratoryRiskColor(level);
}

function getRiskTextColor(level: LaboratoryRiskLevel) {
  return laboratoryRiskTextColor(level);
}
