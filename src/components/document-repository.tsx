"use client";

import {
  ArrowUpDown,
  Clipboard,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Link2,
  Presentation,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  APP_DOCUMENTS_CLOUD_MIGRATION_KEY,
  APP_DOCUMENTS_STORAGE_KEY,
  filterTabs,
  mergeStoredDocuments,
  normalizeStoredDocuments,
  readStoredDocumentsFromStorage,
  type DocumentType,
  type StoredDocument,
} from "@/lib/app-documents";
import { recordActivity } from "@/lib/activity-log";
import { getStoredSession } from "@/lib/auth-users";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import { ErrorBoundary, TableSkeletonRows, emitLocalMode } from "@/components/operational-feedback";

type DocumentSortMode =
  | "numeric-asc"
  | "numeric-desc"
  | "alpha-asc"
  | "alpha-desc";

const documentSortOptions: Array<{ label: string; value: DocumentSortMode }> = [
  { label: "Numérico crescente", value: "numeric-asc" },
  { label: "Numérico decrescente", value: "numeric-desc" },
  { label: "Alfabético A-Z", value: "alpha-asc" },
  { label: "Alfabético Z-A", value: "alpha-desc" },
];

export function DocumentRepository() {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [hasLoadedDocuments, setHasLoadedDocuments] = useState(false);
  const [persistenceMode, setPersistenceMode] = useState<"browser" | "cloud">("browser");
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DocumentType>("Plano de trabalho");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState<DocumentSortMode>("numeric-asc");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [isInsertOpen, setIsInsertOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    title: "",
    dropboxUrl: "",
    campaign: "",
    point: "",
    type: "Plano de trabalho" as DocumentType,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadDocuments() {
      const localDocuments = readStoredDocumentsFromStorage();

      try {
        const response = await fetch("/api/documents", { cache: "no-store" });
        const payload = (await response.json()) as {
          documents?: unknown;
          persistence?: "browser" | "cloud";
        };

        if (!response.ok || payload.persistence !== "cloud") {
          throw new Error("Documentos em modo local.");
        }

        const cloudDocuments = normalizeStoredDocuments(payload.documents);
        const alreadyMigrated =
          window.localStorage.getItem(APP_DOCUMENTS_CLOUD_MIGRATION_KEY) === "true";
        const nextDocuments = alreadyMigrated
          ? cloudDocuments
          : mergeStoredDocuments(cloudDocuments, localDocuments);

        if (!isMounted) {
          return;
        }

        setDocuments(nextDocuments);
        setPersistenceMode("cloud");
        setSyncNotice("Documentos sincronizados na nuvem.");
        setHasLoadedDocuments(true);

        if (!alreadyMigrated && localDocuments.length) {
          try {
            await saveDocumentsToCloud(nextDocuments);
            window.localStorage.setItem(APP_DOCUMENTS_CLOUD_MIGRATION_KEY, "true");
          } catch {
            setSyncNotice("Documentos carregados localmente; a nuvem ainda não confirmou a migração.");
          }
        }
      } catch {
        if (!isMounted) {
          return;
        }

        setDocuments(canUseBrowserOnlyPersistence() ? localDocuments : []);
        setPersistenceMode("browser");
        setSyncNotice(
          canUseBrowserOnlyPersistence()
            ? "Documentos em modo local; a nuvem não está disponível neste ambiente."
            : "A nuvem não está disponível. Alterações locais não serão exibidas para outros usuários.",
        );
        emitLocalMode("Falha de conexão com documentos na nuvem. O repositório está usando dados locais quando disponíveis.");
        setHasLoadedDocuments(true);
      }
    }

    loadDocuments();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedDocuments) {
      return;
    }

    window.localStorage.setItem(APP_DOCUMENTS_STORAGE_KEY, JSON.stringify(documents));
    window.dispatchEvent(new Event("yvae:documents-updated"));

    if (persistenceMode === "cloud") {
      saveDocumentsToCloud(documents)
        .then(() => {
          setSyncNotice("Documentos sincronizados na nuvem.");
        })
        .catch(() => {
          setSyncNotice("A lista local foi atualizada, mas a nuvem não confirmou a gravação.");
        });
    }
  }, [documents, hasLoadedDocuments, persistenceMode]);

  const visibleDocuments = useMemo(() => {
    const normalizedSearch = normalize(searchTerm);

    return documents.filter((document) => {
      const matchesTab = document.type === activeTab;
      const searchable = normalize(
        `${document.title} ${document.campaign} ${document.point} ${document.status}`,
      );

      return matchesTab && searchable.includes(normalizedSearch);
    }).sort((left, right) => compareDocuments(left, right, sortMode));
  }, [activeTab, documents, searchTerm, sortMode]);
  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedDocumentIds.includes(document.id)),
    [documents, selectedDocumentIds],
  );
  const visibleDocumentIds = useMemo(
    () => visibleDocuments.map((document) => document.id),
    [visibleDocuments],
  );
  const allVisibleSelected =
    visibleDocumentIds.length > 0 &&
    visibleDocumentIds.every((id) => selectedDocumentIds.includes(id));

  async function insertDropboxLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const trimmedUrl = formState.dropboxUrl.trim();
    const trimmedTitle = formState.title.trim() || inferTitleFromUrl(trimmedUrl);

    if (!isValidDropboxUrl(trimmedUrl)) {
      setFormError("Um link válido do Dropbox deve ser informado.");
      return;
    }

    const today = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
    const now = new Date().toISOString();

    const newDocument: StoredDocument = {
      id: `${trimmedUrl}-${crypto.randomUUID()}`,
      title: trimmedTitle,
      dropboxUrl: trimmedUrl,
      campaign: formState.campaign.trim() || "Documento inserido",
      point: formState.point.trim() || "Repositório oficial",
      date: today,
      updatedAt: now,
      type: formState.type,
      status: "INSERIDO",
      source: "link",
    };

    const nextDocuments = [newDocument, ...documents];

    if (persistenceMode === "cloud") {
      try {
        await saveDocumentsToCloud(nextDocuments);
      } catch {
        setFormError("A nuvem não confirmou a gravação. O documento não foi publicado para outros usuários.");
        return;
      }
    } else if (!canUseBrowserOnlyPersistence()) {
      setFormError("A nuvem não está disponível. O documento não foi publicado para outros usuários.");
      return;
    }

    setDocuments(nextDocuments);
    recordActivity(getStoredSession(), "document.change", newDocument.title, "Documento adicionado");
    setActiveTab(newDocument.type);
    setIsInsertOpen(false);
    setFormState({
      title: "",
      dropboxUrl: "",
      campaign: "",
      point: "",
      type: "Plano de trabalho",
    });
  }

  async function deleteDocument(document: StoredDocument) {
    const confirmed = window.confirm(
      `"${document.title}" será apagado da lista de documentos deste painel. Esta ação remove o item da sessão atual.`,
    );

    if (!confirmed) {
      return;
    }

    if (persistenceMode === "cloud") {
      try {
        await deleteDocumentsFromCloud([document.id]);
      } catch {
        setSyncNotice("Documento removido localmente, mas a nuvem não confirmou a exclusão.");
        return;
      }
    } else if (!canUseBrowserOnlyPersistence()) {
      setSyncNotice("A nuvem não está disponível. O documento não foi removido para outros usuários.");
      return;
    }

    setDocuments((current) => current.filter((item) => item.id !== document.id));
    recordActivity(getStoredSession(), "document.change", document.title, "Documento removido");
  }

  function toggleDocumentSelection(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  function toggleAllVisibleDocuments() {
    setSelectedDocumentIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleDocumentIds.includes(id));
      }

      return [...new Set([...current, ...visibleDocumentIds])];
    });
  }

  async function shareSelectedDocuments() {
    if (!selectedDocuments.length) {
      return;
    }

    setShareNotice(null);
    const sharedText = selectedDocuments
      .map((document) => `${document.title}: ${document.dropboxUrl}`)
      .join("\n");

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${selectedDocuments.length} documentos Yva'e`,
          text: sharedText,
        });
        return;
      }

      await navigator.clipboard.writeText(sharedText);
      setShareNotice("Links dos documentos selecionados copiados para a área de transferência.");
    } catch (error) {
      setShareNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível compartilhar os documentos selecionados.",
      );
    }
  }

  async function copySelectedLinks() {
    if (!selectedDocuments.length) {
      return;
    }

    await navigator.clipboard.writeText(
      selectedDocuments.map((document) => document.dropboxUrl).join("\n"),
    );
    setShareNotice("Links selecionados copiados para a área de transferência.");
  }

  function downloadSelectedDocuments() {
    selectedDocuments.forEach((document) => {
      downloadDocument(document);
    });
  }

  async function deleteSelectedDocuments() {
    if (!selectedDocuments.length) {
      return;
    }

    const confirmed = window.confirm(
      `${selectedDocuments.length} documentos selecionados serão apagados da lista deste painel. Esta ação remove os itens da sessão atual.`,
    );

    if (!confirmed) {
      return;
    }

    const selectedIds = new Set(selectedDocuments.map((document) => document.id));

    if (persistenceMode === "cloud") {
      try {
        await deleteDocumentsFromCloud([...selectedIds]);
      } catch {
        setSyncNotice("Documentos removidos localmente, mas a nuvem não confirmou a exclusão.");
        return;
      }
    } else if (!canUseBrowserOnlyPersistence()) {
      setSyncNotice("A nuvem não está disponível. Os documentos não foram removidos para outros usuários.");
      return;
    }

    setDocuments((current) => current.filter((document) => !selectedIds.has(document.id)));
    setSelectedDocumentIds([]);
  }

  async function shareDocument(document: StoredDocument) {
    setShareNotice(null);

    try {
      if (navigator.share) {
        await navigator.share({
          title: document.title,
          text: `${document.title} - ${document.campaign}`,
          url: document.dropboxUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(document.dropboxUrl);
      setShareNotice("Link do Dropbox copiado para a área de transferência.");
    } catch (error) {
      setShareNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível compartilhar o documento.",
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-2 py-2 lg:px-4">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="heading-font mb-1 text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            Repositório Oficial de Documentos
          </h2>
        </div>
        <div className="flex gap-4">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-navy-strong)] px-5 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
            type="button"
            onClick={() => setIsInsertOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Link Dropbox será inserido
          </button>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="heading-font text-base font-bold text-[var(--brand-navy-strong)]">
            Destaques do Período
          </h3>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            {documents.length} documentos no painel
          </span>
        </div>

        <div className="grid gap-6">
          <article className="glass-panel relative flex min-h-[240px] flex-col justify-between overflow-hidden rounded-[28px] p-6">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-[var(--brand-navy-strong)]/10 to-transparent" />
            <div className="relative z-10">
              <span className="mb-3 inline-block rounded-full bg-[var(--brand-green-soft)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-navy-strong)]">
                REPOSITÓRIO ATIVO
              </span>
              <h4 className="heading-font mb-2 text-2xl font-extrabold leading-tight text-[var(--brand-navy-strong)]">
                Biblioteca Técnica Yva&apos;e
              </h4>
            </div>

            <div className="relative z-10 flex gap-3">
              <button
                className="inline-flex items-center gap-2 rounded bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] transition-colors hover:bg-[var(--surface-muted)]"
                type="button"
                onClick={() => setIsInsertOpen(true)}
              >
                <Upload className="h-4 w-4" />
                Link será inserido
              </button>
              <button
                className="inline-flex items-center gap-2 rounded bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] transition-colors hover:bg-[var(--surface-muted)]"
                type="button"
                onClick={() => downloadDocument(documents[0])}
              >
                <Download className="h-4 w-4" />
                Destaque será baixado
              </button>
            </div>
          </article>
        </div>
      </section>

      {isInsertOpen ? (
        <section className="glass-panel rounded-[24px] p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="heading-font text-lg font-bold text-[var(--brand-navy-strong)]">
                Link do Dropbox será inserido
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                A referência do documento é cadastrada; o arquivo permanece no Dropbox.
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar formulário de link"
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
              onClick={() => setIsInsertOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form className="grid gap-3 lg:grid-cols-6" onSubmit={insertDropboxLink}>
            <input
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:col-span-2"
              placeholder="Título do documento"
              value={formState.title}
              onChange={(event) =>
                setFormState((current) => ({ ...current, title: event.target.value }))
              }
            />
            <input
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:col-span-2"
              placeholder="Link do Dropbox"
              value={formState.dropboxUrl}
              onChange={(event) =>
                setFormState((current) => ({ ...current, dropboxUrl: event.target.value }))
              }
            />
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              value={formState.type}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  type: event.target.value as DocumentType,
                }))
              }
            >
              {filterTabs.map((tab) => (
                <option key={tab} value={tab}>
                  {tab}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-[var(--brand-navy-strong)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
            >
              Link será inserido
            </button>
            <input
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:col-span-2"
              placeholder="Campanha"
              value={formState.campaign}
              onChange={(event) =>
                setFormState((current) => ({ ...current, campaign: event.target.value }))
              }
            />
            <input
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:col-span-2"
              placeholder="Ponto ou observação"
              value={formState.point}
              onChange={(event) =>
                setFormState((current) => ({ ...current, point: event.target.value }))
              }
            />
          </form>

          {formError ? (
            <p className="mt-3 text-xs font-semibold text-[var(--brand-danger)]">
              {formError}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex flex-wrap gap-1 rounded-lg bg-[var(--surface-soft)] p-1">
            {filterTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={
                  tab === activeTab
                    ? "rounded-md border-b-2 border-[var(--brand-blue)] bg-white px-4 py-2 text-xs font-bold text-[var(--brand-navy)] shadow-sm"
                    : "px-4 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-[var(--brand-navy-strong)]"
                }
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <label className="relative w-full lg:w-56">
              <ArrowUpDown className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                aria-label="Ordenar documentos"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as DocumentSortMode)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs font-semibold text-[var(--brand-navy-strong)] focus:ring-2 focus:ring-[var(--brand-navy-strong)]/20"
              >
                {documentSortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar documentos..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-[var(--brand-navy-strong)]/20"
              />
            </div>
          </div>
        </div>

        {shareNotice ? (
          <div className="rounded-lg border border-[var(--line-ghost)] bg-white px-4 py-3 text-xs font-semibold text-[var(--brand-navy-strong)]">
            {shareNotice}
          </div>
        ) : null}

        {syncNotice ? (
          <div className="rounded-lg border border-[var(--line-ghost)] bg-white px-4 py-3 text-xs font-semibold text-[var(--brand-navy-strong)]">
            {syncNotice}
          </div>
        ) : null}

        {selectedDocuments.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--line-ghost)] bg-white px-4 py-3 shadow-[0_20px_60px_-42px_rgba(0,66,98,0.28)] lg:flex-row lg:items-center lg:justify-between">
            <p className="text-xs font-bold text-[var(--brand-navy-strong)]">
              {selectedDocuments.length} documento
              {selectedDocuments.length > 1 ? "s" : ""} selecionado
              {selectedDocuments.length > 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] transition-colors hover:bg-[var(--surface-muted)]"
                onClick={shareSelectedDocuments}
              >
                <Share2 className="h-4 w-4" />
                Compartilhamento
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] transition-colors hover:bg-[var(--surface-muted)]"
                onClick={copySelectedLinks}
              >
                <Clipboard className="h-4 w-4" />
                Links serão copiados
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] transition-colors hover:bg-[var(--surface-muted)]"
                onClick={downloadSelectedDocuments}
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-[rgba(186,26,26,0.08)] px-3 py-2 text-xs font-bold text-[var(--brand-danger)] transition-colors hover:bg-red-50"
                onClick={deleteSelectedDocuments}
              >
                <Trash2 className="h-4 w-4" />
                Exclusão
              </button>
            </div>
          </div>
        ) : null}

        <ErrorBoundary title="Falha na lista de documentos">
          <div className="glass-panel overflow-hidden rounded-[28px]">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="w-12 px-6 py-4">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os documentos visíveis"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisibleDocuments}
                      className="h-4 w-4 rounded border-slate-300 text-[var(--brand-navy-strong)] focus:ring-[var(--brand-blue)]"
                    />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Arquivo
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Campanha / Ponto
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Data
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Tipo
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Status / Disponibilidade
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50 text-xs">
                {!hasLoadedDocuments ? (
                  <TableSkeletonRows rows={5} columns={7} />
                ) : (
                visibleDocuments.map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    selected={selectedDocumentIds.includes(document.id)}
                    onToggleSelection={toggleDocumentSelection}
                    onDelete={deleteDocument}
                    onShare={shareDocument}
                  />
                ))
                )}
              </tbody>
            </table>

            {hasLoadedDocuments && !visibleDocuments.length ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">
                Nenhum documento encontrado para o filtro atual.
              </div>
            ) : null}
          </div>
        </ErrorBoundary>

        <div className="flex items-center justify-between py-2">
          <p className="text-[11px] text-slate-500">
            Exibindo{" "}
            <span className="font-bold text-[var(--brand-navy-strong)]">
              {visibleDocuments.length}
            </span>{" "}
            de{" "}
            <span className="font-bold text-[var(--brand-navy-strong)]">
              {documents.length}
            </span>{" "}
            documentos
          </p>
        </div>
      </section>
    </div>
  );
}

