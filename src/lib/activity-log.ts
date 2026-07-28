import type { AuthSession } from "@/lib/auth-users";

export const ACTIVITY_LOG_STORAGE_KEY = "yvae:activity-log";

export type ActivityKind = "login" | "page.view" | "document.change";

export type ActivityLogEntry = {
  id: string;
  timestamp: string;
  kind: ActivityKind;
  userId: string;
  name: string;
  email: string;
  role: string;
  target: string;
  detail: string;
};

export function readActivityLog(): ActivityLogEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY) ?? "[]");

    return Array.isArray(parsed)
      ? parsed.filter(isActivityLogEntry).slice(0, 500)
      : [];
  } catch {
    return [];
  }
}

export async function fetchCentralActivityLogs(): Promise<ActivityLogEntry[]> {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const response = await fetch("/api/activity-log", { cache: "no-store" });
    const data = (await response.json()) as { activities?: unknown };

    if (response.ok && Array.isArray(data.activities)) {
      const cloudLogs = data.activities.filter(isActivityLogEntry);
      const localLogs = readActivityLog();

      return mergeActivityLogs(cloudLogs, localLogs);
    }
  } catch {
    // Fallback silencioso para o storage local se a API falhar
  }

  return readActivityLog();
}

export function recordActivity(
  session: AuthSession | null,
  kind: ActivityKind,
  target: string,
  detail: string,
) {
  if (typeof window === "undefined" || !session) {
    return;
  }

  const entry: ActivityLogEntry = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    kind,
    userId: session.userId,
    name: session.name,
    email: session.email,
    role: session.role,
    target,
    detail,
  };

  const nextLog = [entry, ...readActivityLog()].slice(0, 500);

  window.localStorage.setItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(nextLog));
  window.dispatchEvent(new Event("yvae:activity-log-updated"));

  // Disparo assíncrono para gravação central no Supabase (não-bloqueante)
  void fetch("/api/activity-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {
    // Ignora erro no envio de log em segundo plano
  });
}

export function mergeActivityLogs(
  cloudLogs: ActivityLogEntry[],
  localLogs: ActivityLogEntry[],
): ActivityLogEntry[] {
  const map = new Map<string, ActivityLogEntry>();

  for (const entry of localLogs) {
    map.set(entry.id, entry);
  }

  for (const entry of cloudLogs) {
    map.set(entry.id, entry);
  }

  return Array.from(map.values())
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 1000);
}

function isActivityLogEntry(value: unknown): value is ActivityLogEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ActivityLogEntry>;

  return Boolean(
    candidate.id &&
      candidate.timestamp &&
      candidate.kind &&
      candidate.userId &&
      candidate.name &&
      candidate.email,
  );
}
