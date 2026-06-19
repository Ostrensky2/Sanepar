"use client";

import { CheckCircle2, Download, LoaderCircle, Sheet, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import {
  OPERATION_CANCEL_EVENT,
  beginGlobalOperation,
  emitLocalMode,
  isCloudConnectionError,
  toActionableErrorMessage,
} from "@/components/operational-feedback";
import { Dialog } from "@/components/field-diary/ui";
import type { FieldDiaryEntry } from "@/lib/field-diary";

type ImportResult = {
  saved: number;
  errors: string[];
  entries: FieldDiaryEntry[];
};

export function FieldDiaryImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (entries: FieldDiaryEntry[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyFile(file: File) {
    setSelectedFileName(file.name);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecione um arquivo .xlsx para importar.");
      return;
    }
    setIsPending(true);
    setError(null);
    setResult(null);

    const operationId = `field-diary-import:${crypto.randomUUID()}`;
    const controller = new AbortController();
    const stopOperation = beginGlobalOperation({
      id: operationId,
      title: "Carregando Diário de Campo...",
      description: "Lendo a planilha, validando registros e preparando a sincronização.",
      cancelable: true,
    });
    const cancelHandler = (cancelEvent: Event) => {
      const detail = (cancelEvent as CustomEvent<{ id: string }>).detail;
      if (detail?.id === operationId) {
        controller.abort();
      }
    };

    window.addEventListener(OPERATION_CANCEL_EVENT, cancelHandler);

    try {
      const response = await fetch("/api/field-diary/import", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = (await response.json()) as ImportResult | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Erro ao processar a planilha.");
      }

      if (payload.errors.some((item) => /banco|supabase|nuvem/i.test(item))) {
        emitLocalMode("O Diário de Campo foi importado no navegador, mas a nuvem não confirmou todos os registros.");
      }

      setResult(payload as ImportResult);
    } catch (importError) {
      const message =
        importError instanceof DOMException && importError.name === "AbortError"
          ? "Importação cancelada. Nenhum registro novo foi aplicado."
          : toActionableErrorMessage(
              importError,
              "Não foi possível processar a planilha do Diário de Campo.",
            );
      setError(message);
      if (isCloudConnectionError(importError)) {
        emitLocalMode("Falha durante importação do Diário de Campo. Dados podem não ter sincronizado com a nuvem.");
      }
    } finally {
      window.removeEventListener(OPERATION_CANCEL_EVENT, cancelHandler);
      stopOperation();
      setIsPending(false);
    }
  }

  return (
    <Dialog title="Importar via planilha" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-4">
          <div className="rounded-xl bg-white p-2 text-[var(--brand-blue)]">
            <Sheet className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--brand-navy-strong)]">Planilha de ocorrências do Diário</p>
            <p className="text-xs text-[var(--ink-soft)]">
              Use uma planilha própria de registros diários; a planilha-síntese das campanhas fica reservada para mapas e pontos.
            </p>
          </div>
          <a
            href="/template-diario-de-campo.xlsx"
            download
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-2.5 text-sm font-bold text-[#ffffff] transition hover:bg-[var(--brand-navy)]"
          >
            <Download className="h-4 w-4" />
            Baixar modelo do Diário
          </a>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label
            className={`block cursor-pointer rounded-2xl border-2 p-5 text-sm transition-colors ${
              isDragging
                ? "border-[var(--brand-blue)] bg-[var(--brand-blue-soft)]"
                : "border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)]"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) applyFile(f); }}
          >
            <span className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-[0_18px_40px_-34px_rgba(0,66,98,0.18)]">
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-navy-strong)] px-4 py-2.5 text-sm font-bold text-white">
                <UploadCloud className="h-4 w-4" />
                {isDragging ? "Solte aqui" : "Selecionar planilha"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink-soft)]">
                {selectedFileName ?? "Arraste um arquivo .xlsx ou clique para selecionar"}
              </span>
            </span>
            <input
              ref={fileInputRef}
              name="file"
              type="file"
              accept=".xlsx,.xlsm"
              className="sr-only"
              onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) applyFile(f); }}
            />
          </label>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedFileName}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Importar registros
            </button>
          </div>
        </form>

        {error ? (
          <div className="rounded-2xl bg-[rgba(186,26,26,0.08)] p-4 text-sm text-[var(--brand-danger)]">{error}</div>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[rgba(5,150,105,0.10)] p-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{result.entries.length} registro(s) importado(s) com sucesso.</span>
              {result.entries.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onImported(result.entries)}
                  className="ml-auto rounded-full bg-emerald-800 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-900"
                >
                  Fechar e ver registros
                </button>
              ) : null}
            </div>
            {result.errors.length > 0 ? (
              <div className="rounded-2xl bg-[rgba(234,179,8,0.12)] p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
                  {result.errors.length} aviso(s)
                </p>
                <ul className="space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-xs text-amber-900">{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
