"use client";

import {
  DatabaseZap,
  Download,
  FileSpreadsheet,
  Search,
  UploadCloud,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  hasPrivilege,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import {
  OPERATION_CANCEL_EVENT,
  TableSkeletonRows,
  beginGlobalOperation,
  toActionableErrorMessage,
} from "@/components/operational-feedback";
import { EmptyState } from "@/components/empty-state";
import {
  RESULTS_IMPORT_TIMEOUT_MS,
  formatResultsImportError,
  readResultsApiPayload,
} from "@/lib/imports/results-client";
import type { ResultsWorkbookPreviewResponse } from "@/lib/imports/results";
import type { ResultsInventoryResponse } from "@/lib/results-publication-contract";
import { planCampaignPublicationScope, RESULTS_CONTRACT_VERSION } from "@/modules/results";
import { ResultsPreparationPanel } from "@/modules/results/components/results-preparation-panel";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

type CampaignScope = "Ordinária" | "Extraordinária";
type SheetStatus = "CARREGADA" | "PUBLICADA" | "PREVIEW" | "ERRO";

/** Planilhas de campo entram só pelo Diário de campo; esta tela publica as planilhas de resultados. */

const config = {
  formHeading: "Nova planilha de Resultados",
  submitLabel: "Publicar campanhas selecionadas",
  emptyTableLabel: "Nenhuma planilha de Resultados carregada para o filtro atual.",
};

type StoredSpreadsheet = {
  id: string;
  fileName: string;
  campaign: string;
  scope: CampaignScope;
  date: string;
  sizeBytes: number;
  status: SheetStatus;
  rows?: number;
  sheets?: number;
  note?: string;
  campaignCode?: string;
  publicationId?: string;
  canonicalId?: string;
  downloadAvailable?: boolean;
  sourceHash?: string | null;
};

type LaboratoryResultsPayload = {
  fileName: string;
  schemaVersion: string;
  calculationVersion: string;
  catalogVersion: string;
  contentHash: string;
  campaigns: Array<{
    campaignCode: string;
    counts: {
      total: number;
      complete: number;
      partialWithTwoSets: number;
      partialWithOneSet: number;
      unavailable: number;
    };
  }>;
  warnings: string[];
  persistence: {
    mode: "cloud";
    state: "published" | "skipped";
    publicationId: string;
    message: string;
  };
};

export function SpreadsheetRepository() {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isPreviewingResults, setIsPreviewingResults] = useState(false);
  const [resultsPreview, setResultsPreview] = useState<ResultsWorkbookPreviewResponse | null>(null);
  const [selectedResultCampaigns, setSelectedResultCampaigns] = useState<string[]>([]);
  const resultsRequestRef = useRef<{ key: string; id: string } | null>(null);
  const [resultsInventory, setResultsInventory] = useState<ResultsInventoryResponse | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const resultsPreviewAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeCategory, setActiveCategory] = useState<UserCategory>("Admin");
  useEffect(() => () => resultsPreviewAbortRef.current?.abort(), []);

  const refreshResultsInventory = useCallback(async (signal?: AbortSignal) => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const response = await fetch("/api/imports/results?inventory=1", { cache: "no-store", signal });
      const payload = await readResultsApiPayload<ResultsInventoryResponse>(response, "Não foi possível consultar as publicações vigentes.");
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Inventário indisponível.");
      if (!signal?.aborted) setResultsInventory(payload);
    } catch (error) {
      if (!signal?.aborted) {
        setResultsInventory(null);
        setInventoryError(toActionableErrorMessage(error, "Inventário indisponível; o estado vigente não foi confirmado."));
      }
    } finally {
      if (!signal?.aborted) setInventoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void refreshResultsInventory(controller.signal); });
    return () => controller.abort();
  }, [refreshResultsInventory]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
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

  const canImportSpreadsheets = hasPrivilege(activeCategory, "data.import");
  const selectedResultPublicationScope = useMemo(() => {
    if (!resultsPreview || !selectedResultCampaigns.length) return null;
    return planCampaignPublicationScope(resultsPreview.currentCampaigns, resultsPreview.campaigns
      .filter((campaign) => selectedResultCampaigns.includes(campaign.code))
      .map((campaign) => ({ campaignCode: campaign.code, publicationKey: campaign.publicationKey })));
  }, [selectedResultCampaigns, resultsPreview]);

  const viewSpreadsheets = useMemo(
    (): StoredSpreadsheet[] => (resultsInventory?.campaigns ?? []).map((item) => ({
      id: `${item.campaignCode}:${item.publicationId}`, campaign: item.canonicalName,
      campaignCode: item.campaignCode, publicationId: item.publicationId,
      canonicalId: item.canonicalId, downloadAvailable: item.downloadAvailable,
      sourceHash: item.source.sha256,
      note: item.sourceAvailability === "missing_source_artifact" ? "Resultados publicados preservados; arquivo-fonte indisponível neste ambiente" : undefined,
      fileName: item.source.fileName, date: new Date(item.publishedAt).toLocaleString("pt-BR"),
      scope: "Ordinária", sizeBytes: 0, status: "PUBLICADA", rows: item.counts.total,
    })),
    [resultsInventory],
  );

  const visibleSpreadsheets = useMemo(() => {
    const normalizedSearch = normalize(searchTerm);

    return viewSpreadsheets.filter((sheet) => normalize(`${sheet.fileName} ${sheet.campaign} ${sheet.status}`).includes(normalizedSearch));
  }, [searchTerm, viewSpreadsheets]);

  async function previewSelectedResultsFile(file: File | null) {
    resultsPreviewAbortRef.current?.abort();
    resultsPreviewAbortRef.current = null;
    setIsPreviewingResults(false);
    setSelectedFileName(file?.name ?? null);
    setResultsPreview(null);
    setSelectedResultCampaigns([]);
    resultsRequestRef.current = null;
    setError(null);
    if (!file) return;

    const controller = new AbortController();
    resultsPreviewAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), RESULTS_IMPORT_TIMEOUT_MS);
    setIsPreviewingResults(true);

    try {
      const previewData = new FormData();
      previewData.append("file", file);
      const response = await fetch("/api/imports/results/preview", {
        method: "POST",
        body: previewData,
        signal: controller.signal,
      });
      const payload = await readResultsApiPayload<ResultsWorkbookPreviewResponse>(
        response,
        "Não foi possível validar a prévia da planilha de Resultados.",
      );
      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload
            ? formatResultsImportError(response.status, payload.error)
            : "Não foi possível validar a prévia da planilha de Resultados.",
        );
      }
      if (resultsPreviewAbortRef.current !== controller) return;
      setResultsPreview(payload);
      setSelectedResultCampaigns(payload.campaigns.map((campaign) => campaign.code));
    } catch (previewError) {
      if (resultsPreviewAbortRef.current !== controller) return;
      setError(
        previewError instanceof DOMException && previewError.name === "AbortError"
          ? "A prévia excedeu 60 segundos ou foi substituída por outro arquivo. Selecione a planilha novamente."
          : toActionableErrorMessage(previewError, "Não foi possível validar a prévia da planilha de Resultados."),
      );
    } finally {
      window.clearTimeout(timeout);
      if (resultsPreviewAbortRef.current === controller) {
        resultsPreviewAbortRef.current = null;
        setIsPreviewingResults(false);
      }
    }
  }

  async function addSpreadsheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!canImportSpreadsheets) {
      setError("A categoria ativa pode consultar Dados, mas não pode importar planilhas.");
      return;
    }

    const form = event.currentTarget;
    const file = new FormData(form).get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("Selecione a planilha de resultados.");
      return;
    }
    if (!resultsPreview || resultsPreview.fileName !== file.name) {
      setError("Aguarde uma prévia válida desta planilha antes de publicar os resultados.");
      return;
    }
    if (resultsPreview.contractVersion !== RESULTS_CONTRACT_VERSION) {
      setError(`O leitor legado identificou ${resultsPreview.contractVersion}; a publicação exige ${RESULTS_CONTRACT_VERSION}.`);
      return;
    }
    if (!selectedResultCampaigns.length) {
      setError("Selecione ao menos uma campanha identificada na prévia antes de publicar.");
      return;
    }

    const operationId = `spreadsheet-import:${file.name}-${crypto.randomUUID()}`;
    const controller = new AbortController();
    let importTimedOut = false;
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
    const resultsTimeout = window.setTimeout(() => {
      importTimedOut = true;
      controller.abort();
    }, RESULTS_IMPORT_TIMEOUT_MS);

    setIsPending(true);
    window.addEventListener(OPERATION_CANCEL_EVENT, cancelHandler);

    try {
      const resultsData = new FormData();
      resultsData.append("file", file);
      for (const code of selectedResultCampaigns) resultsData.append("selectedCampaigns", code);
      resultsData.append("expectedHeads", JSON.stringify(resultsPreview.expectedHeads));
      resultsData.append("sourceSha256", resultsPreview.sourceSha256 ?? "");
      const requestKey = JSON.stringify([resultsPreview.sourceSha256, [...selectedResultCampaigns].sort()]);
      if (resultsRequestRef.current?.key !== requestKey) resultsRequestRef.current = { key: requestKey, id: crypto.randomUUID() };
      resultsData.append("requestId", resultsRequestRef.current.id);
      const response = await fetch("/api/imports/results", {
        method: "POST",
        body: resultsData,
        signal: controller.signal,
      });
      const payload = await readResultsApiPayload<LaboratoryResultsPayload>(
        response,
        "A importação foi interrompida pelo servidor. Tente novamente; se persistir, contate o administrador.",
      );

      if (!response.ok || "error" in payload) {
        if (response.status === 409) {
          setResultsPreview(null);
          setSelectedResultCampaigns([]);
          resultsRequestRef.current = null;
        }
        throw new Error(
          "error" in payload
            ? formatResultsImportError(response.status, payload.error)
            : "A planilha de Resultados não segue o modelo consolidado.",
        );
      }

      const rowCount = payload.campaigns.reduce((sum, item) => sum + item.counts.total, 0);
      setSelectedFileName(null);
      setResultsPreview(null);
      setSelectedResultCampaigns([]);
      resultsRequestRef.current = null;
      form.reset();
      setMessage(`${payload.persistence.message} ${rowCount} pontos de ${payload.campaigns.map((item) => item.campaignCode).join(" e ")} validados.${payload.warnings.length ? ` Atenção: ${payload.warnings.join(" ")}` : ""}`);
    } catch (uploadError) {
      setError(
        importTimedOut
          ? "A importação excedeu 60 segundos. A interface não confirmou a conclusão; consulte o estado da campanha antes de repetir."
          : uploadError instanceof DOMException && uploadError.name === "AbortError"
          ? "Importação cancelada. A interface não confirmou a conclusão; consulte o estado da campanha antes de repetir."
          : toActionableErrorMessage(uploadError, "Não foi possível publicar a planilha."),
      );
    } finally {
      window.clearTimeout(resultsTimeout);
      window.removeEventListener(OPERATION_CANCEL_EVENT, cancelHandler);
      stopOperation();
      setIsPending(false);
      await refreshResultsInventory();
    }
  }

  async function downloadSpreadsheet(sheet: StoredSpreadsheet) {
    if (!sheet.campaignCode || !sheet.publicationId || !sheet.sourceHash || !sheet.downloadAvailable) {
      setError("Esta publicação não tem um arquivo-fonte verificável disponível para download.");
      return;
    }
    try {
      const response = await fetch(`/api/imports/results/template?source=published&campaignCode=${encodeURIComponent(sheet.campaignCode)}&publicationId=${encodeURIComponent(sheet.publicationId)}&sourceHash=${encodeURIComponent(sheet.sourceHash)}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await readResultsApiPayload<{ error: string }>(response, "Fonte indisponível para esta publicação.");
        throw new Error(payload.error);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = sheet.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(toActionableErrorMessage(error, "Não foi possível baixar a fonte desta publicação."));
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumo em uma linha: os 4 cartões anteriores repetiam o mesmo número. */}
      <p role="status" className="type-metadata rounded-xl bg-[var(--surface-soft)] px-4 py-2 font-semibold text-[var(--brand-navy-strong)]">
        {resultsInventory
          ? `${resultsInventory.publishedCount} de ${resultsInventory.totalCampaigns} campanhas com resultados publicados`
          : inventoryLoading ? "Consultando publicações…" : "Estado não confirmado"}
      </p>

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
              <p className="mt-1 rounded bg-[rgba(197,122,0,0.08)] px-2 py-0.5 text-xs font-semibold text-[var(--brand-amber)]">
                Importação bloqueada para a categoria ativa. Revise as permissões em Configurações.
              </p>
            ) : null}
          </div>
          <div className="rounded bg-[var(--surface-soft)] p-1 text-[var(--brand-navy)] shrink-0">
            <DatabaseZap className="h-4 w-4" />
          </div>
        </div>

        <form className="grid gap-2 lg:grid-cols-12" onSubmit={addSpreadsheet}>
          <p className="type-metadata self-center lg:col-span-4">Selecione o arquivo e confira abaixo as campanhas identificadas antes de publicar.</p>
          <label className="type-button flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--brand-navy)]/40 bg-[var(--surface-soft)] px-3 text-[var(--brand-navy-strong)] transition hover:border-[var(--brand-navy)] hover:bg-[var(--brand-blue-soft)] lg:col-span-2">
            <UploadCloud className="h-4 w-4 shrink-0 text-[var(--brand-navy)]" />
            <span className="min-w-0 flex-1 truncate text-center">
              {selectedFileName ?? "Selecionar planilha"}
            </span>
            <input
              ref={fileInputRef}
              name="file"
              type="file"
              accept=".xlsx,.xlsm"
              disabled={!canImportSpreadsheets || isPending}
              className="sr-only"
              onChange={(event) => void previewSelectedResultsFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <button
            type="submit"
            disabled={isPending || isPreviewingResults || !canImportSpreadsheets || !resultsPreview || !selectedResultCampaigns.length}
            className="type-button flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--brand-navy-strong)] px-4 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 lg:col-span-3"
          >
            <UploadCloud className="h-4 w-4" />
            {isPreviewingResults ? "Validando prévia..." : isPending ? "Carregando..." : config.submitLabel}
          </button>
        </form>

        {resultsPreview ? (
          <section
            aria-live="polite"
            aria-label="Prévia da planilha de Resultados"
            className="mt-3 rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="type-eyebrow text-[var(--brand-teal)]">Prévia validada</p>
                <p className="type-caption text-[var(--ink-soft)]">
                  {resultsPreview.molecularRecordCount.toLocaleString("pt-BR")} registros moleculares · {resultsPreview.totalPointCount} pontos
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-[var(--brand-navy-strong)]">
                <span>{resultsPreview.completePointCount} completos</span>
                <span>{resultsPreview.partialPointCount} parciais</span>
                <span>{resultsPreview.unavailablePointCount} indisponíveis</span>
              </div>
            </div>
            <fieldset className="mt-2" disabled={isPending || isPreviewingResults || !canImportSpreadsheets}>
              <legend className="type-label">Campanhas a publicar — todas as presentes no arquivo vêm selecionadas</legend>
              <div className="grid gap-2 sm:grid-cols-2">
              {resultsPreview.campaigns.map((campaign) => (
                <label key={campaign.code} className="type-metadata flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-[var(--surface-soft)] px-3 py-2">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selectedResultCampaigns.includes(campaign.code)} onChange={(event) => {
                    setSelectedResultCampaigns((current) => event.target.checked ? [...current, campaign.code] : current.filter((code) => code !== campaign.code));
                    resultsRequestRef.current = null;
                  }} />
                  <span>
                  <strong className="text-[var(--brand-navy-strong)]">{campaign.code} · {campaign.canonicalName}</strong>
                  <span className="mt-1 block text-[var(--ink-soft)]">
                    {campaign.totalPointCount} pontos · {campaign.completePointCount} completos · {campaign.partialPointCount} parciais · {campaign.unavailablePointCount} indisponíveis
                  </span>
                  </span>
                </label>
              ))}
              </div>
            </fieldset>
            {selectedResultPublicationScope ? (
              <div className="mt-3 rounded-lg border border-slate-200 p-3" aria-label="Escopo da publicação">
                <p className="text-xs font-black text-[var(--brand-navy-strong)]">Escopo da publicação selecionada</p>
                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <PublicationScopeItem label="Adicionar" codes={selectedResultPublicationScope.add} />
                  <PublicationScopeItem label="Substituir integralmente" codes={selectedResultPublicationScope.replace} />
                  <PublicationScopeItem label="Já vigente, sem nova publicação" codes={selectedResultPublicationScope.unchanged} />
                  <PublicationScopeItem label="Preservar fora do escopo" codes={selectedResultPublicationScope.preserve} />
                </dl>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">
                  Cada campanha selecionada substitui seu conjunto inteiro de pontos; campanhas ausentes do arquivo ou desmarcadas permanecem fora do escopo. Não há merge com pontos da publicação anterior. O servidor reconfirma a vigência antes da publicação.
                </p>
              </div>
            ) : null}
            {!selectedResultCampaigns.length ? (
              <p className="mt-2 text-xs font-semibold text-[var(--brand-amber)]">
                Selecione ao menos uma campanha antes de publicar.
              </p>
            ) : null}
            {resultsPreview.warnings.length ? (
              <p className="mt-2 text-xs text-[var(--brand-amber)]">Atenção: {resultsPreview.warnings.join(" ")}</p>
            ) : null}
          </section>
        ) : null}

        {message ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--status-success-soft)] px-4 py-3 text-xs font-semibold text-[var(--status-success-strong)]">
            <span>{message}</span>
              </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-[rgba(186,26,26,0.08)] px-4 py-3 type-metadata font-semibold text-[var(--brand-danger)]">
            {error}
          </p>
        ) : null}
        {selectedFileName && !resultsPreview ? <button type="button" disabled={isPending || isPreviewingResults || !canImportSpreadsheets} className="type-button mt-2 min-h-11 rounded border border-[var(--line-ghost)] px-3 disabled:opacity-50" onClick={() => void previewSelectedResultsFile(fileInputRef.current?.files?.[0] ?? null)}>Revalidar prévia do arquivo selecionado</button> : null}
      </section>

      <ResultsPreparationPanel canImport={canImportSpreadsheets} />
      {!!resultsInventory?.historicalPublications?.length && <section className="space-y-2" aria-label="Histórico sem campanha demonstrada">
        <h3 className="type-panel-title">Histórico preservado — sem campanha demonstrada</h3>
        <p className="type-metadata">Estes registros não foram atribuídos a uma campanha e não substituem publicações vigentes. Arquivo-fonte indisponível; download não oferecido.</p>
        <ul className="space-y-2">{resultsInventory.historicalPublications.map((item) => <li key={item.publicationId} className="type-metadata break-words">{item.publicationId} · {item.createdAt} · {item.format} · {item.recordCount === null ? "Quantidade não informada" : `${item.recordCount} registros`}</li>)}</ul>
      </section>}
      <section className="space-y-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="heading-font type-panel-title">Publicações vigentes</h3>
            <button type="button" disabled={inventoryLoading || isPending} className="type-button min-h-11 rounded border border-[var(--line-ghost)] px-3 disabled:opacity-50" onClick={() => void refreshResultsInventory()}>{inventoryLoading ? "Consultando…" : "Atualizar lista"}</button>
          </div>
          <ResultsInterpretationHelp><p>O download contém o arquivo-fonte integral da publicação, podendo incluir outras campanhas. Não é um recorte da campanha selecionada.</p><p>A última publicação válida é a fonte de consulta. A prévia permite conferir as campanhas antes de publicar; arquivos inválidos não substituem publicações vigentes.</p></ResultsInterpretationHelp>
          {inventoryError ? <p role="alert" className="type-metadata text-[var(--brand-danger)]">{inventoryError}</p> : null}
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">

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

        <div className="glass-panel overflow-x-auto radius-panel">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="px-4 py-2 text-caption font-bold text-slate-500">
                  Campanha
                </th>
                <th className="px-4 py-2 text-caption font-bold text-slate-500">
                  Data de Importação
                </th>
                <th className="px-4 py-2 text-caption font-bold text-slate-500">
                  Status
                </th>
                <th className="px-4 py-2 text-caption font-bold text-slate-500">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="type-table divide-y divide-slate-50">
              {!hasLoaded || inventoryLoading ? (
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
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {sheet.fileName}
                          {sheet.rows !== undefined ? ` • ${sheet.rows} pontos` : ""}
                          {sheet.sheets ? ` • ${sheet.sheets} abas` : ""}
                          {sheet.note ? ` • Obs: "${sheet.note}"` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{sheet.date}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-sm border-l-[3px] px-2 py-0.5 text-caption font-bold ${statusClass(sheet.status)}`}>
                      {SHEET_STATUS_LABELS[sheet.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        aria-label={`Baixar ${sheet.fileName}`}
                        disabled={!sheet.downloadAvailable || !sheet.sourceHash}
                        title={!sheet.downloadAvailable ? "Fonte verificável indisponível nesta publicação" : "Baixar arquivo-fonte integral"}
                        className="min-h-11 min-w-11 rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50"
                        onClick={() => void downloadSpreadsheet(sheet)}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>

          {hasLoaded && !visibleSpreadsheets.length && !inventoryLoading && resultsInventory ? (
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


function PublicationScopeItem({ label, codes }: { label: string; codes: string[] }) {
  return (
    <div className="rounded bg-[var(--surface-soft)] px-2 py-1.5">
      <dt className="font-bold text-[var(--ink-soft)]">{label}</dt>
      <dd className="mt-0.5 font-black text-[var(--brand-navy-strong)]">{codes.join(", ") || "Nenhuma"}</dd>
    </div>
  );
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// O valor interno fica em caixa alta; a tela mostra a palavra comum.
const SHEET_STATUS_LABELS: Record<SheetStatus, string> = { CARREGADA: "Carregada", PUBLICADA: "Publicada", PREVIEW: "Prévia", ERRO: "Erro" };

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
