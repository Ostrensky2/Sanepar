import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";

export const SUPPORT_REQUESTS_STORAGE_KEY = "yvae:support-requests";

export const DEFAULT_ATGC_EMAIL = "aline.horo@yahoo.com.br";
export const DEFAULT_SANEPAR_EMAIL = "adrianast@sanepar.com.br";

export type RequestStatus =
  | "Nova"
  | "Em análise"
  | "Em andamento"
  | "Aguardando retorno"
  | "Concluída";
export type RequestPriority = "Baixa" | "Normal" | "Alta" | "Urgente";
export type RequestDirection = "Sanepar → ATGC" | "ATGC → Sanepar";

export type SupportRequest = {
  id: string;
  title: string;
  requester: string;
  institution: RequestDirection;
  type: string;
  priority: RequestPriority;
  description: string;
  response: string;
  responseUpdatedAt?: string;
  status: RequestStatus;
  notified?: boolean;
  notifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function getRequestRecipient(request: SupportRequest) {
  return request.institution === "ATGC → Sanepar"
    ? DEFAULT_SANEPAR_EMAIL
    : DEFAULT_ATGC_EMAIL;
}

export function normalizeInstitution(value: string): RequestDirection {
  return value === "ATGC → Sanepar" ? "ATGC → Sanepar" : "Sanepar → ATGC";
}

export function isSupportRequest(value: unknown): value is SupportRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SupportRequest>;

  return Boolean(
    candidate.id &&
      typeof candidate.title === "string" &&
      typeof candidate.description === "string" &&
      typeof candidate.status === "string" &&
      typeof candidate.createdAt === "string",
  );
}

function normalizeRequest(request: SupportRequest): SupportRequest {
  return {
    ...request,
    institution: normalizeInstitution(request.institution),
    response: request.response ?? "",
  };
}

export function readSupportRequestsFromStorage(): SupportRequest[] {
  if (typeof window === "undefined" || !canUseBrowserOnlyPersistence()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SUPPORT_REQUESTS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(isSupportRequest).map(normalizeRequest)
      : [];
  } catch {
    return [];
  }
}

function cacheSupportRequestsInStorage(requests: SupportRequest[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SUPPORT_REQUESTS_STORAGE_KEY,
    JSON.stringify(requests),
  );
}

export async function readSupportRequests(): Promise<SupportRequest[]> {
  const localRequests = readSupportRequestsFromStorage();

  try {
    const response = await fetch("/api/support-requests", {
      cache: "no-store",
    });

    if (!response.ok) {
      return canUseBrowserOnlyPersistence() ? localRequests : [];
    }

    const payload = (await response.json()) as { requests?: unknown };
    const cloudRequests = Array.isArray(payload.requests)
      ? payload.requests.filter(isSupportRequest).map(normalizeRequest)
      : [];

    if (cloudRequests.length) {
      cacheSupportRequestsInStorage(cloudRequests);
      return cloudRequests;
    }

    if (localRequests.length) {
      const savedInCloud = await writeSupportRequestsToCloud(localRequests);
      if (savedInCloud || canUseBrowserOnlyPersistence()) {
        return localRequests;
      }
    }

    return [];
  } catch {
    return canUseBrowserOnlyPersistence() ? localRequests : [];
  }
}

async function writeSupportRequestsToCloud(requests: SupportRequest[]) {
  try {
    const response = await fetch("/api/support-requests", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function writeSupportRequests(requests: SupportRequest[]) {
  const savedInCloud = await writeSupportRequestsToCloud(requests);

  if (savedInCloud || canUseBrowserOnlyPersistence()) {
    cacheSupportRequestsInStorage(requests);
  }

  return savedInCloud;
}

export type NotifyResult = {
  ok: boolean;
  delivered: boolean;
  recipient: string;
  message: string;
};

export async function notifyCounterpart(
  request: SupportRequest,
): Promise<NotifyResult> {
  const recipient = getRequestRecipient(request);

  try {
    const response = await fetch("/api/support-requests/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ request }),
    });

    const payload = (await response.json().catch(() => ({}))) as Partial<
      Omit<NotifyResult, "ok">
    >;

    return {
      ok: response.ok,
      delivered: Boolean(payload.delivered),
      recipient: payload.recipient ?? recipient,
      message:
        payload.message ??
        (response.ok
          ? "Aviso enviado à contraparte."
          : "Não foi possível enviar o aviso por e-mail."),
    };
  } catch {
    return {
      ok: false,
      delivered: false,
      recipient,
      message: "Falha de rede ao enviar o aviso por e-mail.",
    };
  }
}
