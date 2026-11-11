"use client";

import { LocateFixed, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { formatDistance } from "@/lib/collection-capture";

/** O que mostrar depois de uma captura (ver lib/collection-capture). */
export type CaptureFeedback = {
  notices: string[];
  farFromPlanned: { distanceM: number } | null;
  needsCoordinateCheck: boolean;
};

/**
 * Bloco "Início da coleta" do registro de campo. Só mostra e pergunta; quem lê o
 * GPS e grava no registro é o formulário.
 */
export function CollectionStartPanel({
  isLocating,
  startedLabel,
  getOverwriteWarning,
  feedback,
  canMarkRelocated,
  onStart,
  onReadPosition,
  onMarkRelocated,
}: {
  isLocating: boolean;
  /** "11/11/2026 às 10:32" quando a coleta já foi iniciada neste registro. */
  startedLabel: string;
  /** Pergunta a fazer quando iniciar de novo troca dados já gravados; vazio = não pergunta. */
  getOverwriteWarning: () => string;
  feedback: CaptureFeedback | null;
  canMarkRelocated: boolean;
  onStart: () => void;
  onReadPosition: () => void;
  onMarkRelocated: () => void;
}) {
  const [overwriteWarning, setOverwriteWarning] = useState("");
  const isConfirming = Boolean(overwriteWarning);

  function start() {
    const warning = isConfirming ? "" : getOverwriteWarning();

    if (warning) {
      setOverwriteWarning(warning);
      return;
    }

    setOverwriteWarning("");
    onStart();
  }

  return (
    <section
      aria-labelledby="collection-start-title"
      className="rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="collection-start-title" className="text-sm font-black text-[var(--brand-navy-strong)]">
            Início da coleta
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {startedLabel
              ? `Coleta iniciada em ${startedLabel}.`
              : "Toque ao chegar no ponto. O aplicativo grava a hora, a data e a posição do celular."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {startedLabel && !isConfirming ? (
            <button
              type="button"
              onClick={onReadPosition}
              disabled={isLocating}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-muted)] disabled:cursor-wait disabled:opacity-70"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Ler o GPS de novo
            </button>
          ) : null}
          {isConfirming ? null : (
            <button
              type="button"
              onClick={start}
              disabled={isLocating}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:cursor-wait disabled:opacity-70"
            >
              <LocateFixed className="h-4 w-4" aria-hidden="true" />
              {isLocating ? "Lendo o GPS…" : "Iniciar coleta"}
            </button>
          )}
        </div>
      </div>

      {isConfirming ? (
        <div role="alertdialog" aria-labelledby="collection-start-confirm" className="mt-3 rounded-xl bg-white p-3">
          <p id="collection-start-confirm" className="text-sm font-semibold text-[var(--brand-navy-strong)]">
            {overwriteWarning}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={start}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)]"
            >
              Trocar pelos dados de agora
            </button>
            <button
              type="button"
              onClick={() => setOverwriteWarning("")}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--ink-soft)]"
            >
              Manter como está
            </button>
          </div>
        </div>
      ) : null}

      <div role="status" aria-live="polite">
        {feedback?.notices.length ? (
          <ul className="mt-3 grid gap-1 text-sm font-semibold text-[var(--brand-navy-strong)]">
            {feedback.notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {feedback?.farFromPlanned ? (
        <div role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-start gap-2 text-sm font-semibold text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              O celular está a {formatDistance(feedback.farFromPlanned.distanceM)} da coordenada planejada deste
              ponto. Se a coleta foi feita em outro lugar, marque o ponto como realocado e escreva o motivo.
            </span>
          </p>
          {canMarkRelocated ? (
            <button
              type="button"
              onClick={onMarkRelocated}
              className="mt-3 inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-400 bg-white px-4 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
            >
              Marcar como realocado
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