async function saveDocumentsToCloud(documents: StoredDocument[]) {
  const response = await fetch("/api/documents", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documents }),
  });

  if (!response.ok) {
    throw new Error("A nuvem não confirmou a gravação dos documentos.");
  }

  return response.json() as Promise<{ documents?: unknown; persistence?: string }>;
}

async function deleteDocumentsFromCloud(ids: string[]) {
  const response = await fetch("/api/documents", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error("A nuvem não confirmou a exclusão dos documentos.");
  }

  return response.json() as Promise<{ ids?: unknown; persistence?: string }>;
}

function DocumentRow({
  document,
  selected,
  onToggleSelection,
  onDelete,
  onShare,
}: {
  document: StoredDocument;
  selected: boolean;
  onToggleSelection: (documentId: string) => void;
  onDelete: (document: StoredDocument) => void;
  onShare: (document: StoredDocument) => void;
}) {
  return (
    <tr className="group transition-all hover:bg-slate-50">
      <td className="px-6 py-4">
        <input
          type="checkbox"
          aria-label={`Selecionar ${document.title}`}
          checked={selected}
          onChange={() => onToggleSelection(document.id)}
          className="h-4 w-4 rounded border-slate-300 text-[var(--brand-navy-strong)] focus:ring-[var(--brand-blue)]"
        />
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <DocumentTypeIcon document={document} />
          <div>
            <button
              className="cursor-pointer text-left font-bold text-[var(--brand-navy-strong)] group-hover:underline"
              type="button"
              onClick={() => openDocument(document)}
            >
              {document.title}
            </button>
            <p className="text-[9px] text-slate-500">
              Link Dropbox • Inserido
            </p>
          </div>
        </div>
      </td>

      <td className="px-6 py-4 text-slate-500">
        <p className="font-bold">{document.campaign}</p>
        <p className="text-[10px]">{document.point}</p>
      </td>

      <td className="px-6 py-4 text-slate-500">{document.date}</td>
      <td className="px-6 py-4">
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold">
          {document.type.toUpperCase()}
        </span>
      </td>
      <td className="px-6 py-4">
        <div
          className={`inline-block rounded-sm border-l-[3px] px-2 py-1 text-[9px] font-bold ${statusClassForDocument(document)}`}
        >
          {document.status}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex gap-2">
          <button
            aria-label={`Visualizar ${document.title}`}
            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
            type="button"
            onClick={() => openDocument(document)}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            aria-label={`Baixar ${document.title}`}
            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
            type="button"
            onClick={() => downloadDocument(document)}
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            aria-label={`Compartilhar ${document.title}`}
            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
            type="button"
            onClick={() => onShare(document)}
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            aria-label={`Copiar link de ${document.title}`}
            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(document.dropboxUrl);
            }}
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            aria-label={`Apagar ${document.title}`}
            className="rounded p-1.5 text-[var(--brand-danger)] transition-colors hover:bg-red-50"
            type="button"
            onClick={() => onDelete(document)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function DocumentTypeIcon({ document }: { document: StoredDocument }) {
  const className = `h-5 w-5 ${iconClassForDocument(document)}`;

  if (document.type === "Apresentações") {
    return <Presentation className={className} />;
  }

  if (document.status === "VALIDADO") {
    return <FileCheck2 className={className} />;
  }

  return <FileText className={className} />;
}

async function openDocument(document: StoredDocument) {
  window.open(document.dropboxUrl, "_blank", "noopener,noreferrer");
}

function downloadDocument(document: StoredDocument) {
  window.open(toDropboxDownloadUrl(document.dropboxUrl), "_blank", "noopener,noreferrer");
}

function iconClassForDocument(document: StoredDocument) {
  if (document.type === "Apresentações") {
    return "text-amber-600";
  }

  if (document.status === "VALIDADO") {
    return "text-emerald-600";
  }

  if (document.title.toLowerCase().endsWith(".pdf")) {
    return "text-red-500";
  }

  return "text-blue-500";
}

function statusClassForDocument(document: StoredDocument) {
  if (document.status === "INSERIDO") {
    return "border-[var(--brand-teal)] bg-cyan-50 text-cyan-700";
  }

  if (document.status === "VALIDADO" || document.status === "FINAL") {
    return "border-[#00b356] bg-emerald-50 text-emerald-700";
  }

  if (document.status.includes("COMPARTILHADO")) {
    return "border-[var(--brand-teal)] bg-cyan-50 text-cyan-700";
  }

  return "border-[var(--brand-blue)] bg-blue-50 text-blue-700";
}

const documentTitleCollator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

function compareDocuments(
  left: StoredDocument,
  right: StoredDocument,
  sortMode: DocumentSortMode,
) {
  if (sortMode === "alpha-asc") {
    return compareDocumentTitles(left, right);
  }

  if (sortMode === "alpha-desc") {
    return compareDocumentTitles(right, left);
  }

  const direction = sortMode === "numeric-desc" ? -1 : 1;
  const leftNumber = firstDocumentNumber(left.title);
  const rightNumber = firstDocumentNumber(right.title);

  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return (leftNumber - rightNumber) * direction;
  }

  if (leftNumber !== null && rightNumber === null) {
    return -1;
  }

  if (leftNumber === null && rightNumber !== null) {
    return 1;
  }

  return compareDocumentTitles(left, right) * direction;
}

function compareDocumentTitles(left: StoredDocument, right: StoredDocument) {
  return documentTitleCollator.compare(left.title, right.title);
}

function firstDocumentNumber(title: string) {
  const match = title.match(/\d+(?:[,.]\d+)?/);

  if (!match) {
    return null;
  }

  const value = Number(match[0].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isValidDropboxUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.endsWith("dropbox.com") || url.hostname.endsWith("dropboxusercontent.com");
  } catch {
    return false;
  }
}

function toDropboxDownloadUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.hostname.endsWith("dropbox.com")) {
      url.searchParams.set("dl", "1");
    }

    return url.toString();
  } catch {
    return value;
  }
}

function inferTitleFromUrl(value: string) {
  try {
    const url = new URL(value);
    const lastSegment = decodeURIComponent(
      url.pathname.split("/").filter(Boolean).pop() ?? "Documento Dropbox",
    );

    return lastSegment || "Documento Dropbox";
  } catch {
    return "Documento Dropbox";
  }
}
