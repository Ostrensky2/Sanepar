"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Texto longo recolhido: mostra as primeiras linhas e um link "Ler mais".
 * Textos curtos aparecem inteiros, sem link.
 */
export function ReadMore({
  text,
  lines = 3,
  threshold = 180,
  className,
}: {
  text: string | null | undefined;
  lines?: 2 | 3 | 4 | 6;
  /** Número de caracteres a partir do qual o texto é recolhido. */
  threshold?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const content = String(text ?? "").trim();

  if (!content) return <p className={cn("text-sm text-slate-500", className)}>Não informado</p>;

  const collapsible = content.length > threshold;
  const clampClass = { 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4", 6: "line-clamp-6" }[lines];

  return (
    <div className={className}>
      <p id={id} className={cn("text-sm leading-6 text-slate-600", collapsible && !open && clampClass)}>
        {content}
      </p>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="mt-1 min-h-11 text-sm font-bold text-[var(--brand-teal)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-blue)]"
        >
          {open ? "Mostrar menos" : "Ler mais"}
        </button>
      ) : null}
    </div>
  );
}
