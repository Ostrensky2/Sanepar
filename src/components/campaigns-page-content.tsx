"use client";

import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  FlaskConical,
  Info,
  MapPinned,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CampaignMapSection } from "@/components/campaign-map-section";
import {
  CampaignHydroMap,
  type CampaignHydroMapPoint,
} from "@/components/campaign-hydro-map";
import { MetabarcodingStagesIndicator } from "@/components/metabarcoding-stages";
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
  const [dismissedUnavailableResultsNoticeCampaignId, setDismissedUnavailableResultsNoticeCampaignId] =
    useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SELECTED_CAMPAIGN_STORAGE_KEY, selectedCampaignId);
  }, [campaigns, selectedCampaignId, view]);

  useEffect(() => {
    if (typeof window === "undefined") return;

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

    async function loadDiaryEntries() {
      const entries = await readFieldDiaryEntries();

      if (isMounted) {
        setDiaryEntries(entries);
        setHasLoadedDiaryEntries(true);
      }
    }

    void loadDiaryEntries();

    function handleUpdate() {
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
  const campaignFieldMapPoints = useMemo(
    () => mergeFieldMapPoints(importedFieldMapPoints, diaryMapPoints),
    [diaryMapPoints, importedFieldMapPoints],
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

  return (
    <div className="space-y-6">
      {/* Header: title + campaign selector */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            {eyebrow}
          </p>
          <h2 className="heading-font text-2xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            {selectedCampaign.title}
          </h2>
        </div>

        <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 lg:min-w-96">
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
              label="Pontos de campo"
              value={`${effectivePointCount}/${selectedManagement.plannedPoints}`}
              detail="Efetivos / previstos"
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
        <div className="space-y-6">
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
              <CollectionsSummary
                campaignName={selectedCampaign.title}
                entries={selectedDiaryEntries}
                mappedCount={diaryMapPoints.length}
                campaignClosed={campaignClosed}
              />
            )}
          </ErrorBoundary>
        </div>
      )}

      {/* Resultados view */}
      {view === "resultados" && (
        <div className="space-y-6">
          {isCampaignHydrating ? (
            <DashboardSkeleton rows={4} />
          ) : (
            <ErrorBoundary title="Falha nos resultados da campanha">
              {resultsUnavailable ? (
                <>
                  <UnavailableResultsNotice
                    campaignName={selectedCampaign.title}
                    open={showUnavailableResultsNotice}
                    onClose={() => setDismissedUnavailableResultsNoticeCampaignId(selectedCampaign.id)}
                  />
                  <ResultsUnavailablePanel campaign={selectedCampaign} />
                </>
              ) : (
                <>
                  <MetabarcodingStagesIndicator
                    stages={selectedStages}
                    title={selectedManagement.stageTitle}
                  />

                  <AnalyticResultsMap
                    points={visibleResultPoints}
                  />

                  <ResultsDashboardSection campaign={selectedCampaign} />
                </>
              )}
            </ErrorBoundary>
          )}
        </div>
      )}
    </div>
  );
}

function CollectionsSummary({
  campaignName,
  entries,
  mappedCount,
  campaignClosed,
}: {
  campaignName: string;
  entries: FieldDiaryEntry[];
  mappedCount: number;
  campaignClosed: boolean;
}) {
  const summary = summarizeCollectionEntries(entries);
  const entriesByDay = groupCollectionEntriesByDay(entries);

  return (
    <section className="glass-panel rounded-[28px] p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Planilha Diário de Campo
          </p>
          <h3 className="heading-font mt-1 text-2xl font-extrabold text-[var(--brand-navy-strong)]">
            Coletas
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            Síntese operacional das coletas de {campaignName}. O mapa usa apenas registros com coordenadas válidas enquanto a campanha está em execução.
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--surface-soft)] p-3 text-[var(--brand-navy)]">
          <ClipboardList className="h-5 w-5" />
        </div>
      </div>

      {entries.length ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <CollectionMetric label="Registros" value={summary.total} />
            <CollectionMetric label="No mapa" value={mappedCount} />
            <CollectionMetric label="Com coordenada" value={summary.withCoordinates} />
            <CollectionMetric label="Sem coordenada" value={summary.withoutCoordinates} tone="warning" />
            <CollectionMetric label="Ocorrências" value={summary.occurrences} tone="warning" />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] px-4 py-3 text-xs font-semibold text-[var(--ink-soft)]">
            <span className="font-bold text-[var(--brand-navy-strong)]">
              Origem: Entrada de dados → Diário de Campo
            </span>
            <span>·</span>
            <span>
              {campaignClosed
                ? "Campanha encerrada: mapa permanece definido pelos registros válidos do Diário de Campo."
                : "Campanha em execução: mapa usa apenas registros do diário com dado operacional de campo e coordenada efetiva ou apoio planejado conhecido."}
            </span>
          </div>

          <div className="divide-y divide-[var(--line-ghost)]">
            {entriesByDay.map((day) => (
              <section key={day.key} className="py-5 first:pt-0 last:pb-0">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="heading-font text-xl font-black text-[var(--brand-navy-strong)]">
                      {formatDate(day.entryDate)} · Dia {day.campaignDay}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--ink-soft)]">
                      {day.entries.length} ponto(s) no diário
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <DailyPill label="No mapa" value={day.summary.withCoordinates} />
                    <DailyPill label="Pendentes" value={day.summary.withoutCoordinates} />
                    <DailyPill label="Ocorrências" value={day.summary.occurrences} />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[940px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--line-ghost)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
                        <th className="px-3 py-3">Ponto / SIA</th>
                        <th className="px-3 py-3">Município</th>
                        <th className="px-3 py-3">Responsável</th>
                        <th className="px-3 py-3">Coordenadas</th>
                        <th className="px-3 py-3">Situação</th>
                        <th className="px-3 py-3">Ocorrência</th>
                        <th className="px-3 py-3">Resumo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.entries.map((entry) => (
                        <CollectionEntryRow key={entry.id} entry={entry} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
          <ClipboardList className="mb-3 h-9 w-9 text-slate-400" />
          <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">
            Nenhuma coleta encontrada
          </p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Importe ou registre a Planilha Diário de Campo em Entrada de dados para preencher esta síntese.
          </p>
        </div>
      )}
    </section>
  );
}

