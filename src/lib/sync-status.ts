export type SyncState = "checking" | "synced" | "pending" | "offline";

export type SyncStatusSnapshot = {
  state: SyncState;
  reason: string;
  lastSyncedAt: string | null;
  updatedAt: string;
};

export const SYNC_STATUS_STORAGE_KEY = "yvae:sync-status";
export const SYNC_STATUS_EVENT = "yvae:sync-status-updated";

const defaultSyncStatus: SyncStatusSnapshot = {
  state: "checking",
  reason: "Verificando conexão com a nuvem.",
  lastSyncedAt: null,
  updatedAt: new Date(0).toISOString(),
};

export function readSyncStatusSnapshot(): SyncStatusSnapshot {
  if (typeof window === "undefined") {
    return defaultSyncStatus;
  }

  try {
    const raw = window.localStorage.getItem(SYNC_STATUS_STORAGE_KEY);
    if (!raw) return defaultSyncStatus;

    const parsed = JSON.parse(raw) as Partial<SyncStatusSnapshot>;
    return {
      state: isSyncState(parsed.state) ? parsed.state : "checking",
      reason: typeof parsed.reason === "string" ? parsed.reason : defaultSyncStatus.reason,
      lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultSyncStatus;
  }
}

export function writeSyncStatusSnapshot(next: Omit<SyncStatusSnapshot, "updatedAt">) {
  if (typeof window === "undefined") return;

  const snapshot: SyncStatusSnapshot = {
    ...next,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(SYNC_STATUS_STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: snapshot }));
}

export function markSynced(reason = "Dados sincronizados com a nuvem.") {
  writeSyncStatusSnapshot({
    state: "synced",
    reason,
    lastSyncedAt: new Date().toISOString(),
  });
}

export function markPending(reason: string) {
  const current = readSyncStatusSnapshot();
  writeSyncStatusSnapshot({
    state: "pending",
    reason,
    lastSyncedAt: current.lastSyncedAt,
  });
}

export function markOffline(reason: string) {
  const current = readSyncStatusSnapshot();
  writeSyncStatusSnapshot({
    state: "offline",
    reason,
    lastSyncedAt: current.lastSyncedAt,
  });
}

export function formatLastSyncLabel(lastSyncedAt: string | null, now = new Date()) {
  if (!lastSyncedAt) {
    return "nunca sincronizado";
  }

  const syncedAt = new Date(lastSyncedAt);
  if (Number.isNaN(syncedAt.getTime())) {
    return "sincronização desconhecida";
  }

  const elapsedMs = Math.max(0, now.getTime() - syncedAt.getTime());
  const minutes = Math.floor(elapsedMs / 60000);

  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

const technicalReasonPattern =
  /typeerror|fetch failed|econnrefused|enotfound|etimedout|abort|exception|stack|getaddrinfo|socket|ssl|tls/i;

export function sanitizeCloudReason(
  reason: string | null | undefined,
  fallback = "Não foi possível conectar à nuvem.",
) {
  const trimmed = (reason ?? "").trim();

  if (!trimmed || technicalReasonPattern.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

function isSyncState(value: unknown): value is SyncState {
  return value === "checking" || value === "synced" || value === "pending" || value === "offline";
}
