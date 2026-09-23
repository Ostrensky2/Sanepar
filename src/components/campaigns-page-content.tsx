"use client";

import {
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { readSelectedCampaignId, writeSelectedCampaignId } from "@/lib/selected-campaign";
import { CampaignMapSection } from "@/components/campaign-map-section";
import { CampaignResultsPanels } from "@/components/campaign-results-panels";
import { FieldDiaryForm } from "@/components/field-diary/form";
import { FieldDiaryPageContent } from "@/components/field-diary-page-content";
import { MetabarcodingStagesIndicator, type MetabarcodingStage } from "@/components/metabarcoding-stages";
import { SectionTabs } from "@/components/section-tabs";
import {
  addCampaignResultsSheet,
  addFieldDiaryEntriesSheet,
  addFieldDiarySummarySheet,
  addPublishedResultsSheets,
  buildCampaignResultsFileName,
  downloadBlob,
  downloadWorkbook,
  formatExportCampaignSelection,
  getExportDiaryEntries,
  slugifyFileName,
} from "@/lib/campaign-workbook-export";
import {
  dayNumber,
  diaryEntryMatchesSelectedCampaign,
  findDiaryEntryForMapPoint,
  mapDiaryEntryMatchKeys,
  mapPointMatchKeys,
  normalizeMapPointDateKey,
  normalizeMapPointKey,
} from "@/lib/campaign-point-matching";
import {
  type CampaignHydroMapPoint,
} from "@/components/campaign-hydro-map";
import {
  FIELD_DIARY_UPDATED_EVENT,
  readFieldDiaryEntries,
  readFieldDiaryEntriesFromStorage,
  saveFieldDiaryEntry,
  type FieldDiaryEntry,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import {
  campaignPointMatchesSelectedCampaign,
  normalizeCampaignKey,
} from "@/lib/campaign-points";
import { validateEntry } from "@/components/field-diary/helpers";
import {
  buildDefaultCampaignManagement,
  buildInitialCampaignManagement,
  CAMPAIGN_MANAGEMENT_STORAGE_KEY,
  calculateCampaignProgress,
  campaignPhaseLabel,
  defaultCampaigns,
  getCurrentCampaignStage,
  readCampaignManagement,
  type CampaignManagementById,
  type CampaignView,
} from "@/lib/campaign-management";
import { DashboardSkeleton, ErrorBoundary } from "@/components/operational-feedback";
import type { LaboratoryRiskPoint } from "@/lib/laboratory-risk";
import type {
  ResultsPublication,
  ResultsViewModel,
} from "@/lib/imports/results-contract";
import { parseInternalStorageUrl } from "@/lib/imports/media-policy";
import type {
  ResultsPublicationV2,
} from "@/lib/results-v2-persistence";
import type { ResultsCampaign } from "@/modules/results";
import type { ResultsInventoryItem, ResultsInventoryResponse } from "@/lib/results-publication-contract";
import { CampaignPointFicha } from "@/modules/results/components/campaign-point-ficha";

import { isPublishedLegacyResponse, isPublishedV2Response, type PublishedResultsResponse as CampaignResultsResponse } from "@/modules/results/published-response";

const CAMPAIGN_MANAGEMENT_UPDATED_EVENT = "yvae:campaign-management-updated";

export function matchesRequestedResults(publication: Pick<ResultsPublicationV2, "publicationId" | "source"> | null, publicationId?: string, sourceHash?: string) {
  if (!publicationId && !sourceHash) return true;
  return !!publicationId && !!sourceHash && publication?.publicationId === publicationId && publication.source.sha256.toLowerCase() === sourceHash.toLowerCase();
}

export function linkedResultPoint(campaign: ResultsCampaign | null, sia?: string) {
  const normalize = (value: string) => value.trim().match(/^(?:SIA-)?(\d+)$/i)?.[1].replace(/^0+(?=\d)/, "");
  if (!sia || !normalize(sia)) return undefined;
  const matches = campaign?.points.filter((point) => normalize(point.siaCode) === normalize(sia)) ?? [];
  return matches.length === 1 ? matches[0] : undefined;
}

export function CampaignsPageContent({
  campaignPoints,
  resultExportPoints = [],
  campaigns = defaultCampaigns,
  initialCampaignId,
  initialPublicationId,
  initialSourceHash,
  initialSia,
  view = "campo",
  eyebrow = "Campanha selecionada",
  selectorLabel = "Campanha exibida",
  emptyMapTitle = "Mapa aguardando dados de campo",
  emptyMapDescription = "Registre pontos com coordenadas no Diário de campo para que eles apareçam no mapa desta campanha.",
}: {
  campaignPoints: CampaignHydroMapPoint[];
  resultExportPoints?: LaboratoryRiskPoint[];
  campaigns?: CampaignView[];
  initialCampaignId?: string;
  initialPublicationId?: string;
  initialSourceHash?: string;
  initialSia?: string;
  view?: "campo" | "resultados";
  eyebrow?: string;
  selectorLabel?: string;
  emptyMapTitle?: string;
  emptyMapDescription?: string;
}) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => {
    const requestedCampaign = campaigns.find((campaign) => campaign.id === initialCampaignId);
    if (requestedCampaign) return requestedCampaign.id;
    const defaultCampaignId = campaigns[0].id;

    if (typeof window === "undefined") {
      return defaultCampaignId;
    }

    const stored = readSelectedCampaignId();
    const storedCampaign = campaigns.find((campaign) => campaign.id === stored);

    return storedCampaign ? storedCampaign.id : defaultCampaignId;
  });
  const [diaryEntries, setDiaryEntries] = useState<FieldDiaryEntry[]>(() =>
    readFieldDiaryEntriesFromStorage(),
  );
  const [localCampaignPoints, setLocalCampaignPoints] = useState<CampaignHydroMapPoint[] | null>(null);
  const [publishedResults, setPublishedResults] = useState<CampaignResultsResponse | null>(null);
  const [resultLinkError, setResultLinkError] = useState("");
  const [linkedPointClosed, setLinkedPointClosed] = useState(false);
  const [campaignManagement, setCampaignManagement] = useState<CampaignManagementById>(() =>
    buildInitialCampaignManagement(campaigns),
  );
  const [hasLoadedCampaignManagement, setHasLoadedCampaignManagement] = useState(false);
  const [hasLoadedDiaryEntries, setHasLoadedDiaryEntries] = useState(false);
  const [hasLoadedPublishedResults, setHasLoadedPublishedResults] = useState(view !== "resultados");
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [dismissedUnavailableResultsNoticeCampaignId, setDismissedUnavailableResultsNoticeCampaignId] =
    useState<string | null>(null);
  const [resultsInventory, setResultsInventory] = useState<ResultsInventoryItem[] | null>(null);
  const [mapEditEntry, setMapEditEntry] = useState<FieldDiaryPayload | null>(null);
  const [mapEditMessage, setMapEditMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeSelectedCampaignId(selectedCampaignId);
  }, [campaigns, selectedCampaignId, view]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!canUseBrowserOnlyPersistence()) {
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

  useEffect(() => {
    // Inventário leve das publicações vigentes: alimenta o card de resultados também na aba Campo.
    const controller = new AbortController();
    void fetch("/api/imports/results?inventory=1", { cache: "no-store", signal: controller.signal })
      .then(async (response) => (response.ok ? ((await response.json()) as ResultsInventoryResponse) : null))
      .then((value) => {
        if (!controller.signal.aborted && Array.isArray(value?.campaigns)) setResultsInventory(value.campaigns);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const selectedCampaign = useMemo(() => {
    const candidate = campaigns.find((campaign) => campaign.id === selectedCampaignId);

    return candidate ?? campaigns[0];
  }, [campaigns, selectedCampaignId]);

  useEffect(() => {
    if (view !== "resultados") return;

    const controller = new AbortController();
    const campaignNumber = selectedCampaign.id.match(/campanha-(\d+)/)?.[1];
    const query = new URLSearchParams({ campaignId: selectedCampaign.id });
    if (campaignNumber) query.set("campaignNumber", campaignNumber);

    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setPublishedResults(null);
        setResultLinkError("");
        setHasLoadedPublishedResults(false);
      }
    });
    void fetch(`/api/imports/results?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const failure = await response.json().catch(() => null) as { code?: string } | null;
          throw new Error(failure?.code === "legacy_head_unavailable" ? "Há resultados legados preservados, mas a publicação vigente ainda não pôde ser confirmada neste ambiente. Nenhum resultado foi tratado como vazio." : "Não foi possível consultar a publicação desta campanha. Isso não significa ausência de resultados.");
        }
        return await response.json() as CampaignResultsResponse;
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        if ((initialPublicationId || initialSourceHash) && (!initialCampaignId || !campaigns.some((item) => item.id === initialCampaignId) || (selectedCampaign.id === initialCampaignId && !matchesRequestedResults(isPublishedV2Response(response) ? response.publication : null, initialPublicationId, initialSourceHash)))) {
          setResultLinkError("A publicação vinculada não está mais vigente ou não corresponde à fonte solicitada. Nenhuma outra versão foi exibida automaticamente.");
          setPublishedResults(null);
          return;
        }
        setPublishedResults(response);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPublishedResults(null);
          setResultLinkError(error instanceof Error ? error.message : "Publicação indisponível para consulta.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setHasLoadedPublishedResults(true);
      });

    return () => controller.abort();
  }, [selectedCampaign.id, view, initialCampaignId, initialPublicationId, initialSourceHash, campaigns]);

  const resultsUnavailable =
    view === "resultados" && hasLoadedPublishedResults && publishedResults?.status !== "published";
  const showUnavailableResultsNotice =
    resultsUnavailable && dismissedUnavailableResultsNoticeCampaignId !== selectedCampaign.id;

  const selectedManagement =
    campaignManagement[selectedCampaign.id] ?? buildDefaultCampaignManagement(selectedCampaign);
  const selectedStages = selectedManagement.stages.length
    ? selectedManagement.stages
    : buildDefaultCampaignManagement(selectedCampaign).stages;
  const selectedCampaignProgress = calculateCampaignProgress(
    selectedStages,
    selectedManagement.status,
  );
  const sampleCollection = selectedStages.find((s) => s.label === "Coleta de amostras");
  const isPreparation = !sampleCollection || sampleCollection.status === "pending";

  const selectedDiaryEntries = useMemo(
    () =>
      diaryEntries.filter(
        (e) =>
          diaryEntryMatchesSelectedCampaign(e, selectedCampaign.id, selectedCampaign.title),
      ),
    [diaryEntries, selectedCampaign.id, selectedCampaign.title],
  );
  const v2Campaign = useMemo<ResultsCampaign | null>(() => {
    if (!isPublishedV2Response(publishedResults) || !publishedResults.campaign.points) return null;
    return {
      campaignCode: publishedResults.campaign.campaignCode,
      points: publishedResults.campaign.points,
      counts: publishedResults.campaign.counts,
    };
  }, [publishedResults]);
  const canonicalResultPoints = useMemo(
    () => isPublishedLegacyResponse(publishedResults)
      ? dashboardPointsToMapPoints(
          publishedResults.viewModel,
          publishedResults.publication,
          selectedDiaryEntries,
        )
      : [],
    [publishedResults, selectedDiaryEntries],
  );
  const v2FieldPhotos = useMemo(
    () => v2Campaign ? buildResultsV2PhotoMap(v2Campaign, selectedDiaryEntries) : {},
    [selectedDiaryEntries, v2Campaign],
  );
  const sourceCampaignPoints = view === "resultados"
    ? canonicalResultPoints
    : localCampaignPoints?.length
      ? localCampaignPoints
      : campaignPoints;
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
  // Pontos de campo (percurso) independem da aba: Campo e Resultados mostram a mesma contagem.
  const fieldSourcePoints = localCampaignPoints?.length ? localCampaignPoints : campaignPoints;
  const selectedFieldCampaignPoints = useMemo(
    () =>
      fieldSourcePoints.filter((point) =>
        campaignPointMatchesSelectedCampaign(point, selectedCampaign.id, selectedCampaign.title),
      ),
    [selectedCampaign.id, selectedCampaign.title, fieldSourcePoints],
  );
  const selectedResultExportPoints = useMemo(
    () =>
      resultExportPoints.filter((point) =>
        campaignPointMatchesSelectedCampaign(point, selectedCampaign.id, selectedCampaign.title),
      ),
    [resultExportPoints, selectedCampaign.id, selectedCampaign.title],
  );

  const diaryMapPoints = useMemo(
    () =>
      validDiaryEntries
        .map((entry) => diaryEntryToMapPoint(entry, selectedFieldCampaignPoints))
        .filter((p): p is CampaignHydroMapPoint => p !== null),
    [selectedFieldCampaignPoints, validDiaryEntries],
  );
  const importedFieldMapPoints = useMemo(
    () => selectedFieldCampaignPoints.filter(hasImportedFieldMapPoint),
    [selectedFieldCampaignPoints],
  );
  // Da Campanha 2 em diante, o Diário de campo (planilha de campo importada) é a
  // fonte autoritativa do percurso — dias, coordenadas e sequência de coleta.
  // A Campanha 1 permanece como está: consolidada a partir da planilha importada.
  const selectedCampaignNumber = selectedCampaign.id.match(/campanha-(\d+)/)?.[1] ?? "";
  const campaignFieldMapPoints = useMemo(
    () => {
      if (isPreparation) {
        return selectedFieldCampaignPoints.filter((point) => point.original || point.effective);
      }

      if (selectedCampaignNumber !== "1" && diaryMapPoints.length) {
        return diaryMapPoints;
      }

      if (importedFieldMapPoints.length) {
        return hydrateImportedFieldMapPointsFromDiary(importedFieldMapPoints, diaryMapPoints);
      }

      return diaryMapPoints;
    },
    [diaryMapPoints, importedFieldMapPoints, selectedCampaignNumber, selectedFieldCampaignPoints, isPreparation],
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
  const collectedPointCount = campaignFieldMapPoints.filter((point) => point.effective).length;
  const inventoryResult = resultsInventory?.find((item) => item.canonicalId === selectedCampaign.id) ?? null;
  const resultPointCount = v2Campaign
    ? v2Campaign.counts.total
    : isPublishedLegacyResponse(publishedResults)
      ? publishedResults.viewModel.meta.linhas
      : inventoryResult?.counts.total ?? 0;
  const hasPublishedResults = Boolean(v2Campaign || isPublishedLegacyResponse(publishedResults) || inventoryResult);
  const mapEmptyTitle = isPreparation ? "Aguardando importação da planilha" : emptyMapTitle;
  const mapEmptyDescription = isPreparation
    ? "Importe a planilha com os pontos previstos na aba Dados para visualizá-los no mapa."
    : emptyMapDescription;
  const isCampaignHydrating =
    !hasLoadedCampaignManagement ||
    !hasLoadedDiaryEntries ||
    (view === "resultados" && !hasLoadedPublishedResults);

  async function exportFieldDiaryWorkbook(exportCampaignIds: string[]) {
    setExportMessage("");

    const exportEntries = getExportDiaryEntries(
      diaryEntries,
      campaigns,
      exportCampaignIds,
    );
    const exportCampaignLabel = formatExportCampaignSelection(campaigns, exportCampaignIds);

    if (!exportEntries.length) {
      setExportMessage("Não há registros de campo para exportar nesta seleção.");
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

      await downloadWorkbook(
        workbook,
        `${slugifyFileName(exportCampaignLabel)}-diario-de-campo.xlsx`,
      );
      setExportMessage(`Planilha exportada com ${sortedEntries.length} registros.`);
    } catch {
      setExportMessage("Não foi possível exportar a planilha agora.");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportCampaignResultsWorkbook() {
    setExportMessage("");

    const publication = isPublishedLegacyResponse(publishedResults)
      ? publishedResults.publication
      : null;
    if (!selectedResultExportPoints.length && !publication && !v2Campaign) {
      setExportMessage("Esta campanha ainda não possui resultados homologados para exportação.");
      return;
    }

    setIsExporting(true);

    try {
      if (v2Campaign) {
        const response = await fetch(
          `/api/imports/results/template?source=published&campaignCode=${encodeURIComponent(v2Campaign.campaignCode)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("O binário verificável da publicação não está disponível; nenhuma fonte antiga foi usada.");
        downloadBlob(await response.blob(), buildCampaignResultsFileName(selectedCampaign.title));
        setExportMessage(
          `Planilha v2 reimportável exportada com ${v2Campaign.points.length} resultados em sete abas. O Diário de campo permanece no download próprio.`,
        );
        return;
      }

      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Yva'e Monitoramento";
      workbook.created = new Date();
      workbook.modified = new Date();

      addFieldDiarySummarySheet(workbook, selectedDiaryEntries, selectedCampaign.title, "Resumo");
      if (selectedResultExportPoints.length) {
        addCampaignResultsSheet(workbook, selectedResultExportPoints, selectedDiaryEntries);
      } else if (publication) {
        addPublishedResultsSheets(workbook, publication);
      }
      addFieldDiaryEntriesSheet(workbook, selectedDiaryEntries);
      await downloadWorkbook(workbook, buildCampaignResultsFileName(selectedCampaign.title));
      setExportMessage(
        `Planilha exportada com ${publication?.rankingRows.length ?? selectedResultExportPoints.length} resultados e ${selectedDiaryEntries.length} registros de campo.`,
      );
    } catch {
      setExportMessage("Não foi possível gerar a planilha desta campanha agora.");
    } finally {
      setIsExporting(false);
    }
  }

  function openMapPointEditForm(point: CampaignHydroMapPoint) {
    const entry = findDiaryEntryForMapPoint(point, selectedDiaryEntries);

    if (!entry) {
      setMapEditMessage("Não encontrei um registro do Diário de campo para editar as fotos deste ponto.");
      return;
    }

    setMapEditMessage("");
    setMapEditEntry(fieldDiaryEntryToPayload(entry, selectedCampaign.id, selectedCampaign.title));
  }

  async function handleMapEditSave(payload: FieldDiaryPayload) {
    const error = validateEntry(payload);

    if (error) {
      setMapEditMessage(error);
      return;
    }

    const result = await saveFieldDiaryEntry(payload);

    if (result.persistence === "none") {
      setMapEditMessage("A nuvem não confirmou a gravação. O registro não foi publicado para outros usuários.");
      return;
    }

    setDiaryEntries((current) =>
      [
        result.entry,
        ...current.filter((entry) => entry.id !== result.entry.id),
      ].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt)),
    );
    setMapEditEntry(null);
    setMapEditMessage(
      result.persistence === "cloud"
        ? "Fotos atualizadas no Diário de campo."
        : "Fotos atualizadas localmente. A nuvem será usada quando estiver disponível.",
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho comum às abas Campo e Resultados */}
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="type-eyebrow text-[var(--brand-teal)]">
              {eyebrow}
            </p>
            <h1 className="heading-font type-page-title text-[var(--brand-navy-strong)]">
              {selectedCampaign.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:max-w-[55%]">
            <label className="type-label grid min-w-[16rem] flex-1 gap-1 text-[var(--ink-soft)]">
              {selectorLabel}
              <select
                className="min-h-11 rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-bold text-[var(--brand-navy-strong)] outline-none transition focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                value={selectedCampaign.id}
                onChange={(event) => {
                  setSelectedCampaignId(event.target.value);
                  setExportMessage("");
                }}
              >
                {campaigns.map((campaign) => {
                  const management = campaignManagement[campaign.id];
                  const status = management?.status ?? campaign.status;
                  const phase = campaignPhaseLabel(status);
                  // Fase escrita por extenso: caracteres como ✓ e ⏳ variam por sistema e não dizem nada ao leitor de tela.
                  return (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.selectorLabel} — {phase}
                    </option>
                  );
                })}
              </select>
            </label>

            {view === "campo" ? (
              <CampaignExportMenu
                disabled={isExporting || isCampaignHydrating}
                isExporting={isExporting}
                canExportSelected={exportableCampaignIds.has(selectedCampaign.id)}
                canExportAll={exportableCampaignIds.size > 0}
                onExportSelected={() => void exportFieldDiaryWorkbook([selectedCampaign.id])}
                onExportAll={() => void exportFieldDiaryWorkbook(["all"])}
              />
            ) : null}
          </div>
        </div>
        {view === "campo" && exportMessage ? (
          <p role="status" className="type-metadata text-[var(--ink-soft)]">{exportMessage}</p>
        ) : null}
        <SectionTabs />
      </section>

      {mapEditMessage && !mapEditEntry ? (
        <div className="rounded-2xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-semibold text-[var(--brand-navy-strong)] shadow-[var(--shadow-soft)]">
          {mapEditMessage}
        </div>
      ) : null}

      {/* Faixa de resumo em uma linha; a trilha de etapas fica recolhida no próprio resumo. */}
      <ErrorBoundary title="Falha nos indicadores da campanha">
        {isCampaignHydrating ? (
          <div className="h-14 animate-pulse rounded-2xl border border-[var(--line-ghost)] bg-white" />
        ) : (
          <CampaignSummaryStrip
            phase={campaignPhaseLabel(selectedManagement.status)}
            currentStage={getCurrentCampaignStage(selectedStages)?.label}
            collected={`${collectedPointCount}/${selectedManagement.plannedPoints}`}
            fieldRows={fieldRowCount}
            resultPoints={hasPublishedResults ? resultPointCount : null}
            stages={selectedStages}
          >
            <MetabarcodingStagesIndicator
              stages={selectedStages}
              title={selectedManagement.stageTitle}
              progress={selectedCampaignProgress}
            />
          </CampaignSummaryStrip>
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
                    onEditPointPhotos={openMapPointEditForm}
                    campaignStatus={selectedManagement.status}
                    isPreparation={isPreparation}
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
                compactSummaryMetrics
              />
            )}
          </ErrorBoundary>
        </CampaignResultsPanels>
      )}

      {/* Resultados view */}
      {view === "resultados" && resultLinkError && <p role="alert">{resultLinkError}</p>}
      {view === "resultados" && !resultLinkError && (
        <div className="space-y-6">
          {initialSia && selectedCampaign.id === initialCampaignId && !linkedPointClosed && v2Campaign && isPublishedV2Response(publishedResults) && (linkedResultPoint(v2Campaign, initialSia) ? <CampaignPointFicha point={linkedResultPoint(v2Campaign, initialSia)!} campaign={v2Campaign} publicationId={publishedResults.publication.publicationId} sourceHash={publishedResults.publication.source.sha256} photoUrl={v2FieldPhotos[linkedResultPoint(v2Campaign, initialSia)!.siaCode]} onClose={() => setLinkedPointClosed(true)} /> : <p role="status">O SIA vinculado não existe de forma inequívoca nesta publicação. Nenhum homônimo foi selecionado.</p>)}
          <CampaignResultsPanels
            isHydrating={isCampaignHydrating}
            resultsUnavailable={resultsUnavailable}
            showUnavailableNotice={showUnavailableResultsNotice}
            campaign={selectedCampaign}
            publication={isPublishedLegacyResponse(publishedResults) ? publishedResults.publication : undefined}
            resultsV2={v2Campaign ? [v2Campaign] : undefined}
            resultsV2Publication={isPublishedV2Response(publishedResults) ? publishedResults.publication : undefined}
            resultsV2Photos={v2FieldPhotos}
            resultsV2PayloadUnavailable={
              isPublishedV2Response(publishedResults) && publishedResults.campaign.points === null
            }
            stages={selectedStages}
            stageTitle={selectedManagement.stageTitle}
            points={visibleResultPoints}
            canDownload={!isCampaignHydrating && Boolean(v2Campaign || isPublishedLegacyResponse(publishedResults))}
            isDownloading={isExporting}
            downloadMessage={exportMessage}
            onDownload={() => void exportCampaignResultsWorkbook()}
            onDismissUnavailableNotice={() => setDismissedUnavailableResultsNoticeCampaignId(selectedCampaign.id)}
          />
        </div>
      )}

      {mapEditEntry ? (
        <FieldDiaryForm
          entry={mapEditEntry}
          message={mapEditMessage}
          campaignScope={{
            id: selectedCampaign.id,
            name: selectedCampaign.title,
          }}
          onChange={setMapEditEntry}
          onSave={handleMapEditSave}
          onClose={() => {
            setMapEditEntry(null);
            setMapEditMessage("");
          }}
        />
      ) : null}
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

