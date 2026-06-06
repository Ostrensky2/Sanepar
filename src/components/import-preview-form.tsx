"use client";

import { startTransition, useDeferredValue, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  FileSearch,
  LoaderCircle,
  Sheet,
  UploadCloud,
} from "lucide-react";
import { StatusChip } from "@/components/status-chip";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import type { CampaignImportPreview, SpreadsheetPreview } from "@/lib/types";
import { formatCompactNumber } from "@/lib/utils";

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
};

type ImportPreviewFormProps = {
  kind?: "field" | "results";
};

const importCopy = {
  field: {
    title: "Planilha de Campo será atualizada",
    description:
      "Envie a planilha de Campo. A aba Campanhas é validada e o mapa é atualizado ao publicar.",
    emptyFile: "A planilha de Campo da campanha deve ser selecionada.",
    publishLabel: "Mapa da campanha será publicado",
  },
  results: {
    title: "Planilha de Resultados será atualizada",
    description:
      "Envie a planilha de Resultados laboratoriais. O preview é gerado até a publicação.",
    emptyFile: "A planilha de Resultados da campanha deve ser selecionada.",
    publishLabel: "Resultados serão publicados",
  },
};

export function ImportPreviewForm({ kind = "field" }: ImportPreviewFormProps) {
  const [preview, setPreview] = useState<CampaignImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deferredPreview = useDeferredValue(preview);

  function applyFile(file: File) {
    setSelectedFileName(file.name);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) applyFile(file);
  }
  const copy = importCopy[kind];
  const inputId = `import-file-${kind}`;

  async function submitFile(formData: FormData, action: "preview" | "publish") {
    setIsPending(true);
    setError(null);
    setSuccess(null);

    const response = await fetch(
      action === "preview" ? "/api/imports/preview" : "/api/imports/campaigns",
      {
        method: "POST",
        body: formData,
      },
    );

    const payload = (await response.json()) as
      | SpreadsheetPreview
      | CampaignPublishPayload
      | { error: string };

    if (!response.ok || "error" in payload) {
      setPreview(null);
      setError("error" in payload ? payload.error : "Não foi possível ler a planilha.");
      setIsPending(false);
      return;
    }

    if (action === "publish" && "points" in payload) {
      if (payload.persistence.mode !== "cloud" && !canUseBrowserOnlyPersistence()) {
        setPreview(null);
        setError(payload.persistence.message);
        setIsPending(false);
        return;
      }

      if (payload.persistence.mode === "cloud" || canUseBrowserOnlyPersistence()) {
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

      setPreview(withCampaignSummary(payload.preview, payload));
      setSuccess(payload.persistence.message);
      setIsPending(false);
      return;
    }

    setPreview(payload as SpreadsheetPreview);
    setIsPending(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const action =
      submitter instanceof HTMLButtonElement && submitter.value === "publish"
        ? "publish"
        : "preview";
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError(copy.emptyFile);
      setPreview(null);
      setSuccess(null);
      return;
    }

    if (kind === "results" && action === "publish") {
      setError(
        "A publicação de resultados será habilitada quando o modelo da planilha for homologado. A estrutura deve ser validada pelo preview.",
      );
      setSuccess(null);
      return;
    }

    startTransition(() => {
      void submitFile(formData, action);
    });
  }

  return (
    <div className="space-y-5">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label
          className={`block rounded-[24px] border-2 p-5 text-sm text-[var(--ink-soft)] transition-colors ${
            isDragging
              ? "border-[var(--brand-blue)] bg-[var(--brand-blue-soft)]"
              : "border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)]"
          }`}
          htmlFor={inputId}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="mb-2 block font-semibold text-[var(--brand-navy-strong)]">
            {copy.title}
          </span>
          <span className="block leading-6">
            {copy.description}
          </span>
          <span className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_18px_40px_-34px_rgba(0,66,98,0.18)]">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-navy-strong)] px-5 py-3 text-sm font-bold text-white transition hover:brightness-105">
              <UploadCloud className="h-4 w-4" />
              {isDragging ? "Solte aqui" : "Selecionar planilha"}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink-soft)]">
              {selectedFileName ?? "Arraste um arquivo .xlsx ou clique para selecionar"}
            </span>
          </span>
          <input
            ref={fileInputRef}
            id={inputId}
            name="file"
            type="file"
            accept=".xlsx,.xlsm"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) setSelectedFileName(file.name);
            }}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            name="action"
            value="preview"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-soft)] px-5 py-3 text-sm font-semibold text-[var(--brand-navy-strong)] transition hover:bg-[var(--brand-blue-soft)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileSearch className="h-4 w-4" />
            )}
            Preview será gerado
          </button>

          <button
            type="submit"
            name="action"
            value="publish"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--brand-navy-strong),var(--brand-teal))] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            {copy.publishLabel}
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-[24px] bg-[rgba(186,26,26,0.08)] p-4 text-sm text-[var(--brand-danger)]">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-[rgba(5,150,105,0.10)] p-4 text-sm font-medium text-emerald-800">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </span>
          <Link
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand-navy-strong)]"
            href="/"
          >
            Abrir painel
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

      {deferredPreview ? (
        <div className="space-y-4 rounded-[28px] bg-[var(--surface-soft)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="heading-font text-lg font-bold text-[var(--brand-navy-strong)]">
                {deferredPreview.fileName}
              </p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                {deferredPreview.sheetCount} abas e{" "}
                {formatCompactNumber(deferredPreview.totalRows)} linhas identificadas
              </p>
            </div>
            <StatusChip
              label={
                deferredPreview.campaignPoints ? "campanhas vinculadas" : "preview local"
              }
              tone={deferredPreview.campaignPoints ? "success" : "primary"}
            />
          </div>

          {deferredPreview.campaignPoints ? (
            <div className="grid gap-3 md:grid-cols-3">
              <ImportMetric label="Registros" value={deferredPreview.campaignPoints.total} />
              <ImportMetric
                label="Previstos"
                value={deferredPreview.campaignPoints.original}
              />
              <ImportMetric
                label="Efetivos"
                value={deferredPreview.campaignPoints.effective}
              />
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {deferredPreview.sheets.map((sheet) => (
              <article
                key={sheet.name}
                className="rounded-[24px] border border-[var(--line-ghost)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(0,66,98,0.22)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--brand-navy-strong)]">
                      {sheet.name}
                    </p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {sheet.rowCount} linhas, {sheet.columnCount} colunas
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-soft)] p-2 text-[var(--brand-blue)]">
                    <Sheet className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusChip label={sheet.recommendedEntity} tone="neutral" />
                  {sheet.headers.map((header) => (
                    <span
                      key={`${sheet.name}-${header}`}
                      className="rounded-full bg-[var(--brand-blue-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-navy)]"
                    >
                      {header}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function withCampaignSummary(
  preview: SpreadsheetPreview,
  payload: CampaignPublishPayload,
): CampaignImportPreview {
  return {
    ...preview,
    campaignPoints: {
      total: payload.points.length,
      original: payload.originalPointCount,
      effective: payload.effectivePointCount,
      missingFields: payload.missingFields,
    },
  };
}

function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">
        {formatCompactNumber(value)}
      </p>
    </div>
  );
}
