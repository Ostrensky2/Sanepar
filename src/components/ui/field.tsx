"use client";

import { AlertCircle } from "lucide-react";

/**
 * Mensagem de erro de campo acessível.
 * Vincule `id` ao `aria-describedby` do input correspondente e
 * marque o input com `aria-invalid` quando houver erro.
 */
export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p
      id={id}
      role="alert"
      className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-danger)]"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}