function dashboardPointsToMapPoints(
  viewModel: ResultsViewModel,
  publication: ResultsPublication,
  selectedDiaryEntries: FieldDiaryEntry[],
): CampaignHydroMapPoint[] {
  return hydrateResultPointPhotos(viewModel.points.map((point) => ({
    id: `${publication.campaignId}:resultado:${point.amostra}`,
    code: String(point.sia),
    point: point.ponto,
    campaign: publication.campaignTitle,
    municipality: point.municipio,
    waterBody: point.manancial,
    original: null,
    effective: { lat: point.lat, lon: point.lon },
    accessibility: "",
    waterAspect: point.turbidez,
    weatherConditions: point.clima,
    problems: "",
    photoUrl: "",
    riskLevel: dashboardRiskLevel(point.classe),
    score: point.score,
  })), publication, selectedDiaryEntries);
}

export function hydrateResultPointPhotos<T extends CampaignHydroMapPoint>(
  points: T[],
  publication: Pick<ResultsPublication, "campaignId">,
  selectedDiaryEntries: FieldDiaryEntry[],
): T[] {
  const photosBySia = new Map<string, Map<string, FieldDiaryEntry["photos"][number]>>();

  for (const entry of selectedDiaryEntries) {
    if (entry.campaignId !== publication.campaignId) continue;

    const sia = canonicalNumericSia(entry.sia);
    if (!sia) continue;

    const photos = photosBySia.get(sia) ?? new Map();
    for (const photo of entry.photos ?? []) {
      if (parseInternalStorageUrl(photo.url, "photos")) photos.set(photo.url, photo);
    }
    if (photos.size) photosBySia.set(sia, photos);
  }

  return points.map((point) => {
    const photos = photosBySia.get(canonicalNumericSia(point.code));
    if (photos?.size !== 1) return { ...point, photoUrl: "", photos: [] };

    const photo = [...photos.values()][0];
    return { ...point, photoUrl: photo.url, photos: [photo] };
  });
}

