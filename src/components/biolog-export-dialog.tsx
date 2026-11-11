"use client";

import { Download, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  biologExportFileName,
  buildBiologExport,
  describeBiologExport,
  groupBiologExportIssues,
  type BiologExport,
  type BiologExportIssueGroup,
} from "@/lib/biolog-export";
import { fetchBiologExportData, markSamplesExported, type MarkExportedResult } from "@/lib/biolog-export-client";
import { addBiologExportSheets } from "@/lib/biolog-export-workbook";
import { downloadWorkbook } from "@/lib/campaign-workbook-export";
import type { FieldDiaryEntry } from "@/lib/field-diary";
import type { CollectionDefaults } from "@/lib/field-standard";

type Phase =
  | { step: "loading" }
  | { step: "unavailable" }
  | { step: "error"; message: string }
  | { step: "ready"; data: BiologExport }
  | { step: "generating"; data: BiologExport }
  | { step: "done"; data: BiologExport; fileName: string; notes: string[] };

const primaryButtonClassName =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:opacity-60";
const secondaryButtonClassName =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] disabled:opacity-60";

/**
 * Planilha para o Biolog de uma campanha: lê as amostras e as medições de todos os
 * registros, mostra o que vai e o que falta, e gera o arquivo. Depois de gerar,
 * marca as amostras como exportadas (o código delas deixa de mudar).
 */
