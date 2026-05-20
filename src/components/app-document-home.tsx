"use client";

import { CircleCheckBig } from "lucide-react";
import { useEffect, useState } from "react";
import {
  readStoredDocumentsFromStorage,
  type StoredDocument,
} from "@/lib/app-documents";

export function AppDocumentMetric() {
  const documents = useAttachedDocuments();

  return (
    <article className="glass-panel rounded-[28px] border-b-2 border-[var(--brand-blue)] p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
        Documentos anexados
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-extrabold text-[var(--brand-navy-strong)]">
          {documents.length}
        </span>
        <span className="text-xs font-medium text-slate-500">registros no app</span>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-[var(--brand-teal)]">
        <CircleCheckBig className="h-3 w-3" /> Somatório da aba Documentos
      </p>
    </article>
  );
}

export function AppDocumentHighlights() {
  const documents = useAttachedDocuments();
  const latestDocuments = [...documents]
    .sort((left, right) => documentTime(right) - documentTime(left))
    .slice(0, 10);

  if (!latestDocuments.length) {
    return (
      <section className="glass-panel rounded-[24px] border p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Documentos
        </p>
        <h3 className="mt-2 text-sm font-bold text-[var(--brand-navy-strong)]">
          Nenhum documento anexado ao app
        </h3>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Pela aba Documentos, links oficiais são inseridos e este painel é alimentado.
        </p>
      </section>
    );
  }

  return (
    <section className="glass-panel rounded-[24px] border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Documentos
          </p>
          <h3 className="mt-2 text-sm font-bold text-[var(--brand-navy-strong)]">
            Últimos 10 arquivos adicionados ou alterados
          </h3>
        </div>
        <span className="rounded-full bg-[var(--brand-blue-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--brand-navy)]">
          {latestDocuments.length} registros
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {latestDocuments.map((document) => (
          <article
            key={document.id}
            className="grid gap-3 rounded-xl border border-[var(--line-ghost)] bg-white/70 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center"
          >
            <div>
              <p className="text-sm font-bold text-[var(--brand-navy-strong)]">{document.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {document.type} / {document.campaign} / {document.point}
              </p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-teal)]">
              {formatDocumentDate(document)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function useAttachedDocuments() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);

  useEffect(() => {
    function syncDocuments() {
      setDocuments(readStoredDocuments());
    }

    syncDocuments();
    window.addEventListener("storage", syncDocuments);
    window.addEventListener("yvae:documents-updated", syncDocuments);

    return () => {
      window.removeEventListener("storage", syncDocuments);
      window.removeEventListener("yvae:documents-updated", syncDocuments);
    };
  }, []);

  return documents;
}

function readStoredDocuments() {
  return readStoredDocumentsFromStorage();
}

function documentTime(document: StoredDocument) {
  const parsed = Date.parse(document.updatedAt || document.date);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDocumentDate(document: StoredDocument) {
  const parsed = Date.parse(document.updatedAt || "");

  if (!Number.isNaN(parsed)) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(parsed));
  }

  return document.date ? `Anexado em ${document.date}` : "Data não informada";
}
