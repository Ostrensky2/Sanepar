import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";

export const FIELD_DIARY_STORAGE_KEY = "yvae:field-diary-entries";
export const FIELD_DIARY_UPDATED_EVENT = "yvae:field-diary-updated";

export const activityOptions = [
  "Coleta realizada",
  "Deslocamento entre pontos",
  "Vistoria visual",
  "Medição em campo",
  "Contato com equipe local",
  "Coleta não realizada",
  "Outra atividade",
];

export const waterVisualConditionOptions = [
  "Aparentemente normal",
  "Alteração de cor",
  "Turbidez visual elevada",
  "Espuma",
  "Material flutuante",
  "Odor perceptível",
  "Presença aparente de floração",
  "Resíduos",
  "Peixes ou organismos mortos",
  "Nível de água visualmente baixo",
  "Outra condição",
];

export const occurrenceTypeOptions = [
  "Problema de acesso ao ponto",
  "Ponto inacessível",
  "Coleta parcial",
  "Coleta não realizada",
  "Atraso operacional",
  "Problema com equipamento",
  "Condição climática adversa",
  "Alteração ambiental observada",
  "Demanda recebida em campo",
  "Outro",
];

export const followUpOptions = ["Não", "Sim", "Avaliar posteriormente"] as const;
export const fieldDiaryStatusOptions = ["Rascunho", "Enviado", "Revisado"] as const;
export const weatherConditionOptions = [
  "Sol",
  "Sol entre nuvens",
  "Nublado Pós Chuva",
  "Chuvoso",
  "Chuva forte",
  "Tempestade",
  "Garoando",
  "Nublado / Neblina",
  "Não informado",
] as const;
export const pointAccessibilityOptions = [
  "Fácil",
  "Moderado",
  "Difícil",
  "Inacessível",
] as const;

export type FieldDiaryStatus = (typeof fieldDiaryStatusOptions)[number];
export type FieldDiaryFollowUp = (typeof followUpOptions)[number];
export type WeatherCondition = (typeof weatherConditionOptions)[number];
export type PointAccessibility = (typeof pointAccessibilityOptions)[number];

