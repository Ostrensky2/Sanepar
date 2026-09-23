"use client";

import { useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { ResultsReviewDialog } from "@/components/results-review-dialog";

/**
 * Ícone "?" de explicação. Fica sempre logo depois do título do bloco que explica,
 * para o usuário aprender um único gesto: dúvida → clicar no "?" ao lado do título.
 * Funciona por clique, toque e teclado (abre um diálogo, não depende de passar o mouse).
 */
export function ResultsInterpretationHelp({ children, title = "Como interpretar" }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button
      type="button"
      aria-label={title}
      title={title}
      aria-haspopup="dialog"
      className="-my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--brand-teal)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--brand-navy-strong)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]"
      onClick={() => setOpen(true)}
    >
      <CircleHelp aria-hidden="true" className="h-5 w-5" />
    </button>
    {open && <ResultsReviewDialog title={title} closeLabel="Fechar explicação" onClose={() => setOpen(false)}><div className="space-y-4">{children}</div></ResultsReviewDialog>}
  </>;
}