type CollectionSummary = {
  total: number;
  withCoordinates: number;
  withoutCoordinates: number;
  occurrences: number;
};

type CollectionDayGroup = {
  key: string;
  entryDate: string;
  campaignDay: number;
  entries: FieldDiaryEntry[];
  summary: CollectionSummary;
};

function CollectionMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${
      tone === "warning"
        ? "border-[var(--brand-amber)]/30 bg-[rgba(197,122,0,0.08)]"
        : "border-[var(--line-ghost)] bg-white"
    }`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">{value}</p>
    </div>
  );
}

function DailyPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-bold text-[var(--brand-navy-strong)]">
      {label}: {value}
    </span>
  );
}

function CollectionEntryRow({ entry }: { entry: FieldDiaryEntry }) {
  const hasCoordinates = hasDiaryCoordinates(entry);

  return (
    <tr className="border-b border-[var(--line-ghost)] align-top last:border-0">
      <td className="px-3 py-4">
        <span className="block font-bold text-[var(--brand-navy-strong)]">
          {entry.locationName || "Não informado"}
        </span>
        {entry.sia ? <span className="text-xs font-semibold text-slate-500">{entry.sia}</span> : null}
      </td>
      <td className="px-3 py-4">{entry.municipality || "Não informado"}</td>
      <td className="px-3 py-4">{entry.createdByName || "Não informado"}</td>
      <td className="px-3 py-4 text-xs font-semibold text-slate-600">
        {hasCoordinates ? `${entry.latitude}, ${entry.longitude}` : "Aguardando coordenada"}
      </td>
      <td className="px-3 py-4">
        <span className={hasCoordinates ? collectionMappedClassName : collectionPendingClassName}>
          {hasCoordinates ? "No mapa" : "Pendente"}
        </span>
      </td>
      <td className="px-3 py-4">
        <span className={entry.hasOccurrence ? occurrenceYesClassName : occurrenceNoClassName}>
          {entry.hasOccurrence ? entry.occurrenceType || "Sim" : "Não"}
        </span>
      </td>
      <td className="max-w-md px-3 py-4 text-sm leading-6 text-slate-600">
        {entry.dailySummary || joinSummary([...entry.activities, ...entry.waterVisualConditions])}
      </td>
    </tr>
  );
}

function summarizeCollectionEntries(entries: FieldDiaryEntry[]): CollectionSummary {
  return entries.reduce<CollectionSummary>(
    (summary, entry) => {
      const hasCoordinates = hasDiaryCoordinates(entry);
      return {
        total: summary.total + 1,
        withCoordinates: summary.withCoordinates + (hasCoordinates ? 1 : 0),
        withoutCoordinates: summary.withoutCoordinates + (hasCoordinates ? 0 : 1),
        occurrences: summary.occurrences + (entry.hasOccurrence ? 1 : 0),
      };
    },
    {
      total: 0,
      withCoordinates: 0,
      withoutCoordinates: 0,
      occurrences: 0,
    },
  );
}

function groupCollectionEntriesByDay(entries: FieldDiaryEntry[]): CollectionDayGroup[] {
  const groups = new Map<string, FieldDiaryEntry[]>();

  for (const entry of entries) {
    const key = `${entry.entryDate}|${entry.campaignDay}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return [...groups.entries()]
    .map(([key, groupEntries]) => {
      const first = groupEntries[0];
      const sortedEntries = [...groupEntries].sort((a, b) =>
        (a.locationName || a.sia || "").localeCompare(b.locationName || b.sia || "", "pt-BR", { numeric: true }),
      );

      return {
        key,
        entryDate: first.entryDate,
        campaignDay: first.campaignDay,
        entries: sortedEntries,
        summary: summarizeCollectionEntries(sortedEntries),
      };
    })
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.campaignDay - a.campaignDay);
}

