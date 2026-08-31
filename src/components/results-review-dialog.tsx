"use client";

import { useEffect, useRef, useState } from "react";

export function ResultsReviewDialog() {
  const [isOpen, setIsOpen] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef("");

  function closeDialog() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    document.body.style.overflow = previousOverflowRef.current;
    previousFocusRef.current?.focus();
    setIsOpen(false);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

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
  }, []);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="results-review-title"
      aria-describedby="results-review-description"
      aria-modal="true"
      className="m-auto w-[calc(100%_-_2rem)] max-w-xl overflow-hidden radius-panel border border-[var(--line-strong)] bg-white p-0 text-[var(--ink)] backdrop:bg-slate-950/60"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
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
          Aviso
        </h2>
        <p id="results-review-description" className="type-body mt-3 text-[var(--ink)]">
          Os resultados da primeira e da segunda campanha serão ainda integralmente revisados para que possamos investigar especificamente os organismos solicitados pela Sanepar. Em breve apresentaremos aqui os resultados finais refinados.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            ref={closeButtonRef}
            type="button"
            className="type-button min-h-11 rounded-lg bg-[var(--brand-navy-strong)] px-5 text-white hover:bg-[var(--brand-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-teal)]"
            onClick={closeDialog}
          >
            Fechar aviso
          </button>
        </div>
      </div>
    </dialog>
  );
}
