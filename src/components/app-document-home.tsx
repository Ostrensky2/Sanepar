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
  const latestDocuments = documents.slice(0, 3);

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
    <section className="grid gap-4 lg:grid-cols-3">
      {latestDocuments.map((document) => (
        <article
          key={document.id}
          className="glass-panel rounded-[24px] border p-4"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            {document.type}
          </p>
          <h3 className="mt-2 text-sm font-bold text-[var(--brand-navy-strong)]">
            {document.title}
          </h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {document.campaign} / {document.point}
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-teal)]">
            Anexado em {document.date}
          </p>
        </article>
      ))}
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