function joinSummary(values: string[]) {
  return values.length ? values.join(", ") : "Não informado";
}

function formatDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function AnalyticResultsMap({
  points,
}: {
  points: CampaignHydroMapPoint[];
}) {
  if (!points.length) {
    return (
      <EmptyCampaignPanel
        title="Mapa de risco aguardando pontos"
        description="Os pontos homologados de risco ainda não foram carregados para esta visualização."
      />
    );
  }

  return (
    <section className="relative h-[500px] overflow-hidden rounded-[30px] border border-[var(--line-ghost)] bg-[linear-gradient(180deg,#eef5f8,#e6eef3)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)]">
      <CampaignHydroMap
        points={points}
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
        caption="Mapa rodoviário OpenStreetMap · Pontos de coleta da campanha"
      />
    </section>
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

function hasDiaryCoordinates(entry: FieldDiaryEntry) {
  return Number.isFinite(parseFloat(entry.latitude ?? "")) &&
    Number.isFinite(parseFloat(entry.longitude ?? ""));
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
      String(a.date ?? "").localeCompare(String(b.date ?? "")) ||
      dayNumber(a.day) - dayNumber(b.day) ||
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
  };
}

function fieldMapPointMergeKey(point: CampaignHydroMapPoint) {
  const pointKey = normalizeMapPointKey(point.code) || normalizeMapPointKey(point.point);

  return [
    normalizeCampaignKey(point.campaign),
    String(point.date ?? "").slice(0, 10),
    dayNumber(point.day),
    pointKey,
  ].join("|");
}

function dayNumber(value: unknown) {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
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
      a.locationName.localeCompare(b.locationName, "pt-BR"),
  );
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
    photoUrl: referencePoint?.photoUrl || "",
  };
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
    <article className={`glass-panel rounded-[28px] border-b-2 p-4 ${toneClass}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
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

function EmptyCampaignPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center rounded-[30px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
      <FileSpreadsheet className="mb-4 h-10 w-10 text-slate-400" />
      <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">{title}</p>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function ResultsUnavailablePanel({ campaign }: { campaign: CampaignView }) {
  return (
    <section className="glass-panel flex min-h-[520px] flex-col items-center justify-center rounded-[30px] p-8 text-center">
      <div className="mb-5 rounded-2xl bg-[var(--surface-soft)] p-4 text-[var(--brand-navy)]">
        <FlaskConical className="h-9 w-9" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
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
        className="w-full max-w-lg rounded-[28px] border border-[var(--line-ghost)] bg-white p-5 shadow-[0_30px_90px_-38px_rgba(0,66,98,0.48)]"
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
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
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

const occurrenceYesClassName =
  "inline-flex rounded-full bg-[var(--brand-amber)]/12 px-2.5 py-1 text-xs font-bold text-[var(--brand-amber)]";

const occurrenceNoClassName =
  "inline-flex rounded-full bg-[var(--brand-green-soft)] px-2.5 py-1 text-xs font-bold text-[var(--brand-navy-strong)]";

const collectionMappedClassName =
  "inline-flex rounded-full bg-[var(--brand-green-soft)] px-2.5 py-1 text-xs font-bold text-[var(--brand-navy-strong)]";

const collectionPendingClassName =
  "inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600";

function ResultsDashboardSection({ campaign }: { campaign: CampaignView }) {
  const hasDashboard = Boolean(campaign.resultsDashboardUrl);

  return (
    <section className="overflow-hidden rounded-[30px] border border-[var(--line-ghost)] bg-white shadow-[0_30px_80px_-50px_rgba(0,66,98,0.3)]">
      <div className="flex flex-col gap-3 border-b border-[var(--line-ghost)] p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Resultados Monitoramento
          </p>
          <p className="heading-font mt-1 text-2xl font-extrabold text-[var(--brand-navy-strong)]">
            Dashboard de resultados
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--ink-soft)]">{campaign.title}</p>
        </div>

        {hasDashboard ? (
          <a
            href={campaign.resultsDashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand-navy-strong)] transition hover:border-[var(--brand-blue)] hover:text-[var(--brand-blue)]"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir dashboard
          </a>
        ) : null}
      </div>

      <div className="bg-[var(--surface-soft)] p-3 sm:p-4">
        {hasDashboard ? (
          <iframe
            src={campaign.resultsDashboardUrl}
            title={`Dashboard de resultados - ${campaign.title}`}
            className="h-[760px] w-full rounded-[24px] border border-[var(--line-ghost)] bg-[#070f16] md:h-[860px] xl:h-[940px]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-[760px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-center md:h-[860px] xl:h-[940px]">
            <div className="mb-4 rounded-2xl bg-[var(--surface-soft)] p-4 text-[var(--brand-navy)]">
              <BarChart3 className="h-8 w-8" />
            </div>
            <p className="heading-font text-2xl font-extrabold text-[var(--brand-navy-strong)]">
              Dashboard aguardando resultados
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              O espaço desta campanha seguirá o mesmo padrão quando o dashboard de resultados for publicado.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