export function buildResultsV2PhotoMap(
  campaign: ResultsCampaign,
  selectedDiaryEntries: FieldDiaryEntry[],
) {
  const pointSias = new Set(campaign.points.map((point) => canonicalNumericSia(point.siaCode)));
  const candidates = new Map<string, Set<string>>();

  for (const entry of selectedDiaryEntries) {
    const sia = canonicalNumericSia(entry.sia);
    if (!sia || !pointSias.has(sia)) continue;
    const urls = candidates.get(sia) ?? new Set<string>();
    for (const photo of entry.photos ?? []) {
      if (parseInternalStorageUrl(photo.url, "photos")) urls.add(photo.url);
    }
    if (urls.size) candidates.set(sia, urls);
  }

  return Object.fromEntries(campaign.points.flatMap((point) => {
    const urls = candidates.get(canonicalNumericSia(point.siaCode));
    return urls?.size === 1
      ? [[`${campaign.campaignCode}|${point.siaCode}`, [...urls][0]]]
      : [];
  }));
}

function canonicalNumericSia(value: unknown) {
  const matches = String(value ?? "").match(/\d+/g);
  return matches?.length === 1 ? `sia:${Number(matches[0])}` : "";
}

function dashboardRiskLevel(value: string | null): CampaignHydroMapPoint["riskLevel"] {
  if (value === "Alto") return "alto";
  if (value === "Moderado") return "moderado";
  if (value === "Baixo a moderado") return "baixoModerado";
  if (value === "Baixo") return "baixo";
  return undefined;
}


