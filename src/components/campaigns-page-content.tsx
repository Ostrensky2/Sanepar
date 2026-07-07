"use client";

import {
  Activity,
  CalendarDays,
  Download,
  FileSpreadsheet,
  FlaskConical,
  MapPinned,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Workbook, Worksheet } from "exceljs";
import { CampaignMapSection } from "@/components/campaign-map-section";
import { CampaignResultsPanels } from "@/components/campaign-results-panels";
import { FieldDiaryPageContent } from "@/components/field-diary-page-content";
import {
  type CampaignHydroMapPoint,
} from "@/components/campaign-hydro-map";
import {
  FIELD_DIARY_UPDATED_EVENT,
  readFieldDiaryEntries,
  readFieldDiaryEntriesFromStorage,
  type FieldDiaryEntry,
} from "@/lib/field-diary";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import {
  campaignPointMatchesSelectedCampaign,
  normalizeCampaignKey,
} from "@/lib/campaign-points";
import {
  buildDefaultCampaignManagement,
  buildInitialCampaignManagement,
  CAMPAIGN_MANAGEMENT_STORAGE_KEY,
  defaultCampaigns,
  readCampaignManagement,
  type CampaignOperationalStatus,
  type CampaignManagementById,
  type CampaignView,
} from "@/lib/campaign-management";
import { DashboardSkeleton, ErrorBoundary } from "@/components/operational-feedback";

const SELECTED_CAMPAIGN_STORAGE_KEY = "yvae:selected-campaign-id";
const CAMPAIGN_MANAGEMENT_UPDATED_EVENT = "yvae:campaign-management-updated";

