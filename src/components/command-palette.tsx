"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Search, X } from "lucide-react";
import { getSearchableNavigationItems } from "@/lib/navigation";
import { APP_DOCUMENTS_STORAGE_KEY } from "@/lib/app-documents";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import { FIELD_DIARY_STORAGE_KEY } from "@/lib/field-diary";
import { POINT_ACTIONS_STORAGE_KEY } from "@/lib/point-actions";

type CommandItem = {
  id: string;
  href: string;
  label: string;
  group: string;
  keywords: string;
};

const SPREADSHEET_STORAGE_KEY = "yvae:spreadsheets";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<CommandItem[]>([]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;

    function refreshRecords() {
      setRecords(readLocalRecordItems());
    }

    refreshRecords();
    window.addEventListener("storage", refreshRecords);
    window.addEventListener("yvae:documents-updated", refreshRecords);
    window.addEventListener("yvae:spreadsheets-updated", refreshRecords);
    window.addEventListener("yvae:field-diary-updated", refreshRecords);
    window.addEventListener("yvae:point-actions-updated", refreshRecords);

    return () => {
      window.removeEventListener("storage", refreshRecords);
      window.removeEventListener("yvae:documents-updated", refreshRecords);
      window.removeEventListener("yvae:spreadsheets-updated", refreshRecords);
      window.removeEventListener("yvae:field-diary-updated", refreshRecords);
      window.removeEventListener("yvae:point-actions-updated", refreshRecords);
    };
  }, [open]);

  const items = useMemo<CommandItem[]>(
    () => [
      ...getSearchableNavigationItems().map((item) => ({
        id: `nav:${item.href}`,
        href: item.href,
        label: item.label,
        group: item.group,
        keywords: item.keywords,
      })),
      ...records,
    ],
    [records],
  );
  const filteredItems = useMemo(() => {
    const normalized = normalize(query);
    if (!normalized) return items.slice(0, 10);

    return items
      .filter((item) => normalize(`${item.label} ${item.group} ${item.keywords}`).includes(normalized))
      .slice(0, 12);
  }, [items, query]);

  function selectItem(item: CommandItem) {
    router.push(item.href);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Busca rápida"
        title="Busca rápida (Ctrl+K)"
        className="hidden items-center gap-2 rounded-full border border-[var(--line-ghost)] bg-white px-3 py-2 text-xs font-bold text-[var(--ink-soft)] transition hover:text-[var(--brand-navy-strong)] md:inline-flex"
      >
        <Search className="h-4 w-4" />
        <span>Buscar</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] bg-[rgba(0,35,52,0.32)] px-4 py-20 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <div
            className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[var(--line-ghost)] bg-white shadow-[0_30px_90px_-42px_rgba(0,35,52,0.55)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[var(--line-ghost)] px-4 py-3">
              <Search className="h-5 w-5 text-[var(--brand-teal)]" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar seção ou registro..."
                className="h-10 min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--brand-navy-strong)] outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar busca rápida"
                className="rounded-lg p-2 text-[var(--ink-soft)] transition hover:bg-[var(--surface-soft)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--surface-soft)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]">
                      <FileSearch className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[var(--brand-navy-strong)]">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs font-semibold text-[var(--ink-soft)]">
                        {item.group}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-sm font-semibold text-[var(--ink-soft)]">
                  Nenhuma seção ou registro encontrado.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function readLocalRecordItems() {
  const documents = readArray(APP_DOCUMENTS_STORAGE_KEY).map((document, index) => ({
    id: `document:${readString(document, "id", String(index))}`,
    href: "/documentos",
    label: readString(document, "title", "Documento"),
    group: "Documentos",
    keywords: `${readString(document, "title")} ${readString(document, "campaign")} ${readString(document, "point")}`,
  }));

  const diary = canUseBrowserOnlyPersistence()
    ? readArray(FIELD_DIARY_STORAGE_KEY).map((entry, index) => ({
        id: `diary:${readString(entry, "id", String(index))}`,
        href: "/dados/diario-de-campo",
        label: readString(entry, "locationName", "Registro do diário"),
        group: "Diário de Campo",
        keywords: `${readString(entry, "locationName")} ${readString(entry, "sia")} ${readString(entry, "municipality")} ${readString(entry, "campaignName")}`,
      }))
    : [];

  const spreadsheets = readArray(SPREADSHEET_STORAGE_KEY).map((sheet, index) => ({
    id: `sheet:${readString(sheet, "id", String(index))}`,
    href: readString(sheet, "kind") === "Laboratório" ? "/dados/resultados" : "/dados/campo",
    label: readString(sheet, "fileName", "Planilha"),
    group: "Planilhas",
    keywords: `${readString(sheet, "fileName")} ${readString(sheet, "campaign")} ${readString(sheet, "kind")}`,
  }));

  const pointActions = readArray(POINT_ACTIONS_STORAGE_KEY).map((action, index) => ({
    id: `action:${readString(action, "id", String(index))}`,
    href: "/acoes-pontuais",
    label: readString(action, "eventName", "Ação pontual"),
    group: "Ações Pontuais",
    keywords: `${readString(action, "eventName")} ${readString(action, "objectives")}`,
  }));

  return [...documents, ...diary, ...spreadsheets, ...pointActions].slice(0, 80);
}

function readArray(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readString(value: unknown, key: string, fallback = "") {
  if (!value || typeof value !== "object") return fallback;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : fallback;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
