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

export function readActivityLog() {
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
