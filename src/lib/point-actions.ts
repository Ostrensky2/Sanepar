export const POINT_ACTIONS_STORAGE_KEY = "yvae:point-actions";
const POINT_ACTIONS_UPDATED_EVENT = "yvae:point-actions-updated";

export type PointActionPhoto = {
  id: string;
  url: string;
  caption: string;
};

export type PointActionSamplePoint = {
  id: string;
  waterBody: string;
  dates: string;
  municipality: string;
  effectiveLat: number;
  effectiveLon: number;
  results: string;
  photos: PointActionPhoto[];
};

export type PointActionEvent = {
  id: string;
  eventName: string;
  objectives: string;
  document?: {
    id: string;
    title: string;
    dropboxUrl: string;
    type: string;
  } | null;
  createdAt: string;
  points: PointActionSamplePoint[];
};

export function readPointActionsFromStorage() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(POINT_ACTIONS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(isPointActionEvent)
      : [];
  } catch {
    return [];
  }
}

export function writePointActionsToStorage(actions: PointActionEvent[]) {
  cachePointActionsInStorage(actions);
  window.dispatchEvent(new Event(POINT_ACTIONS_UPDATED_EVENT));
}

export async function readPointActions() {
  const localActions = readPointActionsFromStorage();

  try {
    const response = await fetch("/api/point-actions", {
      cache: "no-store",
    });

    if (!response.ok) {
      return localActions;
    }

    const payload = (await response.json()) as { actions?: unknown };
    const cloudActions = Array.isArray(payload.actions)
      ? payload.actions.filter(isPointActionEvent)
      : [];

    if (cloudActions.length) {
      cachePointActionsInStorage(cloudActions);
      return cloudActions;
    }

    if (localActions.length) {
      await writePointActions(localActions);
      return localActions;
    }

    return [];
  } catch {
    return localActions;
  }
}

function cachePointActionsInStorage(actions: PointActionEvent[]) {
  window.localStorage.setItem(POINT_ACTIONS_STORAGE_KEY, JSON.stringify(actions));
}

export async function writePointActions(actions: PointActionEvent[]) {
  writePointActionsToStorage(actions);

  try {
    const response = await fetch("/api/point-actions", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actions }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function isPointActionEvent(value: unknown): value is PointActionEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PointActionEvent>;

  return Boolean(
    candidate.id &&
      candidate.eventName &&
      typeof candidate.objectives === "string" &&
      Array.isArray(candidate.points),
  );
}