function hasImportedFieldMapPoint(point: CampaignHydroMapPoint) {
  return Boolean(point.effective);
}

function hasValidFieldDiaryMapEntry(entry: FieldDiaryEntry) {
  const hasPhotos = (entry.photos ?? []).some((photo) => String(photo.url ?? "").trim());
  const hasOperationalFieldData = Boolean(
    entry.activities.length ||
      entry.waterVisualConditions.length ||
      String(entry.dailySummary ?? "").trim() ||
      String(entry.followUpNotes ?? "").trim() ||
      entry.hasOccurrence,
  );

  return Boolean(
    hasOperationalFieldData || hasPhotos,
  );
}

function hydrateImportedFieldMapPointsFromDiary(
  importedFieldPoints: CampaignHydroMapPoint[],
  diaryPoints: CampaignHydroMapPoint[],
) {
  if (!diaryPoints.length) {
    return mergeFieldMapPoints(importedFieldPoints, []);
  }

  return mergeFieldMapPoints(
    importedFieldPoints.map((importedPoint) => {
      const importedKeys = new Set(mapPointMatchKeys(importedPoint));
      const matchingDiaryPoints = diaryPoints.filter((diaryPoint) =>
        mapPointMatchKeys(diaryPoint).some((key) => importedKeys.has(key)),
      );

      return matchingDiaryPoints.reduce(
        (current, diaryPoint) => mergeDiaryMapPointWithImportedFieldPoint(diaryPoint, current),
        importedPoint,
      );
    }),
    [],
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
  const photos = mergePointPhotos(diaryPoint, importedPoint);

  return {
    ...importedPoint,
    ...diaryPoint,
    // A planilha importada é a fonte autoritativa de sequência/identidade do
    // roteiro; o diário só complementa observações de campo.
    id: importedPoint.id,
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
    photoUrl: photos[0]?.url || diaryPoint.photoUrl || importedPoint.photoUrl,
    photos,
  };
}

function mergePointPhotos(
  primaryPoint: CampaignHydroMapPoint,
  secondaryPoint: CampaignHydroMapPoint,
) {
  const byUrl = new Map<string, NonNullable<CampaignHydroMapPoint["photos"]>[number]>();

  for (const photo of [...pointPhotos(primaryPoint), ...pointPhotos(secondaryPoint)]) {
    const url = photo.url.trim();

    if (!url || byUrl.has(url)) {
      continue;
    }

    byUrl.set(url, { ...photo, url });
  }

  return [...byUrl.values()];
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
      // Sequência de coleta = ordem das linhas da planilha (collectionOrder). Sem
      // ela, cai para a ordem de criação, depois nome.
      (a.collectionOrder ?? Number.MAX_SAFE_INTEGER) - (b.collectionOrder ?? Number.MAX_SAFE_INTEGER) ||
      String(a.createdAt).localeCompare(String(b.createdAt)) ||
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




function diaryEntryToMapPoint(
  entry: FieldDiaryEntry,
  knownPoints: CampaignHydroMapPoint[],
): CampaignHydroMapPoint | null {
  const lat = parseFloat(entry.latitude ?? "");
  const lon = parseFloat(entry.longitude ?? "");
  const effective = isFinite(lat) && isFinite(lon) ? { lat, lon } : null;
  const referencePoint = findKnownPointForDiaryEntry(entry, knownPoints);

  // Mapa de percurso da campanha: o Diário é a coleta real. NÃO fabricamos uma
  // coordenada "prevista" a partir de imports antigos — isso gerava linhas de
  // deslocamento (retas) indevidas cruzando o mapa. Sem previsto, sem deslocamento.
  if (!effective) return null;

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
    collectionOrder: entry.collectionOrder ?? null,
    waterBody: referencePoint?.waterBody || entry.locationName,
    municipality: entry.municipality || referencePoint?.municipality || "Paraná",
    original: null,
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


function fieldDiaryEntryToPayload(
  entry: FieldDiaryEntry,
  fallbackCampaignId: string,
  fallbackCampaignName: string,
): FieldDiaryPayload {
  return {
    id: entry.id,
    campaignId: entry.campaignId || fallbackCampaignId,
    campaignName: entry.campaignName || fallbackCampaignName,
    campaignDay: entry.campaignDay,
    entryDate: entry.entryDate,
    fieldTeamName: entry.fieldTeamName,
    fieldTeamMembers: entry.fieldTeamMembers ?? [],
    collectionTime: entry.collectionTime,
    locationName: entry.locationName,
    sia: entry.sia,
    samplesReplicasEdna: entry.samplesReplicasEdna,
    zooplanktonId: entry.zooplanktonId,
    latitude: entry.latitude,
    longitude: entry.longitude,
    municipality: entry.municipality,
    activities: entry.activities,
    waterVisualConditions: entry.waterVisualConditions,
    hasOccurrence: entry.hasOccurrence,
    occurrenceType: entry.occurrenceType,
    occurrenceDescription: entry.occurrenceDescription,
    requiresFollowUp: entry.requiresFollowUp,
    followUpNotes: entry.followUpNotes,
    weatherConditions: entry.weatherConditions,
    pointAccessibility: entry.pointAccessibility,
    dailySummary: entry.dailySummary,
    status: entry.status,
    createdBy: entry.createdBy,
    createdByName: entry.createdByName,
    photos: entry.photos ?? [],
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


function formatDiarySiaCode(value: unknown) {
  const match = String(value ?? "").match(/\d+/);

  if (!match) {
    return "";
  }

  return `SIA-${match[0].padStart(4, "0")}`;
}

function CampaignExportMenu({
  disabled,
  isExporting,
  canExportSelected,
  canExportAll,
  onExportSelected,
  onExportAll,
}: {
  disabled: boolean;
  isExporting: boolean;
  canExportSelected: boolean;
  canExportAll: boolean;
  onExportSelected: () => void;
  onExportAll: () => void;
}) {
  const itemClass =
    "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <details className="relative">
      <summary
        aria-disabled={disabled}
        className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        {isExporting ? "Exportando…" : "Exportar"}
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-[var(--line-ghost)] bg-white p-1 shadow-[var(--shadow-soft)]">
        <button
          type="button"
          className={itemClass}
          disabled={!canExportSelected}
          onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            onExportSelected();
          }}
        >
          Diário desta campanha (.xlsx)
        </button>
        <button
          type="button"
          className={itemClass}
          disabled={!canExportAll}
          onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            onExportAll();
          }}
        >
          Diário de todas as campanhas (.xlsx)
        </button>
      </div>
    </details>
  );
}