export type FieldDiaryEntry = {
  id: string;
  campaignId?: string | null;
  campaignName: string;
  campaignDay: number;
  entryDate: string;
  collectionTime: string;
  locationName: string;
  sia?: string | null;
  samplesReplicasEdna?: string | null;
  zooplanktonId?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  municipality: string;
  activities: string[];
  waterVisualConditions: string[];
  hasOccurrence: boolean;
  occurrenceType?: string | null;
  occurrenceDescription?: string | null;
  requiresFollowUp: FieldDiaryFollowUp;
  followUpNotes?: string | null;
  weatherConditions?: WeatherCondition | "";
  pointAccessibility?: PointAccessibility | "";
  dailySummary: string;
  status: FieldDiaryStatus;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FieldDiaryPayload = Omit<FieldDiaryEntry, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function createEmptyFieldDiaryPayload(): FieldDiaryPayload {
  return {
    campaignId: "campanha-1-verao-2026",
    campaignName: "1ª Campanha - Verão 2026",
    campaignDay: 1,
    entryDate: todayIsoDate(),
    collectionTime: "",
    locationName: "",
    sia: "",
    samplesReplicasEdna: "",
    zooplanktonId: "",
    latitude: "",
    longitude: "",
    municipality: "",
    activities: [],
    waterVisualConditions: [],
    hasOccurrence: false,
    occurrenceType: "",
    occurrenceDescription: "",
    requiresFollowUp: "Não",
    followUpNotes: "",
    weatherConditions: "",
    pointAccessibility: "",
    dailySummary: "",
    status: "Rascunho",
    createdBy: "",
    createdByName: "",
  };
}

export function readFieldDiaryEntriesFromStorage() {
  if (typeof window === "undefined" || !canUseBrowserOnlyPersistence()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(FIELD_DIARY_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
        ? dedupeFieldDiaryEntries(
            parsed.map(normalizeFieldDiaryEntry).filter((entry): entry is FieldDiaryEntry => entry !== null),
          )
      : [];
  } catch {
    return [];
  }
}

export function cacheFieldDiaryEntries(entries: FieldDiaryEntry[]) {
  if (!canUseBrowserOnlyPersistence()) {
    return;
  }

  window.localStorage.setItem(FIELD_DIARY_STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(FIELD_DIARY_UPDATED_EVENT));
}

export async function readFieldDiaryEntries() {
  const localEntries = readFieldDiaryEntriesFromStorage();

  try {
    const response = await fetch("/api/field-diary", {
      cache: "no-store",
    });

    if (!response.ok) {
      return canUseBrowserOnlyPersistence() ? localEntries : [];
    }

    const payload = (await response.json()) as { entries?: unknown };
    const entries = Array.isArray(payload.entries)
      ? payload.entries.map(normalizeFieldDiaryEntry).filter((entry): entry is FieldDiaryEntry => entry !== null)
      : [];

    const dedupedEntries = dedupeFieldDiaryEntries(entries);
    cacheFieldDiaryEntries(dedupedEntries);
    return dedupedEntries;
  } catch {
    return canUseBrowserOnlyPersistence() ? localEntries : [];
  }
}

export async function saveFieldDiaryEntry(payload: FieldDiaryPayload) {
  const now = new Date().toISOString();
  const localEntries = readFieldDiaryEntriesFromStorage();
  const entry: FieldDiaryEntry = {
    ...payload,
    id: payload.id ?? crypto.randomUUID(),
    campaignId: payload.campaignId ?? null,
    sia: payload.sia ?? "",
    collectionTime: payload.collectionTime ?? "",
    samplesReplicasEdna: payload.samplesReplicasEdna ?? "",
    zooplanktonId: payload.zooplanktonId ?? "",
    occurrenceType: payload.hasOccurrence ? payload.occurrenceType : "",
    occurrenceDescription: payload.hasOccurrence ? payload.occurrenceDescription : "",
    followUpNotes: payload.followUpNotes ?? "",
    weatherConditions: payload.weatherConditions ?? "",
    pointAccessibility: payload.pointAccessibility ?? "",
    createdBy: payload.createdBy ?? "",
    createdByName: payload.createdByName ?? "",
    createdAt: localEntries.find((item) => item.id === payload.id)?.createdAt ?? now,
    updatedAt: now,
  };
  try {
    const response = await fetch("/api/field-diary", {
      method: entry.id === payload.id ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entry }),
    });

    if (!response.ok) {
      if (canUseBrowserOnlyPersistence()) {
        const nextEntries = mergeLocalFieldDiaryEntry(localEntries, entry);
        cacheFieldDiaryEntries(nextEntries);
        return { entry, persistence: "browser" as const };
      }

      return { entry, persistence: "none" as const };
    }

    const result = (await response.json()) as { entry?: unknown };
    const savedEntry = normalizeFieldDiaryEntry(result.entry) ?? entry;
    const refreshedEntries = [
      savedEntry,
      ...localEntries.filter((item) => item.id !== savedEntry.id),
    ].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt));

    cacheFieldDiaryEntries(refreshedEntries);
    return { entry: savedEntry, persistence: "cloud" as const };
  } catch {
    if (canUseBrowserOnlyPersistence()) {
      const nextEntries = mergeLocalFieldDiaryEntry(localEntries, entry);
      cacheFieldDiaryEntries(nextEntries);
      return { entry, persistence: "browser" as const };
    }

    return { entry, persistence: "none" as const };
  }
}

function mergeLocalFieldDiaryEntry(
  entries: FieldDiaryEntry[],
  entry: FieldDiaryEntry,
) {
  return [
    entry,
    ...entries.filter((item) => item.id !== entry.id),
  ].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt));
}

export function normalizeFieldDiaryEntry(value: unknown): FieldDiaryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<FieldDiaryEntry>;
  const campaignName = String(candidate.campaignName ?? "").trim();
  const locationName = String(candidate.locationName ?? "").trim();
  const municipality = String(candidate.municipality ?? "").trim();
  const dailySummary = String(candidate.dailySummary ?? "").trim();

  if (!candidate.id) {
    return null;
  }

  const entryDate = normalizeEntryDate(candidate.entryDate);

  return {
    id: String(candidate.id),
    campaignId: candidate.campaignId ? String(candidate.campaignId) : null,
    campaignName,
    campaignDay: Number(candidate.campaignDay) || 1,
    entryDate,
    collectionTime: candidate.collectionTime ? String(candidate.collectionTime) : "",
    locationName,
    sia: candidate.sia ? String(candidate.sia) : "",
    samplesReplicasEdna: candidate.samplesReplicasEdna ? String(candidate.samplesReplicasEdna) : "",
    zooplanktonId: candidate.zooplanktonId ? String(candidate.zooplanktonId) : "",
    latitude: candidate.latitude ? String(candidate.latitude) : "",
    longitude: candidate.longitude ? String(candidate.longitude) : "",
    municipality,
    activities: toStringArray(candidate.activities),
    waterVisualConditions: toStringArray(candidate.waterVisualConditions),
    hasOccurrence: Boolean(candidate.hasOccurrence),
    occurrenceType: candidate.occurrenceType ? String(candidate.occurrenceType) : "",
    occurrenceDescription: candidate.occurrenceDescription ? String(candidate.occurrenceDescription) : "",
    requiresFollowUp: normalizeFollowUp(candidate.requiresFollowUp),
    followUpNotes: candidate.followUpNotes ? String(candidate.followUpNotes) : "",
    weatherConditions: normalizeWeatherCondition(candidate.weatherConditions),
    pointAccessibility: normalizePointAccessibility(candidate.pointAccessibility),
    dailySummary,
    status: normalizeStatus(candidate.status),
    createdBy: candidate.createdBy ? String(candidate.createdBy) : "",
    createdByName: candidate.createdByName ? String(candidate.createdByName) : "",
    createdAt: String(candidate.createdAt ?? new Date().toISOString()),
    updatedAt: String(candidate.updatedAt ?? candidate.createdAt ?? new Date().toISOString()),
  };
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

