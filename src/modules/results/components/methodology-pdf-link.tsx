"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

export function isMethodologyPdfAvailable(response: Pick<Response, "status" | "headers">) {
  return response.status === 200 && response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/pdf";
}

export function MethodologyPdfLink() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/results/methodology-pdf", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const valid = isMethodologyPdfAvailable(response);
      await response.body?.cancel();
      if (!controller.signal.aborted) setAvailable(valid);
    }).catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    return () => controller.abort();
  }, []);
  if (available !== true) return <p role="status" className="type-metadata">{available === null ? "Verificando disponibilidade da metodologia…" : "PDF da metodologia indisponível neste ambiente."}</p>;
  return <a href="/api/results/methodology-pdf" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-panel)] px-4 text-sm font-bold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]"><FileText aria-hidden="true" className="h-4 w-4" />Metodologia completa (PDF)<span className="sr-only"> — abre em nova aba</span></a>;
}
