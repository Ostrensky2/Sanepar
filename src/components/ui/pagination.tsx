"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  pageCount: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Rótulo plural dos itens (ex.: "registros", "documentos"). */
  itemLabel?: string;
  className?: string;
};

/**
 * Controle de paginação acessível para listagens.
 * Mostra o intervalo atual e botões anterior/próximo com rótulos para leitores de tela.
 */
export function Pagination({
  page,
  pageCount,
  totalItems,
  startIndex,
  endIndex,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  itemLabel = "itens",
  className,
}: PaginationProps) {
  if (totalItems === 0) {
    return null;
  }

  const rangeStart = startIndex + 1;

  return (
    <nav
      aria-label="Paginação"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-ghost)] px-4 py-3",
        className,
      )}
    >
      <p className="text-xs font-semibold text-[var(--ink-soft)]" aria-live="polite">
        Mostrando{" "}
        <span className="font-black text-[var(--brand-navy-strong)]">
          {rangeStart}–{endIndex}
        </span>{" "}
        de{" "}
        <span className="font-black text-[var(--brand-navy-strong)]">{totalItems}</span>{" "}
        {itemLabel}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Página anterior"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-xs font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>

        <span className="px-1 text-xs font-black text-[var(--ink-soft)]">
          {page} / {pageCount}
        </span>

        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Próxima página"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-xs font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
