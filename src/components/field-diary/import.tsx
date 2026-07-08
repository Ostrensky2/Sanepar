"use client";

import { AlertTriangle, CheckCircle2, Download, LoaderCircle, Sheet, UploadCloud } from "lucide-react";
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

type ImportReport = {
  novos: number;
  atualizados: number;
  inalterados: number;
  conflitantes: number;
  forcados: number;
  ausentes: number;
  detalhes: {
    conflitantes: string[];
    ausentes: string[];
  };
};

type ImportConflictDetail = {
  key: string;
  location: string;
  day: number;
  date: string;
  fields: Array<{ field: string; app: string; sheet: string }>;
};

type PreviewResult = {
  preview: true;
  wouldWrite: number;
  errors: string[];
  report: ImportReport;
  conflicts: ImportConflictDetail[];
};

type ApplyResult = {
  saved: number;
  errors: string[];
  entries: FieldDiaryEntry[];
  report?: ImportReport;
  conflicts?: ImportConflictDetail[];
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
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyFile(file: File) {
    setSelectedFileName(file.name);
    setPreview(null);
    setResult(null);
    setError(null);
    setForce(false);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
  }

  async function runImport(mode: "preview" | "apply", withForce: boolean) {
    const file = fileInputRef.current?.files?.[0];
    if (!file || file.size === 0) {
      setError("Selecione um arquivo .xlsx para importar.");
      return null;
    }

    setIsPending(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);
    if (withForce) {
      formData.append("force", "true");
    }

    const operationId = `field-diary-import:${crypto.randomUUID()}`;
    const controller = new AbortController();
    const stopOperation = beginGlobalOperation({
      id: operationId,
      title: mode === "preview" ? "Pré-visualizando importação..." : "Gravando Diário de Campo...",
      description:
        mode === "preview"
          ? "Comparando a planilha com o que já existe no aplicativo."
          : "Aplicando novos, atualizados e (se marcado) conflitos forçados.",
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
      const payload = (await response.json()) as { error?: string } & Record<string, unknown>;

      if (!response.ok || "error" in payload) {
        throw new Error(payload.error ?? "Erro ao processar a planilha.");
      }

      return payload;
    } catch (importError) {
      const message =
        importError instanceof DOMException && importError.name === "AbortError"
          ? "Operação cancelada. Nenhum registro foi alterado."
          : toActionableErrorMessage(importError, "Não foi possível processar a planilha do Diário de Campo.");
      setError(message);
      if (isCloudConnectionError(importError)) {
        emitLocalMode("Falha durante a importação do Diário de Campo. Dados podem não ter sincronizado com a nuvem.");
      }
      return null;
    } finally {
      window.removeEventListener(OPERATION_CANCEL_EVENT, cancelHandler);
      stopOperation();
      setIsPending(false);
    }
  }

  async function handlePreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const payload = await runImport("preview", false);
    if (payload) {
      setPreview(payload as unknown as PreviewResult);
    }
  }

  async function handleApply() {
    const payload = await runImport("apply", force);
    if (!payload) {
      return;
    }
    const applied = payload as unknown as ApplyResult;
    if (applied.errors?.some((item) => /banco|supabase|nuvem/i.test(item))) {
      emitLocalMode("O Diário de Campo foi importado no navegador, mas a nuvem não confirmou todos os registros.");
    }
    setResult(applied);
    setPreview(null);
  }

  const hasConflicts = (preview?.report.conflitantes ?? 0) > 0;

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
              A importação primeiro mostra uma prévia (o que muda) e só grava após sua confirmação. Nada é apagado automaticamente.
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

        {!result ? (
          <form onSubmit={(e) => void handlePreview(e)} className="space-y-4">
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
                Pré-visualizar
              </button>
            </div>
          </form>
        ) : null}

        {error ? (
          <div className="rounded-2xl bg-[rgba(186,26,26,0.08)] p-4 text-sm text-[var(--brand-danger)]">{error}</div>
        ) : null}

        {preview && !result ? (
          <div className="space-y-3">
            <ImportReportPanel report={preview.report} title="Prévia — o que será gravado" />
            {preview.conflicts.length > 0 ? (
              <ConflictsPanel conflicts={preview.conflicts} />
            ) : null}

            {hasConflicts ? (
              <label className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-[rgba(234,179,8,0.08)] p-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <strong>Sobrescrever dados revisados/consolidados</strong> com a planilha nos conflitos acima.
                  Sem marcar, os conflitos são mantidos como estão no app (nada é sobrescrito).
                </span>
              </label>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setPreview(null); setForce(false); }}
                className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => void handleApply()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmar e gravar
              </button>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[rgba(5,150,105,0.10)] p-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{result.saved} registro(s) gravado(s) (novos + atualizados + forçados).</span>
              <button
                type="button"
                onClick={() => onImported(result.entries)}
                className="ml-auto rounded-full bg-emerald-800 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-900"
              >
                Fechar e ver registros
              </button>
            </div>
            {result.report ? <ImportReportPanel report={result.report} title="Relatório da importação" /> : null}
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

function ImportReportPanel({ report, title }: { report: ImportReport; title: string }) {
  const chips: Array<{ label: string; value: number; tone: string }> = [
    { label: "Novos", value: report.novos, tone: "text-emerald-800 bg-[rgba(5,150,105,0.10)]" },
    { label: "Atualizados", value: report.atualizados, tone: "text-sky-800 bg-[rgba(2,132,199,0.10)]" },
    { label: "Inalterados", value: report.inalterados, tone: "text-slate-600 bg-[var(--surface-soft)]" },
    { label: "Conflitantes", value: report.conflitantes, tone: "text-amber-900 bg-[rgba(234,179,8,0.14)]" },
    { label: "Forçados", value: report.forcados, tone: "text-fuchsia-900 bg-[rgba(192,38,211,0.10)]" },
    { label: "Ausentes", value: report.ausentes, tone: "text-rose-900 bg-[rgba(190,18,60,0.10)]" },
  ];

  return (
    <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--brand-navy-strong)]">{title}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {chips.map((chip) => (
          <div key={chip.label} className={`rounded-xl px-3 py-2 ${chip.tone}`}>
            <div className="text-lg font-black leading-none">{chip.value}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em]">{chip.label}</div>
          </div>
        ))}
      </div>

      {report.ausentes > 0 ? (
        <ImportReportList
          title="Ausentes nesta planilha (não apagados — marcados para revisão)"
          items={report.detalhes.ausentes}
        />
      ) : null}
    </div>
  );
}

