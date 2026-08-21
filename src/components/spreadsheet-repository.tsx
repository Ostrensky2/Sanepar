"use client";

import {
  DatabaseZap,
  Download,
  FileSpreadsheet,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  hasPrivilege,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import {
  OPERATION_CANCEL_EVENT,
  TableSkeletonRows,
  beginGlobalOperation,
  emitLocalMode,
  isCloudConnectionError,
  toActionableErrorMessage,
} from "@/components/operational-feedback";
import { EmptyState } from "@/components/empty-state";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import type { LaboratoryRiskPoint, LaboratoryRiskResultRow } from "@/lib/laboratory-risk";
import type { SpreadsheetPreview } from "@/lib/types";
import type { FieldDiaryEntry } from "@/lib/field-diary";
import {
  RESULTS_DASHBOARD_HEADERS,
  RESULTS_DASHBOARD_SECTIONS,
  RESULTS_DICTIONARY_HEADERS,
  RESULTS_INSTRUCTION_FIELDS,
  RESULTS_INSTRUCTION_HEADERS,
  RESULTS_MOLECULAR_FIELDS,
  RESULTS_RANKING_FIELDS,
  RESULTS_SCHEMA_VERSION,
  RESULTS_WORKSHEETS,
} from "@/lib/imports/results-contract";

type SpreadsheetKind = "Campo" | "Laboratório";
type CampaignScope = "Ordinária" | "Extraordinária";
type SheetStatus = "CARREGADA" | "PUBLICADA" | "PREVIEW" | "ERRO";

export type DataEntryView = "campo" | "resultados";

const VIEW_CONFIG: Record<
  DataEntryView,
  {
    kind: SpreadsheetKind;
    title: string;
    description: string;
    template?: {
      href?: string;
      title: string;
      description: string;
    };
    formHeading: string;
    formDescription: string;
    submitLabel: string;
    metricsLabel: string;
    metricTotalLabel: string;
    showFieldMapToggle: boolean;
    emptyTableLabel: string;
  }
> = {
  campo: {
    kind: "Campo",
    title: "Entrada de Planilhas de Campo",
    description:
      "Planilha-síntese das campanhas. Alimenta mapas e pontos do app.",
    template: {
      href: "/template-planilha-de-campo.xlsx",
      title: "Modelo da planilha-síntese de campanhas",
      description:
        "Estrutura esperada: aba Campanhas com SIA, ponto, dia, data, manancial, município, coordenadas, condições e links.",
    },
    formHeading: "Nova planilha de Campo",
    formDescription:
      "Importe a planilha-síntese da campanha.",
    submitLabel: "Carregar planilha",
    metricsLabel: "Campo",
    metricTotalLabel: "Planilhas de Campo",
    showFieldMapToggle: true,
    emptyTableLabel: "Nenhuma planilha-síntese de Campo carregada para o filtro atual.",
  },
  resultados: {
    kind: "Laboratório",
    title: "Entrada de Planilhas de Resultados",
    description:
      "Modelo canônico por campanha. A última publicação válida alimenta Dashboard e Resultados.",
    template: {
      title: "Modelo canônico de resultados",
      description: `Schema ${RESULTS_SCHEMA_VERSION}, com Instruções, Dicionário e todas as leituras do dashboard.`,
    },
    formHeading: "Nova planilha de Resultados",
    formDescription:
      "Importe o modelo preenchido. Rascunhos ou arquivos inválidos não substituem a última publicação válida.",
    submitLabel: "Carregar planilha",
    metricsLabel: "Resultados",
    metricTotalLabel: "Planilhas de Resultados",
    showFieldMapToggle: false,
    emptyTableLabel: "Nenhuma planilha de Resultados carregada para o filtro atual.",
  },
};

type StoredSpreadsheet = {
  id: string;
  fileName: string;
  campaign: string;
  scope: CampaignScope;
  kind: SpreadsheetKind;
  date: string;
  sizeBytes: number;
  status: SheetStatus;
  rows?: number;
  sheets?: number;
  note?: string;
};

type CampaignPublishPayload = {
  fileName: string;
  rowCount: number;
  points: CampaignMapPoint[];
  originalPointCount: number;
  effectivePointCount: number;
  missingFields: string[];
  preview: SpreadsheetPreview;
  persistence: {
    mode: "cloud" | "browser";
    message: string;
  };
  unifiedImport?: {
    mode: "cloud" | "browser";
    batchId?: string;
    summary: {
      novos: number;
      identicos: number;
      aditivos: number;
      conflitos: number;
      fotos: {
        baixadas: number;
        avisos: number;
      };
    };
    photoWarnings?: Array<{ pointId: string; sourceUrl: string; message: string }>;
  };
};

type LaboratoryResultsPayload = {
  fileName: string;
  worksheetName: string;
  rankingWorksheetName: string;
  rowCount: number;
  sheetCount: number;
  columnCount: number;
  expectedColumnCount: number;
  headers: string[];
  matchedHeaders: number;
  markers: string[];
  analyzedSets: string[];
  speciesCount: number;
  riskRows: LaboratoryRiskResultRow[];
  riskPoints: LaboratoryRiskPoint[];
  matchedRiskPointCount: number;
  persistence: {
    mode: "cloud" | "browser";
    message: string;
  };
};

const STORAGE_KEY = "yvae:spreadsheets";
const DB_NAME = "yvae-spreadsheet-files";
const DB_STORE = "files";
const campaigns = [
  "1ª Campanha - Verão 2026",
  "2ª Campanha - Outono 2026",
  "3ª Campanha - Inverno 2026",
  "4ª Campanha - Primavera 2026",
  "5ª Campanha - Verão 2027",
  "6ª Campanha - Outono 2027",
  "7ª Campanha - Inverno 2027",
  "8ª Campanha - Primavera 2027",
  "9ª Campanha - Verão 2028",
];
const filters = ["Todos", "Ordinárias", "Extraordinárias"] as const;

export function SpreadsheetRepository({ view = "campo" }: { view?: DataEntryView } = {}) {
  const config = VIEW_CONFIG[view];
  const [spreadsheets, setSpreadsheets] = useState<StoredSpreadsheet[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("Todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conflictHref, setConflictHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [activeCategory, setActiveCategory] = useState<UserCategory>("Admin");
  const [formState, setFormState] = useState({
    campaign: campaigns[0],
    scope: "Ordinária" as CampaignScope,
    kind: config.kind,
    extraordinaryName: "",
    note: "",
    publishFieldMap: view === "campo",
  });

  useEffect(() => {
    queueMicrotask(() => setFormState((current) => ({
      ...current,
      kind: config.kind,
      publishFieldMap: view === "campo" ? current.publishFieldMap : false,
    })));
  }, [config.kind, view]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSpreadsheets(readStoredSpreadsheets());
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
      setHasLoaded(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    function refreshAccessCategory() {
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
    }

    window.addEventListener("storage", refreshAccessCategory);
    window.addEventListener("yvae:access-category-updated", refreshAccessCategory);

    return () => {
      window.removeEventListener("storage", refreshAccessCategory);
      window.removeEventListener("yvae:access-category-updated", refreshAccessCategory);
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spreadsheets));
    window.dispatchEvent(new Event("yvae:spreadsheets-updated"));
  }, [hasLoaded, spreadsheets]);

  const canImportSpreadsheets = hasPrivilege(activeCategory, "data.import");
  const canDeleteSpreadsheets = hasPrivilege(activeCategory, "data.delete");

  const viewSpreadsheets = useMemo(
    () => spreadsheets.filter((sheet) => sheet.kind === config.kind),
    [config.kind, spreadsheets],
  );

  const metrics = useMemo(() => {
    const ordinaryCampaigns = new Set(
      viewSpreadsheets
        .filter((sheet) => sheet.scope === "Ordinária")
        .map((sheet) => sheet.campaign),
    );

    return {
      total: viewSpreadsheets.length,
      ordinary: ordinaryCampaigns.size,
      extraordinary: viewSpreadsheets.filter((sheet) => sheet.scope === "Extraordinária").length,
      published: viewSpreadsheets.filter((sheet) => sheet.status === "PUBLICADA").length,
    };
  }, [viewSpreadsheets]);

  const visibleSpreadsheets = useMemo(() => {
    const normalizedSearch = normalize(searchTerm);

    return viewSpreadsheets.filter((sheet) => {
      const matchesFilter =
        activeFilter === "Todos" ||
        (activeFilter === "Ordinárias" && sheet.scope === "Ordinária") ||
        (activeFilter === "Extraordinárias" && sheet.scope === "Extraordinária");
      const searchable = normalize(`${sheet.fileName} ${sheet.campaign} ${sheet.kind} ${sheet.status}`);

      return matchesFilter && searchable.includes(normalizedSearch);
    });
  }, [activeFilter, searchTerm, viewSpreadsheets]);

  async function addSpreadsheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setConflictHref(null);

    if (!canImportSpreadsheets) {
      setError("A categoria ativa pode consultar Dados, mas não pode importar planilhas.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("A planilha a ser agregada ao repositório de dados deve ser selecionada.");
      return;
    }

    const campaign =
      formState.scope === "Extraordinária"
        ? formState.extraordinaryName.trim() || "Campanha extraordinária"
        : formState.campaign;

    formData.append("selectedCampaign", campaign);

    let status: SheetStatus = "CARREGADA";
    let rowCount: number | undefined;
    let sheetCount: number | undefined;
    let statusMessage = "Planilha registrada no módulo Dados.";
    const spreadsheetId = `${file.name}-${crypto.randomUUID()}`;
    const operationId = `spreadsheet-import:${spreadsheetId}`;
    const controller = new AbortController();
    const stopOperation = beginGlobalOperation({
      id: operationId,
      title: "Carregando planilha...",
      description: "Validando arquivo, publicando dados e atualizando o painel.",
      cancelable: true,
    });
    const cancelHandler = (cancelEvent: Event) => {
      const detail = (cancelEvent as CustomEvent<{ id: string }>).detail;
      if (detail?.id === operationId) {
        controller.abort();
      }
    };

    setIsPending(true);
    window.addEventListener(OPERATION_CANCEL_EVENT, cancelHandler);

    try {
      if (formState.kind === "Campo" && formState.publishFieldMap) {
        const response = await fetch("/api/imports/campaigns", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        const payload = (await response.json()) as CampaignPublishPayload | { error: string };

        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error : "A planilha de Campo não pôde ser publicada.");
        }

        if (payload.persistence.mode !== "cloud" && !canUseBrowserOnlyPersistence()) {
          throw new Error(payload.persistence.message);
        }

        if (payload.persistence.mode === "cloud" || canUseBrowserOnlyPersistence()) {
          if (payload.persistence.mode !== "cloud") {
            emitLocalMode("A planilha de Campo foi salva neste navegador porque a nuvem não confirmou sincronização.");
          }
          window.localStorage.setItem("yvae:campaign-map-points", JSON.stringify(payload.points));
          window.localStorage.setItem(
            "yvae:campaign-map-import",
            JSON.stringify({
              fileName: payload.fileName,
              pointCount: payload.points.length,
              originalPointCount: payload.originalPointCount,
              effectivePointCount: payload.effectivePointCount,
              importedAt: new Date().toISOString(),
              persistenceMode: payload.persistence.mode,
            }),
          );
        }

        status = "PUBLICADA";
        rowCount = payload.rowCount;
        sheetCount = payload.preview.sheetCount;
        statusMessage = formatFieldImportMessage(payload);
        if (payload.unifiedImport?.summary.conflitos) {
          setConflictHref("/dados/pendencias");
        }
      } else if (formState.kind === "Laboratório") {
        const resultsData = new FormData();
        resultsData.append("file", file);
        resultsData.append("selectedCampaign", campaign);
        const response = await fetch("/api/imports/results", {
          method: "POST",
          body: resultsData,
          signal: controller.signal,
        });
        const payload = (await response.json()) as LaboratoryResultsPayload | { error: string };

        if (!response.ok || "error" in payload) {
          throw new Error(
            "error" in payload
              ? payload.error
              : "A planilha de Resultados não segue o modelo consolidado.",
          );
        }

        if (payload.persistence.mode !== "cloud" && !canUseBrowserOnlyPersistence()) {
          throw new Error(payload.persistence.message);
        }

        if (payload.persistence.mode === "cloud" || canUseBrowserOnlyPersistence()) {
          if (payload.persistence.mode !== "cloud") {
            emitLocalMode("A planilha de Resultados foi salva neste navegador porque a nuvem não confirmou sincronização.");
          }
          window.localStorage.setItem("yvae:lab-risk-results", JSON.stringify(payload.riskPoints));
          window.localStorage.setItem(
            "yvae:lab-risk-import",
            JSON.stringify({
              fileName: payload.fileName,
              rankingWorksheetName: payload.rankingWorksheetName,
              riskRowCount: payload.riskRows.length,
              matchedRiskPointCount: payload.matchedRiskPointCount,
              importedAt: new Date().toISOString(),
              persistenceMode: payload.persistence.mode,
            }),
          );
        }

        status = "PUBLICADA";
        rowCount = payload.rowCount;
        sheetCount = payload.sheetCount;
        statusMessage = `${payload.persistence.message} ${payload.rowCount} linhas, ${payload.expectedColumnCount} variáveis obrigatórias validadas${payload.columnCount > payload.expectedColumnCount ? ` e ${payload.columnCount - payload.expectedColumnCount} colunas adicionais` : ""}; ${payload.speciesCount} espécies identificadas; ${payload.matchedRiskPointCount}/${payload.riskRows.length} pontos de risco publicados no Início.`;
      } else {
        const previewData = new FormData();
        previewData.append("file", file);
        const response = await fetch("/api/imports/preview", {
          method: "POST",
          body: previewData,
          signal: controller.signal,
        });
        const payload = (await response.json()) as SpreadsheetPreview | { error: string };

        if (response.ok && !("error" in payload)) {
          status = "PREVIEW";
          rowCount = payload.totalRows;
          sheetCount = payload.sheetCount;
        }
      }

      const today = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());

      const newSpreadsheet: StoredSpreadsheet = {
        id: spreadsheetId,
        fileName: file.name,
        campaign,
        scope: formState.scope,
        kind: formState.kind,
        date: today,
        sizeBytes: file.size,
        status,
        rows: rowCount,
        sheets: sheetCount,
        note: formState.note.trim(),
      };

      await saveSpreadsheetFile(spreadsheetId, file);
      setSpreadsheets((current) => [newSpreadsheet, ...current]);
      setSelectedFileName(null);
      form.reset();
      setFormState((current) => ({
        ...current,
        note: "",
        extraordinaryName: "",
      }));
      setMessage(statusMessage);
    } catch (uploadError) {
      setError(
        uploadError instanceof DOMException && uploadError.name === "AbortError"
          ? "Importação cancelada. Nenhum dado novo foi publicado."
          : toActionableErrorMessage(
              uploadError,
              "Não foi possível agregar a planilha.",
            ),
      );
      if (isCloudConnectionError(uploadError)) {
        emitLocalMode("Falha durante importação de planilha. Dados podem estar apenas neste navegador.");
      }
    } finally {
      window.removeEventListener(OPERATION_CANCEL_EVENT, cancelHandler);
      stopOperation();
      setIsPending(false);
    }
  }

  async function downloadSpreadsheet(sheet: StoredSpreadsheet) {
    const file = await readSpreadsheetFile(sheet.id);

    if (!file) {
      setError("Arquivo da planilha não encontrado neste navegador. Recarregue a planilha para habilitar o download.");
      return;
    }

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = sheet.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function deleteSpreadsheet(sheet: StoredSpreadsheet) {
    if (!canDeleteSpreadsheets) {
      setError("A categoria ativa pode consultar Dados, mas não pode excluir planilhas.");
      return;
    }

    const confirmed = window.confirm(
      `ATENÇÃO: A exclusão removerá permanentemente a planilha "${sheet.fileName}" e TODOS os dados associados à campanha "${sheet.campaign}" do diário de campo e mapas. Confirmar exclusão?`,
    );

    if (!confirmed) {
      return;
    }

    setIsPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/imports/campaigns?campaignName=${encodeURIComponent(
          sheet.campaign
        )}&campaignKey=${encodeURIComponent(sheet.campaign.toLowerCase())}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errPayload = await response.json();
        throw new Error(errPayload.error || "Erro ao excluir dados da nuvem.");
      }

      setSpreadsheets((current) => current.filter((item) => item.id !== sheet.id));
      await deleteSpreadsheetFile(sheet.id);

      const storedPointsRaw = window.localStorage.getItem("yvae:campaign-map-points");
      if (storedPointsRaw) {
        const storedPoints = JSON.parse(storedPointsRaw) as CampaignMapPoint[];
        const filteredPoints = storedPoints.filter(
          (p) => p.campaign.trim().toLowerCase() !== sheet.campaign.trim().toLowerCase()
        );
        if (filteredPoints.length === 0) {
          window.localStorage.removeItem("yvae:campaign-map-points");
        } else {
          window.localStorage.setItem("yvae:campaign-map-points", JSON.stringify(filteredPoints));
        }
        window.dispatchEvent(new Event("storage"));
      }

      const storedImportRaw = window.localStorage.getItem("yvae:campaign-map-import");
      if (storedImportRaw) {
        const storedImport = JSON.parse(storedImportRaw);
        if (storedImport.fileName === sheet.fileName) {
          window.localStorage.removeItem("yvae:campaign-map-import");
        }
      }

      const storedDiaryRaw = window.localStorage.getItem("yvae:field-diary-entries");
      if (storedDiaryRaw) {
        const storedDiary = JSON.parse(storedDiaryRaw) as FieldDiaryEntry[];
        const filteredDiary = storedDiary.filter(
          (d) => d.campaignName.trim().toLowerCase() !== sheet.campaign.trim().toLowerCase()
        );
        window.localStorage.setItem("yvae:field-diary-entries", JSON.stringify(filteredDiary));
        window.dispatchEvent(new Event("yvae:field-diary-updated"));
      }

      setMessage(`Dados da campanha "${sheet.campaign}" excluídos com sucesso.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido ao excluir dados.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <p className="type-metadata text-[var(--ink-soft)]">
          {config.description}
        </p>
        <span className="type-caption whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-[var(--ink-soft)]">
          Perfil: <strong className="text-[var(--brand-navy-strong)]">{activeCategory}</strong> · Exclusão {canDeleteSpreadsheets ? "liberada" : "bloqueada"}
        </span>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading-font type-section-title text-[var(--brand-navy-strong)]">
            Controle de importação
          </h2>
          <span className="type-eyebrow text-[var(--brand-teal)]">
            {viewSpreadsheets.length} de {config.metricsLabel}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricTile label={config.metricTotalLabel} value={metrics.total} />
          <MetricTile label="Campanhas ordinárias" value={`${metrics.ordinary}/9`} />
          <MetricTile label="Extraordinárias" value={metrics.extraordinary} />
          <MetricTile label="Publicadas" value={metrics.published} />
        </div>
      </section>

      <section className="glass-panel radius-panel p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="type-eyebrow rounded bg-[var(--brand-green-soft)] px-2 py-0.5 text-[var(--brand-navy-strong)]">
                Carga manual
              </span>
              <h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">
                {config.formHeading}
              </h3>
            </div>
            {!canImportSpreadsheets ? (
              <p className="mt-1 rounded bg-[rgba(197,122,0,0.08)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-amber)]">
                Importação bloqueada para a categoria ativa. Revise as permissões em Configurações.
              </p>
            ) : null}
          </div>
          <div className="rounded bg-[var(--surface-soft)] p-1 text-[var(--brand-navy)] shrink-0">
            <DatabaseZap className="h-4 w-4" />
          </div>
        </div>

        {config.template ? (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-[var(--surface-soft)] px-3 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="h-4 w-4 text-[var(--brand-blue)] shrink-0" />
              <p className="type-caption truncate text-[var(--ink-soft)]">
                {config.template.description}
              </p>
            </div>
            {config.template.href ? (
              <a
                href={config.template.href}
                download
                className="type-button inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[var(--brand-navy-strong)] shadow-sm transition hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar Modelo
              </a>
            ) : (
              <button
                type="button"
                className="type-button inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[var(--brand-navy-strong)] shadow-sm transition hover:bg-slate-50"
                onClick={() => void downloadResultsTemplate(formState.campaign)}
              >
                <Download className="h-3.5 w-3.5" />
                Baixar Modelo
              </button>
            )}
          </div>
        ) : null}

        <form className="grid gap-2 lg:grid-cols-6" onSubmit={addSpreadsheet}>
          <select
            className="type-label h-9 rounded-lg border border-slate-200 bg-white px-3 lg:col-span-1"
            value={formState.scope}
            disabled={!canImportSpreadsheets || isPending}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                scope: event.target.value as CampaignScope,
              }))
            }
          >
            <option value="Ordinária">Campanha ordinária</option>
            <option value="Extraordinária">Campanha extraordinária</option>
          </select>
          {formState.scope === "Ordinária" ? (
            <select
              className="type-label h-9 rounded-lg border border-slate-200 bg-white px-3 lg:col-span-2"
              value={formState.campaign}
              disabled={!canImportSpreadsheets || isPending}
              onChange={(event) =>
                setFormState((current) => ({ ...current, campaign: event.target.value }))
              }
            >
              {campaigns.map((campaign) => (
                <option key={campaign} value={campaign}>
                  {campaign}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="type-label h-9 rounded-lg border border-slate-200 bg-white px-3 lg:col-span-2"
              placeholder="Nome da campanha extraordinária"
              value={formState.extraordinaryName}
              disabled={!canImportSpreadsheets || isPending}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  extraordinaryName: event.target.value,
                }))
              }
            />
          )}
          <label className="type-button flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--brand-navy)]/40 bg-[var(--surface-soft)] px-3 text-[var(--brand-navy-strong)] transition hover:border-[var(--brand-navy)] hover:bg-[var(--brand-blue-soft)] lg:col-span-2">
            <UploadCloud className="h-4 w-4 shrink-0 text-[var(--brand-navy)]" />
            <span className="min-w-0 flex-1 truncate text-center">
              {selectedFileName ?? "Selecionar planilha"}
            </span>
            <input
              name="file"
              type="file"
              accept=".xlsx,.xlsm"
              disabled={!canImportSpreadsheets || isPending}
              className="sr-only"
              onChange={(event) =>
                setSelectedFileName(event.currentTarget.files?.[0]?.name ?? null)
              }
            />
          </label>
          <button
            type="submit"
            disabled={isPending || !canImportSpreadsheets}
            className="type-button flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--brand-navy-strong)] px-4 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 lg:col-span-1"
          >
            <UploadCloud className="h-4 w-4" />
            {isPending ? "Carregando..." : config.submitLabel}
          </button>
          
          <input
            className={`h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs ${
              config.showFieldMapToggle ? "lg:col-span-4" : "lg:col-span-6"
            }`}
            placeholder="Observação operacional"
            value={formState.note}
            disabled={!canImportSpreadsheets || isPending}
            onChange={(event) =>
              setFormState((current) => ({ ...current, note: event.target.value }))
            }
          />
          {config.showFieldMapToggle ? (
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[var(--brand-navy-strong)] lg:col-span-2">
              <input
                type="checkbox"
                checked={formState.publishFieldMap}
                disabled={!canImportSpreadsheets || isPending}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    publishFieldMap: event.target.checked,
                  }))
                }
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-[var(--brand-navy-strong)]"
              />
              Mapa será atualizado
            </label>
          ) : null}
        </form>

        {message ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[rgba(0,168,107,0.08)] px-4 py-3 text-xs font-semibold text-[#0b5f40]">
            <span>{message}</span>
            {conflictHref ? (
              <Link
                href={conflictHref}
                className="rounded-md bg-white px-3 py-1.5 font-bold text-[var(--brand-navy-strong)] shadow-sm"
              >
                Resolver agora
              </Link>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg bg-[rgba(186,26,26,0.08)] px-4 py-3 text-xs font-semibold text-[var(--brand-danger)]">
            {error}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex flex-wrap gap-1 rounded-lg bg-[var(--surface-soft)] p-1">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={
                  filter === activeFilter
                    ? "rounded-md border-b-2 border-[var(--brand-blue)] bg-white px-4 py-2 text-xs font-bold text-[var(--brand-navy)] shadow-sm"
                    : "px-4 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-[var(--brand-navy-strong)]"
                }
              >
                {filter}
              </button>
            ))}
          </nav>

          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar planilhas..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-[var(--brand-navy-strong)]/20"
            />
          </div>
        </div>

        <div className="glass-panel overflow-hidden radius-panel">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="px-4 py-2 text-caption font-bold uppercase tracking-[0.22em] text-slate-500">
                  Campanha
                </th>
                <th className="px-4 py-2 text-caption font-bold uppercase tracking-[0.22em] text-slate-500">
                  Data de Importação
                </th>
                <th className="px-4 py-2 text-caption font-bold uppercase tracking-[0.22em] text-slate-500">
                  Status
                </th>
                <th className="px-4 py-2 text-caption font-bold uppercase tracking-[0.22em] text-slate-500">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="type-table divide-y divide-slate-50">
              {!hasLoaded ? (
                <TableSkeletonRows rows={5} columns={4} />
              ) : (
              visibleSpreadsheets.map((sheet) => (
                <tr key={sheet.id} className="group transition-all hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-5 w-5 text-[var(--brand-blue)] shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-[var(--brand-navy-strong)]">
                            {sheet.campaign}
                          </p>
                          <span className={`type-caption rounded px-1.5 py-0.5 font-bold ${
                            sheet.scope === "Ordinária" 
                              ? "bg-[var(--brand-navy-strong)]/10 text-[var(--brand-navy-strong)]" 
                              : "bg-amber-100 text-amber-800"
                          }`}>
                            {sheet.scope}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {sheet.fileName} • {formatBytes(sheet.sizeBytes)}
                          {sheet.rows ? ` • ${sheet.rows} linhas` : ""}
                          {sheet.sheets ? ` • ${sheet.sheets} abas` : ""}
                          {sheet.note ? ` • Obs: "${sheet.note}"` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{sheet.date}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-sm border-l-[3px] px-2 py-0.5 text-caption font-bold ${statusClass(sheet.status)}`}>
                      {sheet.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        aria-label={`Baixar ${sheet.fileName}`}
                        className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100"
                        onClick={() => void downloadSpreadsheet(sheet)}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {canDeleteSpreadsheets ? (
                        <button
                          type="button"
                          aria-label={`Remover ${sheet.fileName}`}
                          disabled={isPending}
                          className="rounded p-1 text-[var(--brand-danger)] transition-colors hover:bg-red-50 disabled:opacity-50"
                          onClick={() => void deleteSpreadsheet(sheet)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>

          {hasLoaded && !visibleSpreadsheets.length ? (
            <div className="p-4">
              <EmptyState
                title={config.emptyTableLabel}
                description="Use o formulário acima para carregar a primeira planilha desta categoria."
                compact
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function openSpreadsheetDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function saveSpreadsheetFile(id: string, file: File) {
  const db = await openSpreadsheetDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

async function readSpreadsheetFile(id: string) {
  const db = await openSpreadsheetDb();

  const file = await new Promise<File | null>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readonly");
    const request = transaction.objectStore(DB_STORE).get(id);
    request.onsuccess = () => resolve(request.result instanceof File ? request.result : null);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return file;
}

async function deleteSpreadsheetFile(id: string) {
  const db = await openSpreadsheetDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="glass-panel radius-card p-2.5 flex items-center justify-between gap-4">
      <p className="type-label truncate uppercase tracking-[0.1em] text-[var(--ink-soft)]">
        {label}
      </p>
      <p className="heading-font type-kpi shrink-0 text-[var(--brand-navy-strong)]">
        {value}
      </p>
    </article>
  );
}

function readStoredSpreadsheets() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredSpreadsheet[]) : [];
  } catch {
    return [];
  }
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatBytes(value: number) {
  if (value === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;

  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function statusClass(status: SheetStatus) {
  if (status === "PUBLICADA") {
    return "border-[#00b356] bg-emerald-50 text-emerald-700";
  }

  if (status === "PREVIEW") {
    return "border-[var(--brand-blue)] bg-blue-50 text-blue-700";
  }

  if (status === "ERRO") {
    return "border-[var(--brand-danger)] bg-red-50 text-[var(--brand-danger)]";
  }

  return "border-[var(--brand-teal)] bg-cyan-50 text-cyan-700";
}

function formatFieldImportMessage(payload: CampaignPublishPayload) {
  const unified = payload.unifiedImport;

  if (!unified) {
    return payload.persistence.message;
  }

  const parts = [
    payload.persistence.message,
    `Diário: ${unified.summary.novos} novos, ${unified.summary.aditivos} aditivos, ${unified.summary.identicos} idênticos`,
  ];

  if (unified.summary.conflitos) {
    parts.push(`${unified.summary.conflitos} conflitos em Pendências`);
  }

  parts.push(
    `Fotos: ${unified.summary.fotos.baixadas} convertidas${
      unified.summary.fotos.avisos ? `, ${unified.summary.fotos.avisos} avisos` : ""
    }`,
  );

  return parts.join(" · ");
}

async function downloadResultsTemplate(campaignTitle: string) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Yva'e Monitoramento";
  workbook.created = new Date();

  const instructions = workbook.addWorksheet(RESULTS_WORKSHEETS.instructions);
  instructions.addRow([...RESULTS_INSTRUCTION_HEADERS]);
  const campaignNumber = Number(campaignTitle.match(/(\d+)/)?.[1] ?? 1);
  const campaignId = campaignNumber === 1
    ? "campanha-1-verao-2026"
    : campaignNumber === 2
      ? "campanha-2-outono-2026"
      : `campanha-${campaignNumber}`;
  const instructionValues: Record<string, string | number> = {
    schema_version: RESULTS_SCHEMA_VERSION,
    campaign_id: campaignId,
    campaign_number: campaignNumber,
    campaign_title: campaignTitle,
    publication_status: "draft",
    methodology_origin: "Preencher com a fonte homologada",
    methodology_version: "Preencher com a versão homologada",
  };
  RESULTS_INSTRUCTION_FIELDS.forEach((field) =>
    instructions.addRow([field.key, instructionValues[field.key] ?? ""]),
  );

  const molecular = workbook.addWorksheet(RESULTS_WORKSHEETS.molecular);
  molecular.addRow(RESULTS_MOLECULAR_FIELDS.map((field) => field.header));
  const ranking = workbook.addWorksheet(RESULTS_WORKSHEETS.ranking);
  ranking.addRow(RESULTS_RANKING_FIELDS.map((field) => field.header));

  const dashboard = workbook.addWorksheet(RESULTS_WORKSHEETS.dashboard);
  dashboard.addRow([...RESULTS_DASHBOARD_HEADERS]);
  RESULTS_DASHBOARD_SECTIONS.forEach((section) =>
    dashboard.addRow([section, "", "Preencher com a fonte homologada", "Preencher com a versão homologada"]),
  );

  const dictionary = workbook.addWorksheet(RESULTS_WORKSHEETS.dictionary);
  dictionary.addRow([...RESULTS_DICTIONARY_HEADERS]);
  const dictionaryRows = [
    ...RESULTS_MOLECULAR_FIELDS.map((field) => [RESULTS_WORKSHEETS.molecular, field] as const),
    ...RESULTS_RANKING_FIELDS.map((field) => [RESULTS_WORKSHEETS.ranking, field] as const),
  ] as const;
  dictionaryRows.forEach(([sheet, field]) =>
    dictionary.addRow([
      sheet,
      field.header,
      field.key,
      field.type,
      field.unit,
      field.requirement,
      field.validation,
      field.usage,
    ]),
  );
  RESULTS_DASHBOARD_SECTIONS.forEach((section) =>
    dictionary.addRow([
      RESULTS_WORKSHEETS.dashboard,
      section,
      section,
      "JSON",
      "—",
      "required",
      "payload explícito validado; sem cálculo de score/classificação",
      "paridade do golden master",
    ]),
  );

  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF004262" } };
    sheet.columns.forEach((column) => { column.width = 24; });
    sheet.autoFilter = sheet.rowCount > 1 ? { from: "A1", to: `${sheet.getColumn(sheet.columnCount).letter}1` } : undefined;
  }

  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `modelo-resultados-campanha-${campaignNumber}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

