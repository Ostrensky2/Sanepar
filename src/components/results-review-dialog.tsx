"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const ANNOUNCEMENT_DISMISS_KEY = "yvae:announcement-dismissed:results-v2";

export function ResultsReviewDialog({ title = "Conheça a nova versão do Yva’e", children, closeLabel = children ? "Fechar aviso" : "Explorar a nova versão", onClose, dismissKey = children ? undefined : ANNOUNCEMENT_DISMISS_KEY }: {
  title?: string;
  children?: ReactNode;
  closeLabel?: string;
  onClose?: () => void;
  /** Quando informado, o aviso só aparece até ser fechado uma vez neste navegador. */
  dismissKey?: string;
} = {}) {
  const [isOpen, setIsOpen] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef("");

  function closeDialog() {
    if (dismissKey) {
      try {
        window.localStorage.setItem(dismissKey, new Date().toISOString());
      } catch {
        // Sem armazenamento local, o aviso volta a aparecer na próxima visita.
      }
    }
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    document.body.style.overflow = previousOverflowRef.current;
    previousFocusRef.current?.focus();
    setIsOpen(false);
    onClose?.();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dismissKey && readDismissed(dismissKey)) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflowRef.current;
      if (dialog.open) dialog.close();
      previousFocusRef.current?.focus();
    };
  }, [dismissKey]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="results-review-title"
      aria-describedby="results-review-description"
      aria-modal="true"
      className="m-auto w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto radius-panel border border-[var(--line-strong)] bg-white p-0 text-[var(--ink)] backdrop:bg-slate-950/60"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0);
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div className="p-5 sm:p-6">
        <h2
          id="results-review-title"
          className="heading-font type-section-title text-[var(--brand-navy-strong)]"
        >
          {title}
        </h2>
        <div id="results-review-description" className="type-body mt-3 text-[var(--ink)]">
          {children ?? <>
            <p>O aplicativo evoluiu! Esta versão apresenta índices aperfeiçoados e novas ferramentas para explorar os resultados do monitoramento, consultar impactos potenciais e compreender os cálculos e a metodologia utilizados.</p>
            <p className="mt-3">Uma apresentação mais clara, organizada e transparente para apoiar a análise dos resultados.</p>
            <p className="mt-3"><a href="/ajuda?secao=versoes" className="font-bold text-[var(--brand-navy-strong)] underline underline-offset-2">Veja o que mudou em Ajuda › Versões</a></p>
          </>}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            ref={closeButtonRef}
            type="button"
            className="type-button min-h-11 rounded-lg bg-[var(--brand-navy-strong)] px-5 text-white hover:bg-[var(--brand-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-teal)]"
            onClick={closeDialog}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function readDismissed(key: string) {
  try {
    return Boolean(window.localStorage.getItem(key));
  } catch {
    return false;
  }
}
