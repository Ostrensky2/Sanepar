"use client";

import { FormEvent, useRef, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Download,
  LoaderCircle,
  Sheet,
  UploadCloud,
  X,
} from "lucide-react";
import { type PointActionEvent } from "@/lib/point-actions";

type ImportResult = {
  events: PointActionEvent[];
  errors: string[];
  eventCount: number;
  pointCount: number;
};

export function PointActionsImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (events: PointActionEvent[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyFile(file: File) {
    setSelectedFileName(file.name);
    setResult(null);
    setDialogError(null);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setDialogError("Selecione um arquivo .xlsx para importar.");
      return;
    }
    setIsPending(true);
    setDialogError(null);
    setResult(null);

    const response = await fetch("/api/point-actions/import", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as ImportResult | { error: string };

    if (!response.ok || "error" in payload) {
      setDialogError("error" in payload ? payload.error : "Erro ao processar a planilha.");
      setIsPending(false);
      return;
    }
    setResult(payload as ImportResult);
    setIsPending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-3xl radius-panel bg-white p-5 shadow-[0_28px_90px_-24px_rgba(0,0,0,0.45)]">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--line-ghost)] pb-4">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-[var(--brand-blue-soft)] p-3 text-[var(--brand-navy-strong)]">
              <ClipboardList className="h-5 w-5" />
            </span>
            <h2 className="heading-font text-2xl font-black text-[var(--brand-navy-strong)]">
              Importar ações pontuais via planilha
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-[var(--surface-soft)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-4">
            <div className="rounded-xl bg-white p-2 text-[var(--brand-blue)]">
              <Sheet className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--brand-navy-strong)]">
                Template oficial
              </p>
              <p className="text-xs text-[var(--ink-soft)]">
                Baixe o modelo antes de preencher e importar. Linhas com o mesmo evento serão agrupadas.
              </p>
            </div>
            <a
              href="/template-acoes-pontuais.xlsx"
              download
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-2.5 text-sm font-bold text-[#ffffff] transition hover:bg-[var(--brand-navy)]"
            >
              <Download className="h-4 w-4" />
              Baixar template
            </a>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <label
              className={`block cursor-pointer rounded-2xl border-2 p-5 text-sm transition-colors ${
                isDragging
                  ? "border-[var(--brand-blue)] bg-[var(--brand-blue-soft)]"
                  : "border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)]"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) applyFile(f);
              }}
            >
              <span className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-[0_18px_40px_-34px_rgba(0,66,98,0.18)]">
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-navy-strong)] px-4 py-2.5 text-sm font-bold text-[#ffffff]">
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
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) applyFile(f);
                }}
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-[#ffffff] transition hover:bg-[var(--brand-navy)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                Importar registros
              </button>
            </div>
          </form>

          {dialogError ? (
            <div className="rounded-2xl bg-[rgba(186,26,26,0.08)] p-4 text-sm text-[var(--brand-danger)]">
              {dialogError}
            </div>
          ) : null}

          {result ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[rgba(5,150,105,0.10)] p-4 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>
                  {result.eventCount} evento(s) e {result.pointCount} ponto(s) prontos para importar.
                </span>
                {result.eventCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => onImported(result.events)}
                    className="ml-auto rounded-full bg-emerald-800 px-4 py-1.5 text-xs font-bold text-[#ffffff] transition hover:bg-emerald-900"
                  >
                    Confirmar e registrar
                  </button>
                ) : null}
              </div>
              {result.errors.length > 0 ? (
                <div className="rounded-2xl bg-[rgba(186,26,26,0.06)] p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand-danger)]">
                    {result.errors.length} linha(s) com erro
                  </p>
                  <ul className="space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={i} className="text-xs text-[var(--brand-danger)]">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}


