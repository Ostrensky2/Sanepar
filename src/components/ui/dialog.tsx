"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogSize = "md" | "lg" | "xl";

type DialogProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Ícone opcional exibido ao lado do título. */
  icon?: ReactNode;
  size?: DialogSize;
};

const sizeClasses: Record<DialogSize, string> = {
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

/**
 * Diálogo modal acessível:
 * - role="dialog", aria-modal="true", aria-labelledby
 * - Fecha ao pressionar Escape
 * - Foco inicial no botão fechar; restaura foco ao elemento anterior ao fechar
 * - Renderizado em portal (document.body) para evitar conflitos de z-index
 */
export function Dialog({ title, children, onClose, icon, size = "xl" }: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = `dialog-title-${Math.random().toString(36).slice(2)}`;

  useEffect(() => {
    setMounted(true);
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted, onClose]);

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "my-6 w-full rounded-[28px] bg-white p-5 shadow-[0_28px_90px_-24px_rgba(0,0,0,0.45)]",
          sizeClasses[size],
        )}
      >
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--line-ghost)] pb-4">
          <div className="flex items-center gap-3">
            {icon ? (
              <span className="rounded-2xl bg-[var(--brand-blue-soft)] p-3 text-[var(--brand-navy-strong)]">
                {icon}
              </span>
            ) : null}
            <h2
              id={titleId}
              className="heading-font text-2xl font-black text-[var(--brand-navy-strong)]"
            >
              {title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar diálogo"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-[var(--surface-soft)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  if (!mounted) {
    return null;
  }

  return createPortal(content, document.body);
}
