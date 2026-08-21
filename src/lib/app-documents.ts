import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";

export const APP_DOCUMENTS_STORAGE_KEY = "yvae:attached-documents";

export type DocumentType =
  | "Plano de trabalho"
  | "Relatórios"
  | "Resultados"
  | "Apresentações"
  | "Laudos"
  | "Mapas"
  | "Institucionais";

export type StoredDocument = {
  id: string;
  title: string;
  dropboxUrl?: string;
  originalUrl?: string;
  campaign: string;
  point: string;
  date: string;
  updatedAt?: string;
  type: DocumentType;
  status: string;
  source: "link" | "storage";
  originalName?: string;
  mimeType?: string;
  size?: number;
  storageBucket?: string;
  storagePath?: string;
};

export const filterTabs: DocumentType[] = [
  "Plano de trabalho",
  "Relatórios",
  "Resultados",
  "Apresentações",
  "Laudos",
  "Mapas",
  "Institucionais",
];

export function isDocumentAllowedInRepository(document: StoredDocument) {
  const type = String(document.type).toLowerCase();
  const title = document.title.toLowerCase();
  const url = (document.dropboxUrl ?? document.originalUrl ?? document.storagePath ?? "").toLowerCase();

  if (type === "planilhas") {
    return false;
  }

  if (type === "resultados") {
    return true;
  }

  return !isSpreadsheetLike(title) && !isSpreadsheetLike(url);
}

function isSpreadsheetLike(value: string) {
  return /\.(csv|xls|xlsx|xlsm)(?:$|[?#])/.test(value);
}

export function readStoredDocumentsFromStorage() {
  if (typeof window === "undefined" || !canUseBrowserOnlyPersistence()) {
    return [];
  }

  try {
    const rawDocuments = window.localStorage.getItem(APP_DOCUMENTS_STORAGE_KEY);

    if (!rawDocuments) {
      return [];
    }

    const parsedDocuments = JSON.parse(rawDocuments);

    const normalizedDocuments = Array.isArray(parsedDocuments)
      ? parsedDocuments
          .map(normalizeStoredDocument)
          .filter((document): document is StoredDocument => document !== null)
          .filter(isDocumentAllowedInRepository)
      : [];

    return dedupeDocuments(normalizedDocuments);
  } catch {
    return [];
  }
}

function dedupeDocuments(documents: StoredDocument[]) {
  const seen = new Set<string>();

  return documents.filter((document) => {
    const key = `${document.id}|${document.dropboxUrl ?? document.storagePath ?? ""}|${document.title}`.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function normalizeStoredDocument(value: unknown): StoredDocument | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredDocument>;
  const title = String(candidate.title ?? "").trim();
  const dropboxUrl = String(candidate.dropboxUrl ?? "").trim();
  const originalUrl = String(candidate.originalUrl ?? "").trim();
  const storageBucket = String(candidate.storageBucket ?? "").trim();
  const storagePath = String(candidate.storagePath ?? "").trim();
  const status = String(candidate.status ?? "INSERIDO");
  const source = String(candidate.source ?? (storageBucket && storagePath ? "storage" : "link"));

  if (!title || status.toUpperCase() === "RECUPERADO") {
    return null;
  }

  if (source === "storage" && (!storageBucket || !storagePath)) {
    return null;
  }

  if (source === "link" && !dropboxUrl && !originalUrl) {
    return null;
  }

  if (source !== "storage" && source !== "link") {
    return null;
  }

  return {
    id: String(candidate.id ?? `${dropboxUrl || storagePath}-${title}`),
    title,
    dropboxUrl: source === "link" ? dropboxUrl || originalUrl : undefined,
    originalUrl: source === "link" ? originalUrl || dropboxUrl : undefined,
    campaign: String(candidate.campaign ?? "Documento inserido"),
    point: String(candidate.point ?? "Repositório oficial"),
    date: String(candidate.date ?? ""),
    updatedAt: String(candidate.updatedAt ?? candidate.date ?? ""),
    type: filterTabs.includes(candidate.type as DocumentType)
      ? (candidate.type as DocumentType)
      : "Relatórios",
    status,
    source,
    originalName: candidate.originalName ? String(candidate.originalName) : undefined,
    mimeType: candidate.mimeType ? String(candidate.mimeType) : undefined,
    size: typeof candidate.size === "number" ? candidate.size : undefined,
    storageBucket: source === "storage" ? storageBucket : undefined,
    storagePath: source === "storage" ? storagePath : undefined,
  };
}

export function normalizeStoredDocuments(value: unknown) {
  return Array.isArray(value)
    ? dedupeDocuments(
        value
          .map(normalizeStoredDocument)
          .filter((document): document is StoredDocument => document !== null)
          .filter(isDocumentAllowedInRepository),
      )
    : [];
}
