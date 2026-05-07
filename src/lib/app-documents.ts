export const APP_DOCUMENTS_STORAGE_KEY = "yvae:attached-documents";

export type DocumentType =
  | "Plano de trabalho"
  | "Relatórios"
  | "Apresentações"
  | "Laudos"
  | "Mapas"
  | "Institucionais";

export type StoredDocument = {
  id: string;
  title: string;
  dropboxUrl: string;
  campaign: string;
  point: string;
  date: string;
  type: DocumentType;
  status: string;
  source: "link";
};

export const filterTabs: DocumentType[] = [
  "Plano de trabalho",
  "Relatórios",
  "Apresentações",
  "Laudos",
  "Mapas",
  "Institucionais",
];

export function isDocumentAllowedInRepository(document: StoredDocument) {
  const type = String(document.type).toLowerCase();
  const title = document.title.toLowerCase();
  const url = document.dropboxUrl.toLowerCase();

  if (type === "planilhas") {
    return false;
  }

  return !/\.(csv|xls|xlsx|xlsm)(?:$|[?#])/.test(title) &&
    !/\.(csv|xls|xlsx|xlsm)(?:$|[?#])/.test(url);
}

export function readStoredDocumentsFromStorage() {
  if (typeof window === "undefined") {
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
    const key = `${document.id}|${document.dropboxUrl}|${document.title}`.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeStoredDocument(value: unknown): StoredDocument | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredDocument>;
  const title = String(candidate.title ?? "").trim();
  const dropboxUrl = String(candidate.dropboxUrl ?? "").trim();
  const status = String(candidate.status ?? "INSERIDO");
  const source = String(candidate.source ?? "link");

  if (!title || !dropboxUrl || source !== "link" || status.toUpperCase() === "RECUPERADO") {
    return null;
  }

  return {
    id: String(candidate.id ?? `${dropboxUrl}-${title}`),
    title,
    dropboxUrl,
    campaign: String(candidate.campaign ?? "Documento inserido"),
    point: String(candidate.point ?? "Repositório oficial"),
    date: String(candidate.date ?? ""),
    type: filterTabs.includes(candidate.type as DocumentType)
      ? (candidate.type as DocumentType)
      : "Relatórios",
    status,
    source: "link",
  };
}