function CampaignSummaryStrip({
  phase,
  currentStage,
  collected,
  fieldRows,
  resultPoints,
  stages,
  children,
}: {
  phase: string;
  currentStage?: string;
  collected: string;
  fieldRows: number;
  resultPoints: number | null;
  stages: MetabarcodingStage[];
  children: ReactNode;
}) {
  const done = stages.filter((stage) => stage.status === "done").length;
  const items = [
    phase === "Concluída" || !currentStage ? null : currentStage,
    <><strong className="tabular-nums">{collected}</strong> coletados</>,
    <><strong className="tabular-nums">{fieldRows.toLocaleString("pt-BR")}</strong> registros de campo</>,
    resultPoints === null ? "resultados ainda não publicados" : <><strong className="tabular-nums">{resultPoints.toLocaleString("pt-BR")}</strong> com resultado</>,
  ].filter(Boolean);

  return (
    <details className="app-card group px-4 py-1" aria-label="Resumo da campanha">
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--ink)] [&::-webkit-details-marker]:hidden">
        <strong className="text-[var(--brand-navy-strong)]">{phase}</strong>
        {items.map((item, index) => <span key={index} className="before:mr-2 before:text-[var(--ink-soft)] before:content-['·']">{item}</span>)}
        <span className="ml-auto inline-flex min-h-11 items-center gap-1 font-bold text-[var(--brand-navy-strong)]">
          {done}/{stages.length} etapas
          <span aria-hidden="true" className="transition group-open:rotate-90">▸</span>
        </span>
      </summary>
      <div className="pb-3">{children}</div>
    </details>
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

// Mantidos no módulo da página por compatibilidade com importações existentes.
export { addCampaignResultsSheet, addFieldDiaryEntriesSheet, addFieldDiarySummarySheet, buildCampaignResultsFileName };