export function BiologExportDialog({
  campaignLabel,
  entries,
  defaults,
  onClose,
}: {
  /** Nome da campanha como a pessoa vê na tela. */
  campaignLabel: string;
  /** Registros de campo da campanha. */
  entries: FieldDiaryEntry[];
  /** Padrões de coleta que valem para a campanha. */
  defaults: CollectionDefaults;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ step: "loading" });
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  // O que estava na tela quando a pessoa abriu: a lista de registros se atualiza
  // sozinha por baixo, e a planilha não pode mudar no meio da conferência.
  const [snapshot] = useState(() => ({ entries, defaults }));
  const campaignNames = useMemo(
    () => [...new Set(snapshot.entries.map((entry) => entry.campaignName))],
    [snapshot],
  );

  useEffect(() => {
    let active = true;

    void fetchBiologExportData(campaignNames).then((result) => {
      if (!active) {
        return;
      }

      if (!result.ok) {
        setPhase({ step: "error", message: result.error });
        return;
      }

      if (!result.available) {
        setPhase({ step: "unavailable" });
        return;
      }

      setPhase({
        step: "ready",
        data: buildBiologExport({
          entries: snapshot.entries,
          samples: result.samples,
          readings: result.readings,
          catalog: result.parameters,
          defaultsFor: () => snapshot.defaults,
        }),
      });
    });

    return () => {
      active = false;
    };
  }, [attempt, campaignNames, snapshot]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function generate(data: BiologExport) {
    setPhase({ step: "generating", data });

    const fileName = biologExportFileName(campaignLabel, new Date());

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();

      workbook.creator = "Yva'e Monitoramento";
      workbook.created = new Date();
      workbook.modified = new Date();
      addBiologExportSheets(workbook, data);
      await downloadWorkbook(workbook, fileName);
    } catch {
      setPhase({ step: "error", message: "Não foi possível gerar a planilha agora." });
      return;
    }

    // Só depois que o arquivo saiu: daqui em diante o código dessas amostras não muda.
    const marked = await markSamplesExported(data.sampleIds);

    setPhase({ step: "done", data, fileName, notes: [describeMark(marked, data.counts.samples)] });
    scrollRef.current?.scrollTo({ top: 0 });
  }

  const data = "data" in phase ? phase.data : null;
  const issues = data ? groupBiologExportIssues(data.issues) : null;
  const summary = data ? describeBiologExport(data.counts) : [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(0,37,56,0.42)] sm:items-center sm:px-4 sm:py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="biolog-export-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-[var(--line-ghost)] bg-white text-[var(--ink)] shadow-[0_30px_80px_-40px_rgba(0,37,56,0.42)] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line-ghost)] px-5 py-4">
          <div className="min-w-0">
            <h3 id="biolog-export-title" className="heading-font type-panel-title text-[var(--brand-navy-strong)]">
              Planilha para o Biolog
            </h3>
            <p className="type-help mt-1 text-[var(--ink-soft)]">{campaignLabel}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Fechar a planilha para o Biolog"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* O resultado fica no alto, à vista, sem precisar rolar a lista de pendências. */}
          {phase.step === "done" ? (
            <div role="status" className="space-y-1 rounded-xl bg-[var(--surface-soft)] px-3 py-3 text-sm text-[var(--ink)]">
              <p className="break-words font-bold text-[var(--brand-navy-strong)]">Planilha gerada: {phase.fileName}</p>
              {phase.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
              <p>No Biolog, importe em Amostras, Curadoria, Importar Excel.</p>
            </div>
          ) : null}

          {phase.step === "loading" ? (
            <p role="status" className="text-sm text-[var(--ink-soft)]">
              Lendo as amostras da campanha…
            </p>
          ) : null}

          {phase.step === "unavailable" ? (
            <p role="status" className="text-sm text-[var(--ink)]">
              O banco ainda não recebeu a atualização das amostras do ponto. A planilha para o Biolog fica disponível
              assim que ela for aplicada.
            </p>
          ) : null}

          {phase.step === "error" ? (
            <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-[var(--brand-danger)]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{phase.message}</span>
            </p>
          ) : null}

          {data && !data.counts.samples ? (
            <p role="status" className="text-sm text-[var(--ink)]">
              Nenhum registro de campo desta campanha tem amostra. A planilha para o Biolog sai das amostras lançadas em
              “Amostras do ponto”, dentro do registro de campo.
            </p>
          ) : null}

          {data && data.counts.samples ? (
            <>
              <div className="space-y-1 text-sm text-[var(--ink)]">
                {summary.map((line, index) => (
                  <p key={line} className={index === 0 ? "font-bold text-[var(--brand-navy-strong)]" : ""}>
                    {line}
                  </p>
                ))}
              </div>

              {issues?.blocking.length ? (
                <IssueList
                  tone="blocking"
                  title={
                    data.counts.blockedSamples === 1
                      ? "O Biolog recusa 1 amostra enquanto isto não for corrigido"
                      : `O Biolog recusa ${data.counts.blockedSamples} amostras enquanto isto não for corrigido`
                  }
                  groups={issues.blocking}
                />
              ) : null}

              {issues?.toCheck.length ? <IssueList tone="check" title="Vale conferir" groups={issues.toCheck} /> : null}

              {!issues?.blocking.length && !issues?.toCheck.length ? (
                <p className="text-sm text-[var(--ink-soft)]">Nenhuma pendência encontrada nos registros.</p>
              ) : null}
            </>
          ) : null}

        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--line-ghost)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--ink-soft)]">
            {(phase.step === "ready" || phase.step === "generating") && data?.counts.samples
              ? "Ao gerar a planilha, o código dessas amostras não muda mais."
              : ""}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className={secondaryButtonClassName} onClick={onClose}>
              Fechar
            </button>
            {phase.step === "error" ? (
              <button
                type="button"
                className={primaryButtonClassName}
                onClick={() => {
                  setPhase({ step: "loading" });
                  setAttempt((value) => value + 1);
                }}
              >
                Tentar de novo
              </button>
            ) : null}
            {data && data.counts.samples ? (
              <button
                type="button"
                className={primaryButtonClassName}
                disabled={phase.step === "generating"}
                onClick={() => void generate(data)}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {phase.step === "generating" ? "Gerando…" : phase.step === "done" ? "Gerar de novo" : "Gerar planilha"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function IssueList({
  tone,
  title,
  groups,
}: {
  tone: "blocking" | "check";
  title: string;
  groups: BiologExportIssueGroup[];
}) {
  return (
    <section
      className={`rounded-xl border px-3 py-3 ${
        tone === "blocking" ? "border-amber-400 bg-amber-50" : "border-[var(--line-ghost)] bg-[var(--surface-soft)]"
      }`}
    >
      <h4 className="flex items-start gap-2 text-sm font-bold text-[var(--brand-navy-strong)]">
        {tone === "blocking" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" /> : null}
        <span>
          {title} ({groups.length === 1 ? "1 registro" : `${groups.length} registros`})
        </span>
      </h4>
      <ul className="mt-2 space-y-2 text-sm text-[var(--ink)]">
        {groups.map((group) => (
          <li key={group.entryId}>
            <span className="font-bold">{group.entryLabel}</span>
            <span className="block text-[var(--ink)]">{group.messages.join(" ")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** O que aconteceu com a marca de exportado, depois que o arquivo saiu. */
function describeMark(result: MarkExportedResult, sampleCount: number) {
  if (!result.ok) {
    return result.reason === "permission"
      ? "Seu perfil não grava no registro de campo, por isso as amostras não ficaram marcadas como exportadas e o código delas ainda pode mudar."
      : result.reason === "session"
        ? "Sua sessão expirou antes de marcar as amostras como exportadas. Entre de novo e gere a planilha outra vez para marcar."
        : "Não foi possível marcar as amostras como exportadas. Gere a planilha de novo mais tarde para marcar.";
  }

  if (!result.saved) {
    return "O banco ainda não recebeu a atualização da marca de exportação, então o código das amostras continua acompanhando a data e o ponto do registro.";
  }

  if (result.marked === 0) {
    return "Nenhuma amostra nova: todas já estavam marcadas como exportadas.";
  }

  return result.marked === sampleCount
    ? result.marked === 1
      ? "A amostra ficou marcada como exportada: o código dela não muda mais."
      : `As ${result.marked} amostras ficaram marcadas como exportadas: o código delas não muda mais.`
    : result.marked === 1
      ? "1 amostra nova ficou marcada como exportada. As outras já estavam."
      : `${result.marked} amostras novas ficaram marcadas como exportadas. As outras já estavam.`;
}