function ImportReportList({ title, items }: { title: string; items: string[] }) {
  const shown = items.slice(0, 12);
  const rest = items.length - shown.length;

  return (
    <div className="mt-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-soft)]">{title}</p>
      <ul className="space-y-0.5">
        {shown.map((item, i) => (
          <li key={i} className="text-xs text-[var(--ink-soft)]">• {item}</li>
        ))}
        {rest > 0 ? <li className="text-xs font-semibold text-[var(--ink-soft)]">…e mais {rest}.</li> : null}
      </ul>
    </div>
  );
}

function ConflictsPanel({ conflicts }: { conflicts: ImportConflictDetail[] }) {
  const shown = conflicts.slice(0, 8);
  const rest = conflicts.length - shown.length;

  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-4">
      <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        Conflitos — app × planilha
      </p>
      <div className="space-y-3">
        {shown.map((conflict) => (
          <div key={conflict.key} className="rounded-xl border border-[var(--line-ghost)] p-3">
            <p className="mb-1.5 text-xs font-bold text-[var(--brand-navy-strong)]">
              {conflict.location} · Dia {conflict.day} · {conflict.date}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    <th className="pr-2">Campo</th>
                    <th className="pr-2">No app (mantido)</th>
                    <th>Na planilha</th>
                  </tr>
                </thead>
                <tbody>
                  {conflict.fields.map((field) => (
                    <tr key={field.field} className="align-top">
                      <td className="pr-2 py-0.5 font-semibold text-slate-600">{field.field}</td>
                      <td className="pr-2 py-0.5 text-slate-700">{field.app || "—"}</td>
                      <td className="py-0.5 text-slate-700">{field.sheet || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {rest > 0 ? <p className="text-xs font-semibold text-[var(--ink-soft)]">…e mais {rest} conflito(s).</p> : null}
      </div>
    </div>
  );
}