export function CampaignsPageContent({
  campaignPoints,
  campaigns = defaultCampaigns,
  view = "campo",
  eyebrow = "Campanha selecionada",
  selectorLabel = "Campanha exibida",
  emptyMapTitle = "Mapa aguardando dados de campo",
  emptyMapDescription = "Registre pontos com coordenadas no Diário de Campo para que eles apareçam no mapa desta campanha.",
}: {
  campaignPoints: CampaignHydroMapPoint[];
  campaigns?: CampaignView[];
  view?: "campo" | "resultados";
  eyebrow?: string;
  selectorLabel?: string;
  emptyMapTitle?: string;
  emptyMapDescription?: string;
}) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => {
    const defaultCampaignId = campaigns[0].id;

    if (typeof window === "undefined") {
      return defaultCampaignId;
    }

    const stored = window.localStorage.getItem(SELECTED_CAMPAIGN_STORAGE_KEY);
    const storedCampaign = campaigns.find((campaign) => campaign.id === stored);

    return storedCampaign ? storedCampaign.id : defaultCampaignId;
  });
  const [diaryEntries, setDiaryEntries] = useState<FieldDiaryEntry[]>(() =>
    readFieldDiaryEntriesFromStorage(),
  );
  const [localCampaignPoints, setLocalCampaignPoints] = useState<CampaignHydroMapPoint[] | null>(null);
  const [localRiskPoints, setLocalRiskPoints] = useState<CampaignHydroMapPoint[] | null>(null);
  const [campaignManagement, setCampaignManagement] = useState<CampaignManagementById>(() =>
    buildInitialCampaignManagement(campaigns),
  );
  const [hasLoadedCampaignManagement, setHasLoadedCampaignManagement] = useState(false);
  const [hasLoadedDiaryEntries, setHasLoadedDiaryEntries] = useState(false);
  const [hasLoadedLocalResults, setHasLoadedLocalResults] = useState(view !== "resultados");
  const [selectedExportCampaignIds, setSelectedExportCampaignIds] = useState<string[]>(["all"]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [dismissedUnavailableResultsNoticeCampaignId, setDismissedUnavailableResultsNoticeCampaignId] =
    useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SELECTED_CAMPAIGN_STORAGE_KEY, selectedCampaignId);
  }, [campaigns, selectedCampaignId, view]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!canUseBrowserOnlyPersistence()) {
      setLocalCampaignPoints(null);
      return;
    }

    function syncLocalCampaignPoints() {
      const storedPoints = window.localStorage.getItem("yvae:campaign-map-points");

      if (!storedPoints) {
        setLocalCampaignPoints(null);
        return;
      }

      try {
        const parsed = JSON.parse(storedPoints) as CampaignHydroMapPoint[];

        setLocalCampaignPoints(Array.isArray(parsed) && parsed.length > 0 ? parsed : null);
      } catch {
        window.localStorage.removeItem("yvae:campaign-map-points");
        setLocalCampaignPoints(null);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key && event.key !== "yvae:campaign-map-points") return;
      syncLocalCampaignPoints();
    }

    syncLocalCampaignPoints();
    window.addEventListener("storage", handleStorage);

    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (view !== "resultados") {
      setHasLoadedLocalResults(true);
      return;
    }

    if (!canUseBrowserOnlyPersistence()) {
      setHasLoadedLocalResults(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      const storedResults = window.localStorage.getItem("yvae:lab-risk-results");

      if (!storedResults) {
        setHasLoadedLocalResults(true);
        return;
      }

      try {
        const parsed = JSON.parse(storedResults) as CampaignHydroMapPoint[];

        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((point) => point?.riskLevel)
        ) {
          setLocalRiskPoints(parsed);
        }
      } catch {
        window.localStorage.removeItem("yvae:lab-risk-results");
      } finally {
        setHasLoadedLocalResults(true);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function syncCampaignManagement() {
      void readCampaignManagement(campaigns).then((management) => {
        setCampaignManagement(management);
        setHasLoadedCampaignManagement(true);
      });
    }

    function handleStorage(event: StorageEvent) {
      if (event.key && event.key !== CAMPAIGN_MANAGEMENT_STORAGE_KEY) return;
      syncCampaignManagement();
    }

    window.addEventListener(CAMPAIGN_MANAGEMENT_UPDATED_EVENT, syncCampaignManagement);
    window.addEventListener("storage", handleStorage);
    syncCampaignManagement();

    return () => {
      window.removeEventListener(CAMPAIGN_MANAGEMENT_UPDATED_EVENT, syncCampaignManagement);
      window.removeEventListener("storage", handleStorage);
    };
  }, [campaigns]);

  useEffect(() => {
    let isMounted = true;
    const useLocalDiaryCache = canUseBrowserOnlyPersistence();

    async function loadDiaryEntries() {
      const entries = await readFieldDiaryEntries();

      if (isMounted) {
        setDiaryEntries(entries);
        setHasLoadedDiaryEntries(true);
      }
    }

    void loadDiaryEntries();

    function handleUpdate() {
      if (!useLocalDiaryCache) {
        return;
      }

      setDiaryEntries(readFieldDiaryEntriesFromStorage());
      setHasLoadedDiaryEntries(true);
    }
    window.addEventListener(FIELD_DIARY_UPDATED_EVENT, handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener(FIELD_DIARY_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  const selectedCampaign = useMemo(() => {
    const candidate = campaigns.find((campaign) => campaign.id === selectedCampaignId);

    return candidate ?? campaigns[0];
  }, [campaigns, selectedCampaignId]);
  const resultsUnavailable = view === "resultados" && !selectedCampaign.hasResultData;
  const showUnavailableResultsNotice =
    resultsUnavailable && dismissedUnavailableResultsNoticeCampaignId !== selectedCampaign.id;

  const selectedManagement =
    campaignManagement[selectedCampaign.id] ?? buildDefaultCampaignManagement(selectedCampaign);
  const selectedStages = selectedManagement.stages.length
    ? selectedManagement.stages
    : buildDefaultCampaignManagement(selectedCampaign).stages;
  const campaignClosed = isFieldCampaignClosed(selectedManagement.status);

  const sourceCampaignPoints =
    view === "resultados" && localRiskPoints?.length
      ? localRiskPoints
      : localCampaignPoints?.length
        ? localCampaignPoints
        : campaignPoints;

  const selectedDiaryEntries = useMemo(
    () =>
      diaryEntries.filter(
        (e) =>
          diaryEntryMatchesSelectedCampaign(e, selectedCampaign.id, selectedCampaign.title),
      ),
    [diaryEntries, selectedCampaign.id, selectedCampaign.title],
  );
  const validDiaryEntries = useMemo(
    () => dedupeFieldDiaryMapEntries(selectedDiaryEntries.filter(hasValidFieldDiaryMapEntry)),
    [selectedDiaryEntries],
  );
  const exportableCampaignIds = useMemo(
    () =>
      new Set(
        campaigns
          .filter((campaign) =>
            diaryEntries.some((entry) =>
              diaryEntryMatchesSelectedCampaign(entry, campaign.id, campaign.title),
            ),
          )
          .map((campaign) => campaign.id),
      ),
    [campaigns, diaryEntries],
  );

  const selectedCampaignPoints = useMemo(
    () =>
      sourceCampaignPoints.filter((point) =>
        campaignPointMatchesSelectedCampaign(point, selectedCampaign.id, selectedCampaign.title),
      ),
    [selectedCampaign.id, selectedCampaign.title, sourceCampaignPoints],
  );

  const diaryMapPoints = useMemo(
    () =>
      validDiaryEntries
        .map((entry) => diaryEntryToMapPoint(entry, selectedCampaignPoints))
        .filter((p): p is CampaignHydroMapPoint => p !== null),
    [selectedCampaignPoints, validDiaryEntries],
  );
  const importedFieldMapPoints = useMemo(
    () => selectedCampaignPoints.filter(hasImportedFieldMapPoint),
    [selectedCampaignPoints],
  );
  // Campanha 1 não teve entrada via Diário de Campo: o mapa dela usa somente a
  // planilha importada. Da Campanha 2 em diante a fonte é o Diário de Campo.
  const campaignFieldMapPoints = useMemo(
    () =>
      campaignClosed
        ? mergeFieldMapPoints(importedFieldMapPoints, [])
        : diaryMapPoints,
    [campaignClosed, diaryMapPoints, importedFieldMapPoints],
  );

  const visiblePoints = useMemo(() => {
    if (view === "campo") {
      return campaignFieldMapPoints;
    }

    return selectedCampaignPoints;
  }, [campaignFieldMapPoints, selectedCampaignPoints, view]);
  const visibleResultPoints = useMemo(
    () =>
      sourceCampaignPoints
        .filter((point) => point.effective && point.riskLevel)
        .sort((left, right) => riskPriority(right.riskLevel) - riskPriority(left.riskLevel)),
    [sourceCampaignPoints],
  );

  const fieldRowCount = selectedDiaryEntries.length;
  const effectivePointCount = campaignFieldMapPoints.filter((point) => point.effective).length;
  const mapEmptyTitle = emptyMapTitle;
  const mapEmptyDescription = emptyMapDescription;
  const isCampaignHydrating =
    !hasLoadedCampaignManagement ||
    !hasLoadedDiaryEntries ||
    (view === "resultados" && !hasLoadedLocalResults);

  async function exportFieldDiaryWorkbook() {
    setExportMessage("");

    const exportEntries = getExportDiaryEntries(
      diaryEntries,
      campaigns,
      selectedExportCampaignIds,
    );
    const exportCampaignLabel = formatExportCampaignSelection(campaigns, selectedExportCampaignIds);

    if (!exportEntries.length) {
      return;
    }

    setIsExporting(true);

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Yva'e Monitoramento";
      workbook.created = new Date();
      workbook.modified = new Date();

      const sortedEntries = [...exportEntries].sort(
        (a, b) =>
          a.campaignName.localeCompare(b.campaignName, "pt-BR", { numeric: true }) ||
          a.entryDate.localeCompare(b.entryDate) ||
          a.campaignDay - b.campaignDay ||
          String(a.collectionTime ?? "").localeCompare(String(b.collectionTime ?? "")) ||
          a.locationName.localeCompare(b.locationName, "pt-BR"),
      );

      addFieldDiarySummarySheet(workbook, sortedEntries, exportCampaignLabel);
      addFieldDiaryEntriesSheet(workbook, sortedEntries);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${slugifyFileName(exportCampaignLabel)}-diario-de-campo.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportMessage(`Planilha exportada com ${sortedEntries.length} registros.`);
    } catch {
      setExportMessage("Não foi possível exportar a planilha agora.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header: title + campaign selector */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-caption font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            {eyebrow}
          </p>
          <h2 className="heading-font text-2xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            {selectedCampaign.title}
          </h2>
        </div>

        <div className="grid gap-3 lg:min-w-[30rem]">
          <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            {selectorLabel}
            <select
              className="rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              value={selectedCampaign.id}
              onChange={(event) => setSelectedCampaignId(event.target.value)}
            >
              {campaigns.map((campaign) => {
                const management = campaignManagement[campaign.id];
                const status = management?.status ?? campaign.status;
                const statusMark =
                  status === "Concluída" || status === "Resultados publicados" ? "✓ " :
                  status === "Em preparação" || status === "Em campo" || status === "Em análise" ? "⏳ " : "· ";
                return (
                  <option key={campaign.id} value={campaign.id}>
                    {statusMark}{campaign.selectorLabel}
                  </option>
                );
              })}
            </select>
          </label>

          {view === "campo" ? (
            <div className="rounded-lg border border-[var(--line-ghost)] bg-white/88 px-2.5 py-2 shadow-[0_10px_28px_-26px_rgba(0,66,98,0.3)]">
              <div className="grid gap-1.5">
                <div>
                  <p className="text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-slate-500">
                    Exportar dados por campanha
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <ExportCampaignToggle
                      label="Todas"
                      selected={selectedExportCampaignIds.includes("all")}
                      onClick={() => setSelectedExportCampaignIds(["all"])}
                      disabled={exportableCampaignIds.size === 0}
                    />
                    {campaigns.map((campaign, index) => {
                      const hasData = exportableCampaignIds.has(campaign.id);

                      return (
                        <ExportCampaignToggle
                          key={campaign.id}
                          label={String(index + 1)}
                          selected={selectedExportCampaignIds.includes(campaign.id)}
                          disabled={!hasData}
                          onClick={() =>
                            setSelectedExportCampaignIds((current) => {
                              setExportMessage("");
                              return toggleExportCampaign(current, campaign.id);
                            })
                          }
                        />
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => void exportFieldDiaryWorkbook()}
                      aria-label={isExporting ? "Exportando Excel" : "Exportar Excel"}
                      title={isExporting ? "Exportando Excel" : "Exportar Excel"}
                      disabled={
                        isExporting ||
                        isCampaignHydrating ||
                        !selectedExportCampaignIds.length ||
                        exportableCampaignIds.size === 0
                      }
                      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[var(--line-strong)] bg-white px-2 text-xs font-black text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
              {exportMessage ? (
                <p className="mt-1.5 text-[11px] font-semibold leading-tight text-[var(--ink-soft)]">{exportMessage}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Metrics cards */}
      <ErrorBoundary title="Falha nos indicadores da campanha">
        {isCampaignHydrating ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
                <div className="h-3 w-28 rounded bg-slate-200" />
                <div className="mt-4 h-7 w-20 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-32 rounded bg-slate-100" />
              </div>
            ))}
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <CampaignMetricCard
              icon={CalendarDays}
              label="Status da campanha"
              value={selectedManagement.status}
              detail={selectedManagement.period}
              tone="primary"
            />
            <CampaignMetricCard
              icon={MapPinned}
              label={view === "resultados" ? "Pontos com resultado" : "Pontos de campo"}
              value={`${effectivePointCount}/${selectedManagement.plannedPoints}`}
              detail={
                view === "resultados"
                  ? "Com resultado eDNA / previstos"
                  : "Coletados em campo / previstos"
              }
              tone="success"
            />
            <CampaignMetricCard
              icon={FileSpreadsheet}
              label="Planilha de campo"
              value={String(fieldRowCount)}
              detail="Registros importados"
              tone={fieldRowCount > 0 || selectedCampaign.hasFieldData ? "success" : "neutral"}
            />
            <CampaignMetricCard
              icon={FlaskConical}
              label="Planilha de resultados"
              value={selectedCampaign.metrics.resultRows}
              detail="Resultados importados"
              tone={selectedCampaign.hasResultData ? "success" : "warning"}
            />
          </section>
        )}
      </ErrorBoundary>

      {/* Campo view */}
      {view === "campo" && (
        <CampaignResultsPanels>
          <ErrorBoundary title="Falha no mapa da campanha">
            {isCampaignHydrating ? (
              <DashboardSkeleton rows={3} />
            ) : (
              <section>
                {visiblePoints.length > 0 ? (
                  <CampaignMapSection
                    points={visiblePoints}
                    useLocalImportCache={false}
                    selectedCampaignId={selectedCampaignId}
                    selectedCampaignTitle={selectedCampaign.title}
                  />
                ) : (
                  <EmptyCampaignPanel
                    title={mapEmptyTitle}
                    description={mapEmptyDescription}
                  />
                )}
              </section>
            )}
          </ErrorBoundary>

          <ErrorBoundary title="Falha na síntese de coletas">
            {isCampaignHydrating ? (
              <DashboardSkeleton rows={4} />
            ) : (
              <FieldDiaryPageContent
                key={selectedCampaign.id}
                campaignScope={{
                  id: selectedCampaign.id,
                  name: selectedCampaign.title,
                }}
                readOnly
                hideHeader
              />
            )}
          </ErrorBoundary>
        </CampaignResultsPanels>
      )}

      {/* Resultados view */}
      {view === "resultados" && (
        <div className="space-y-6">
          <CampaignResultsPanels
            isHydrating={isCampaignHydrating}
            resultsUnavailable={resultsUnavailable}
            showUnavailableNotice={showUnavailableResultsNotice}
            campaign={selectedCampaign}
            stages={selectedStages}
            stageTitle={selectedManagement.stageTitle}
            points={visibleResultPoints}
            onDismissUnavailableNotice={() => setDismissedUnavailableResultsNoticeCampaignId(selectedCampaign.id)}
          />
        </div>
      )}
    </div>
  );
}

function riskPriority(level: CampaignHydroMapPoint["riskLevel"]) {
  if (level === "alto") {
    return 4;
  }

  if (level === "moderado") {
    return 3;
  }

  if (level === "baixoModerado") {
    return 2;
  }

  return level === "baixo" ? 1 : 0;
}

function isFieldCampaignClosed(status: CampaignOperationalStatus) {
  return [
    "Coleta concluída",
    "Aguardando laboratório",
    "Em análise",
    "Resultados publicados",
    "Concluída",
  ].includes(status);
}

function diaryEntryMatchesSelectedCampaign(
  entry: FieldDiaryEntry,
  selectedCampaignId: string,
  selectedCampaignTitle: string,
) {
  if (entry.campaignId === selectedCampaignId) {
    return true;
  }

  const campaignNumber = selectedCampaignId.match(/campanha-(\d+)/)?.[1];
  const entryKey = normalizeCampaignKey(entry.campaignName);
  const titleKey = normalizeCampaignKey(selectedCampaignTitle);

  return entryKey === titleKey || Boolean(campaignNumber && entryKey === campaignNumber);
}

function hasImportedFieldMapPoint(point: CampaignHydroMapPoint) {
  return Boolean(point.effective);
}

function hasValidFieldDiaryMapEntry(entry: FieldDiaryEntry) {
  const hasOperationalFieldData = Boolean(
    entry.activities.length ||
      entry.waterVisualConditions.length ||
      String(entry.dailySummary ?? "").trim() ||
      String(entry.followUpNotes ?? "").trim() ||
      entry.hasOccurrence,
  );

  return Boolean(
    hasOperationalFieldData,
  );
}

function mergeFieldMapPoints(
  importedFieldPoints: CampaignHydroMapPoint[],
  diaryPoints: CampaignHydroMapPoint[],
) {
  const byKey = new Map<string, CampaignHydroMapPoint>();

  for (const point of importedFieldPoints) {
    byKey.set(fieldMapPointMergeKey(point), point);
  }

  for (const point of diaryPoints) {
    const key = fieldMapPointMergeKey(point);
    const existing = byKey.get(key);

    byKey.set(key, existing ? mergeDiaryMapPointWithImportedFieldPoint(point, existing) : point);
  }

  return [...byKey.values()].sort(
    (a, b) =>
      normalizeMapPointDateKey(a.date).localeCompare(normalizeMapPointDateKey(b.date)) ||
      dayNumber(a.day) - dayNumber(b.day) ||
      collectionSequence(a) - collectionSequence(b) ||
      String(a.code || a.point).localeCompare(String(b.code || b.point), "pt-BR", { numeric: true }),
  );
}

function mergeDiaryMapPointWithImportedFieldPoint(
  diaryPoint: CampaignHydroMapPoint,
  importedPoint: CampaignHydroMapPoint,
): CampaignHydroMapPoint {
  return {
    ...importedPoint,
    ...diaryPoint,
    // A planilha importada é a fonte autoritativa de sequência/identidade do
    // roteiro; o diário só complementa observações de campo.
    point: importedPoint.point || diaryPoint.point,
    day: importedPoint.day ?? diaryPoint.day,
    date: importedPoint.date ?? diaryPoint.date,
    campaign: importedPoint.campaign || diaryPoint.campaign,
    original: diaryPoint.original ?? importedPoint.original,
    effective: diaryPoint.effective ?? importedPoint.effective,
    waterBody: diaryPoint.waterBody || importedPoint.waterBody,
    municipality: diaryPoint.municipality || importedPoint.municipality,
    accessibility: diaryPoint.accessibility || importedPoint.accessibility,
    waterAspect: diaryPoint.waterAspect || importedPoint.waterAspect,
    weatherConditions: diaryPoint.weatherConditions || importedPoint.weatherConditions,
    problems: diaryPoint.problems || importedPoint.problems,
    driveUrl: diaryPoint.driveUrl || importedPoint.driveUrl,
    dropboxUrl: diaryPoint.dropboxUrl || importedPoint.dropboxUrl,
    photoUrl: diaryPoint.photoUrl || importedPoint.photoUrl,
    photos: pointPhotos(diaryPoint).length ? pointPhotos(diaryPoint) : pointPhotos(importedPoint),
  };
}

function fieldMapPointMergeKey(point: CampaignHydroMapPoint) {
  const pointKey = normalizeMapPointKey(point.code) || normalizeMapPointKey(point.point);

  return [
    normalizeCampaignKey(point.campaign),
    normalizeMapPointDateKey(point.date),
    dayNumber(point.day),
    pointKey,
  ].join("|");
}

function dayNumber(value: unknown) {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function normalizeMapPointDateKey(value: unknown) {
  const text = String(value ?? "").trim();
  const brazilianDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (brazilianDate) {
    return `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`;
  }

  return text.slice(0, 10);
}

function collectionSequence(point: CampaignHydroMapPoint) {
  const value = String(point.point ?? "").trim();
  return /^\d+$/.test(value) ? Number(value) : Number.MAX_SAFE_INTEGER;
}

function dedupeFieldDiaryMapEntries(entries: FieldDiaryEntry[]) {
  const byKey = new Map<string, FieldDiaryEntry>();

  for (const entry of entries) {
    const key = [
      entry.entryDate,
      entry.campaignDay,
      normalizeMapPointKey(entry.sia) || normalizeMapPointKey(entry.locationName),
    ].join("|");
    const current = byKey.get(key);

    if (!current || fieldDiaryMapEntryScore(entry) > fieldDiaryMapEntryScore(current)) {
      byKey.set(key, entry);
    }
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.entryDate.localeCompare(b.entryDate) ||
      a.campaignDay - b.campaignDay ||
      diaryCollectionTimeRank(a).localeCompare(diaryCollectionTimeRank(b)) ||
      a.locationName.localeCompare(b.locationName, "pt-BR"),
  );
}

function diaryCollectionTimeRank(entry: FieldDiaryEntry) {
  const time = String(entry.collectionTime ?? "").trim();

  // Entradas sem horário vão para o fim do dia, mantendo o desempate por nome.
  return /^\d{1,2}:\d{2}/.test(time) ? time.padStart(5, "0") : "99:99";
}

function fieldDiaryMapEntryScore(entry: FieldDiaryEntry) {
  return [
    entry.locationName,
    entry.sia,
    entry.latitude,
    entry.longitude,
    entry.municipality,
    entry.dailySummary,
    entry.followUpNotes,
  ].filter((value) => String(value ?? "").trim()).length +
    entry.activities.length +
    entry.waterVisualConditions.length +
    (entry.hasOccurrence ? 1 : 0);
}

function mapPointMatchKeys(point: CampaignHydroMapPoint) {
  const values = [
    point.code,
    point.point,
    point.waterBody,
  ];
  const textKeys = values
    .map(normalizeMapPointKey)
    .filter(Boolean);
  const numericKeys = values
    .map(pointNumberKey)
    .filter(Boolean);

  return [...new Set([...textKeys, ...numericKeys])];
}

function normalizeMapPointKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bsia\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pointNumberKey(value: unknown) {
  const match = String(value ?? "").match(/\d+/);

  if (!match) {
    return "";
  }

  return `numero:${Number(match[0])}`;
}

function diaryEntryToMapPoint(
  entry: FieldDiaryEntry,
  knownPoints: CampaignHydroMapPoint[],
): CampaignHydroMapPoint | null {
  const lat = parseFloat(entry.latitude ?? "");
  const lon = parseFloat(entry.longitude ?? "");
  const effective = isFinite(lat) && isFinite(lon) ? { lat, lon } : null;
  const referencePoint = findKnownPointForDiaryEntry(entry, knownPoints);
  const original = referencePoint?.original ?? referencePoint?.effective ?? null;

  if (!original && !effective) return null;

  const code = formatDiarySiaCode(entry.sia) || referencePoint?.code || entry.locationName;
  const photos = entry.photos ?? [];
  const firstPhotoUrl = photos[0]?.url || referencePoint?.photoUrl || "";

  return {
    id: `diary-${entry.id}`,
    code,
    point: entry.locationName,
    day: String(entry.campaignDay),
    campaign: entry.campaignName,
    date: entry.entryDate,
    waterBody: referencePoint?.waterBody || entry.locationName,
    municipality: entry.municipality || referencePoint?.municipality || "Paraná",
    original,
    effective,
    accessibility: referencePoint?.accessibility || "",
    waterAspect: entry.waterVisualConditions.join(", "),
    weatherConditions: "",
    problems: entry.hasOccurrence ? (entry.occurrenceDescription ?? "") : "",
    driveUrl: referencePoint?.driveUrl || "",
    dropboxUrl: referencePoint?.dropboxUrl || "",
    photoUrl: firstPhotoUrl,
    photos,
  };
}

function pointPhotos(point?: CampaignHydroMapPoint | null) {
  return point?.photos?.filter((photo) => photo.url) ?? [];
}

function findKnownPointForDiaryEntry(
  entry: FieldDiaryEntry,
  knownPoints: CampaignHydroMapPoint[],
) {
  const entryKeys = new Set(mapDiaryEntryMatchKeys(entry));

  if (entryKeys.size === 0) {
    return null;
  }

  return (
    knownPoints.find(
      (point) =>
        (point.original || point.effective) &&
        mapPointMatchKeys(point).some((key) => entryKeys.has(key)),
    ) ?? null
  );
}

function mapDiaryEntryMatchKeys(entry: FieldDiaryEntry) {
  const values = [entry.sia, entry.locationName];
  const textKeys = values
    .map(normalizeMapPointKey)
    .filter(Boolean);
  const numericKeys = values
    .map(pointNumberKey)
    .filter(Boolean);

  return [...new Set([...textKeys, ...numericKeys])];
}

function formatDiarySiaCode(value: unknown) {
  const match = String(value ?? "").match(/\d+/);

  if (!match) {
    return "";
  }

  return `SIA-${match[0].padStart(4, "0")}`;
}

function CampaignMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "success" | "warning" | "neutral";
}) {
  const toneClass = {
    primary: "border-[var(--brand-blue)] text-[var(--brand-navy-strong)]",
    success: "border-[var(--brand-green)] text-[var(--brand-navy-strong)]",
    warning: "border-[var(--brand-amber)] text-[var(--brand-amber)]",
    neutral: "border-slate-300 text-slate-500",
  }[tone];

  return (
    <article className={`glass-panel radius-panel border-b-2 p-4 ${toneClass}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-caption font-bold uppercase tracking-[0.22em] text-slate-500">
          {label}
        </p>
        <Icon className="h-4 w-4" />
      </div>
      <p className="heading-font text-2xl font-black text-[var(--brand-navy-strong)]">
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold text-[var(--brand-teal)]">{detail}</p>
    </article>
  );
}

function ExportCampaignToggle({
  label,
  selected,
  disabled = false,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        "h-7 rounded-md border px-2 text-xs font-black transition disabled:cursor-not-allowed",
        "min-w-7",
        disabled
          ? "border-slate-200 bg-slate-50 text-slate-300"
          : "",
        selected && !disabled
          ? "border-[var(--brand-navy-strong)] bg-[var(--brand-navy-strong)] text-white"
          : disabled
            ? ""
            : "border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]",
      ].join(" ")}
    >
      {label}
    </button>
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

function toggleExportCampaign(current: string[], campaignId: string) {
  const withoutAll = current.filter((id) => id !== "all");

  if (withoutAll.includes(campaignId)) {
    const next = withoutAll.filter((id) => id !== campaignId);
    return next.length ? next : ["all"];
  }

  return [...withoutAll, campaignId];
}

function getExportDiaryEntries(
  entries: FieldDiaryEntry[],
  campaigns: CampaignView[],
  selectedCampaignIds: string[],
) {
  if (selectedCampaignIds.includes("all")) {
    return entries;
  }

  const selectedCampaigns = campaigns.filter((campaign) => selectedCampaignIds.includes(campaign.id));

  return entries.filter((entry) =>
    selectedCampaigns.some((campaign) =>
      diaryEntryMatchesSelectedCampaign(entry, campaign.id, campaign.title),
    ),
  );
}

function formatExportCampaignSelection(campaigns: CampaignView[], selectedCampaignIds: string[]) {
  if (selectedCampaignIds.includes("all")) {
    return "Todas as campanhas";
  }

  const labels = campaigns
    .map((campaign, index) => ({
      id: campaign.id,
      label: `Campanha ${index + 1}`,
    }))
    .filter((campaign) => selectedCampaignIds.includes(campaign.id))
    .map((campaign) => campaign.label);

  return labels.length ? labels.join(" + ") : "Campanhas selecionadas";
}

function addFieldDiarySummarySheet(
  workbook: Workbook,
  entries: FieldDiaryEntry[],
  campaignTitle: string,
) {
  const sheet = workbook.addWorksheet("Resumo agregado", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Campanha", key: "campaign", width: 34 },
    { header: "Dia da campanha", key: "campaignDay", width: 16 },
    { header: "Data", key: "entryDate", width: 14 },
    { header: "Registros", key: "entries", width: 12 },
    { header: "Pontos/SIA distintos", key: "points", width: 18 },
    { header: "Municípios distintos", key: "municipalities", width: 20 },
    { header: "Com coordenadas", key: "coordinates", width: 16 },
    { header: "Com ocorrência", key: "occurrences", width: 16 },
    { header: "Com follow-up", key: "followUps", width: 16 },
    { header: "Atividades", key: "activities", width: 36 },
    { header: "Condições visuais da água", key: "waterConditions", width: 40 },
  ];

  const grouped = new Map<string, FieldDiaryEntry[]>();

  for (const entry of entries) {
    const key = [entry.campaignName || campaignTitle, entry.campaignDay, entry.entryDate].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  for (const groupEntries of [...grouped.values()].sort(compareFieldDiaryGroups)) {
    sheet.addRow({
      campaign: groupEntries[0]?.campaignName || campaignTitle,
      campaignDay: groupEntries[0]?.campaignDay ?? "",
      entryDate: formatExportDate(groupEntries[0]?.entryDate),
      entries: groupEntries.length,
      points: uniqueExportValues(groupEntries.map((entry) => entry.sia || entry.locationName)).length,
      municipalities: uniqueExportValues(groupEntries.map((entry) => entry.municipality)).length,
      coordinates: groupEntries.filter((entry) => entry.latitude && entry.longitude).length,
      occurrences: groupEntries.filter((entry) => entry.hasOccurrence).length,
      followUps: groupEntries.filter((entry) => entry.requiresFollowUp !== "Não").length,
      activities: uniqueExportValues(groupEntries.flatMap((entry) => entry.activities)).join("; "),
      waterConditions: uniqueExportValues(groupEntries.flatMap((entry) => entry.waterVisualConditions)).join("; "),
    });
  }

  styleWorksheet(sheet, "K");
}

function addFieldDiaryEntriesSheet(
  workbook: Workbook,
  entries: FieldDiaryEntry[],
) {
  const sheet = workbook.addWorksheet("Diário de campo completo", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Campanha", key: "campaignName", width: 34 },
    { header: "ID da campanha", key: "campaignId", width: 26 },
    { header: "Dia da campanha", key: "campaignDay", width: 16 },
    { header: "Data", key: "entryDate", width: 14 },
    { header: "Horário", key: "collectionTime", width: 12 },
    { header: "Local/ponto", key: "locationName", width: 32 },
    { header: "SIA", key: "sia", width: 16 },
    { header: "Amostras/réplicas eDNA", key: "samplesReplicasEdna", width: 22 },
    { header: "ID Zooplâncton", key: "zooplanktonId", width: 18 },
    { header: "Latitude", key: "latitude", width: 14 },
    { header: "Longitude", key: "longitude", width: 14 },
    { header: "Município", key: "municipality", width: 22 },
    { header: "Atividades", key: "activities", width: 36 },
    { header: "Condições visuais da água", key: "waterVisualConditions", width: 40 },
    { header: "Ocorrência?", key: "hasOccurrence", width: 14 },
    { header: "Tipo de ocorrência", key: "occurrenceType", width: 26 },
    { header: "Descrição da ocorrência", key: "occurrenceDescription", width: 44 },
    { header: "Requer follow-up", key: "requiresFollowUp", width: 18 },
    { header: "Notas de follow-up", key: "followUpNotes", width: 44 },
    { header: "Clima", key: "weatherConditions", width: 20 },
    { header: "Acessibilidade", key: "pointAccessibility", width: 18 },
    { header: "Resumo diário", key: "dailySummary", width: 48 },
    { header: "Status", key: "status", width: 14 },
    { header: "Criado por", key: "createdByName", width: 24 },
    { header: "Criado em", key: "createdAt", width: 22 },
    { header: "Atualizado em", key: "updatedAt", width: 22 },
  ];

  for (const entry of entries) {
    sheet.addRow({
      campaignName: entry.campaignName,
      campaignId: entry.campaignId ?? "",
      campaignDay: entry.campaignDay,
      entryDate: formatExportDate(entry.entryDate),
      collectionTime: entry.collectionTime,
      locationName: entry.locationName,
      sia: entry.sia ?? "",
      samplesReplicasEdna: entry.samplesReplicasEdna ?? "",
      zooplanktonId: entry.zooplanktonId ?? "",
      latitude: entry.latitude ?? "",
      longitude: entry.longitude ?? "",
      municipality: entry.municipality,
      activities: entry.activities.join("; "),
      waterVisualConditions: entry.waterVisualConditions.join("; "),
      hasOccurrence: entry.hasOccurrence ? "Sim" : "Não",
      occurrenceType: entry.occurrenceType ?? "",
      occurrenceDescription: entry.occurrenceDescription ?? "",
      requiresFollowUp: entry.requiresFollowUp,
      followUpNotes: entry.followUpNotes ?? "",
      weatherConditions: entry.weatherConditions ?? "",
      pointAccessibility: entry.pointAccessibility ?? "",
      dailySummary: entry.dailySummary,
      status: entry.status,
      createdByName: entry.createdByName ?? "",
      createdAt: formatExportDateTime(entry.createdAt),
      updatedAt: formatExportDateTime(entry.updatedAt),
    });
  }

  styleWorksheet(sheet, "Z");
}

function styleWorksheet(sheet: Worksheet, lastColumn: string) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF004262" },
  };
  sheet.autoFilter = `A1:${lastColumn}1`;
}

function compareFieldDiaryGroups(left: FieldDiaryEntry[], right: FieldDiaryEntry[]) {
  const leftEntry = left[0];
  const rightEntry = right[0];

  if (!leftEntry || !rightEntry) {
    return left.length - right.length;
  }

  return (
    leftEntry.entryDate.localeCompare(rightEntry.entryDate) ||
    leftEntry.campaignDay - rightEntry.campaignDay ||
    leftEntry.campaignName.localeCompare(rightEntry.campaignName, "pt-BR")
  );
}

function uniqueExportValues(values: Array<string | number | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true }),
  );
}

function formatExportDate(value: string | undefined | null) {
  if (!value) {
    return "";
  }

  const datePart = value.slice(0, 10);
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatExportDateTime(value: string | undefined | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function slugifyFileName(value: string) {
  return String(value || "campanha")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}