export function dedupeFieldDiaryEntries(entries: FieldDiaryEntry[]) {
  const byKey = new Map<string, FieldDiaryEntry>();

  for (const entry of entries) {
    const key = fieldDiaryEntryKey(entry);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeFieldDiaryEntries(existing, entry) : entry);
  }

  return [...byKey.values()].sort(
    (a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function fieldDiaryEntryKey(entry: Pick<FieldDiaryEntry, "campaignName" | "entryDate" | "locationName" | "sia">) {
  const pointKey = normalizeKeyPart(entry.sia) || normalizeKeyPart(entry.locationName);
  return [
    normalizeKeyPart(entry.campaignName),
    String(entry.entryDate ?? "").slice(0, 10),
    pointKey,
  ].join("|");
}

function mergeFieldDiaryEntries(base: FieldDiaryEntry, incoming: FieldDiaryEntry): FieldDiaryEntry {
  const preferred = scoreFieldDiaryEntry(incoming) >= scoreFieldDiaryEntry(base) ? incoming : base;
  const fallback = preferred === incoming ? base : incoming;

  return {
    ...fallback,
    ...preferred,
    campaignId: preferred.campaignId || fallback.campaignId,
    campaignName: preferred.campaignName || fallback.campaignName,
    locationName: preferred.locationName || fallback.locationName,
    sia: preferred.sia || fallback.sia,
    collectionTime: preferred.collectionTime || fallback.collectionTime,
    samplesReplicasEdna: preferred.samplesReplicasEdna || fallback.samplesReplicasEdna,
    zooplanktonId: preferred.zooplanktonId || fallback.zooplanktonId,
    latitude: preferred.latitude || fallback.latitude,
    longitude: preferred.longitude || fallback.longitude,
    municipality: preferred.municipality || fallback.municipality,
    activities: preferred.activities.length ? preferred.activities : fallback.activities,
    waterVisualConditions: preferred.waterVisualConditions.length
      ? preferred.waterVisualConditions
      : fallback.waterVisualConditions,
    hasOccurrence: preferred.hasOccurrence || fallback.hasOccurrence,
    occurrenceType: preferred.occurrenceType || fallback.occurrenceType,
    occurrenceDescription: preferred.occurrenceDescription || fallback.occurrenceDescription,
    followUpNotes: preferred.followUpNotes || fallback.followUpNotes,
    weatherConditions: preferred.weatherConditions || fallback.weatherConditions,
    pointAccessibility: preferred.pointAccessibility || fallback.pointAccessibility,
    dailySummary: preferred.dailySummary || fallback.dailySummary,
    createdAt: base.createdAt < incoming.createdAt ? base.createdAt : incoming.createdAt,
    updatedAt: base.updatedAt > incoming.updatedAt ? base.updatedAt : incoming.updatedAt,
  };
}

function scoreFieldDiaryEntry(entry: FieldDiaryEntry) {
  return [
    entry.locationName,
    entry.sia,
    entry.collectionTime,
    entry.samplesReplicasEdna,
    entry.zooplanktonId,
    entry.latitude,
    entry.longitude,
    entry.municipality,
    entry.weatherConditions,
    entry.pointAccessibility,
    entry.occurrenceType,
    entry.occurrenceDescription,
    entry.followUpNotes,
    entry.dailySummary,
    entry.createdByName,
  ].filter((value) => String(value ?? "").trim()).length +
    entry.activities.length +
    entry.waterVisualConditions.length;
}

function normalizeKeyPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeFollowUp(value: unknown): FieldDiaryFollowUp {
  return followUpOptions.find((option) => option === value) ?? "Não";
}

function normalizeStatus(value: unknown): FieldDiaryStatus {
  return fieldDiaryStatusOptions.find((option) => option === value) ?? "Rascunho";
}

function normalizeWeatherCondition(value: unknown): WeatherCondition | "" {
  return weatherConditionOptions.find((option) => option === value) ?? "";
}

function normalizePointAccessibility(value: unknown): PointAccessibility | "" {
  return pointAccessibilityOptions.find((option) => option === value) ?? "";
}

function normalizeEntryDate(value: unknown) {
  const date = String(value ?? todayIsoDate()).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIsoDate();
}
