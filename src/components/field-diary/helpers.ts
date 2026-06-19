import bundledCampaignMapPoints from "@/data/campaign-map-points.json";
import type { FieldDiaryEntry, FieldDiaryPayload } from "@/lib/field-diary";
import {
  campaignCollectionStartDates,
  operationalStageDescriptions,
  type FieldDiaryPointOption,
  type OperationalStage,
} from "@/components/field-diary/constants";

export type FieldDiarySummary = Record<OperationalStage, number> & {
  total: number;
  withoutCoordinates: number;
};

export type FieldDiaryDayGroup = {
  key: string;
  campaignName: string;
  campaignDay: number;
  entryDate: string;
  entries: FieldDiaryEntry[];
  summary: FieldDiarySummary;
};

export function uniqueSorted(values: Array<string | number | null | undefined>) {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

export function summarizeFieldDiaryEntries(entries: FieldDiaryEntry[]): FieldDiarySummary {
  const summary: FieldDiarySummary = {
    total: entries.length,
    planned: 0,
    recorded: 0,
    occurrence: 0,
    incomplete: 0,
    withoutCoordinates: 0,
  };

  for (const entry of entries) {
    summary[getOperationalStage(entry)] += 1;
    if (!hasCoordinatePair(entry)) summary.withoutCoordinates += 1;
  }

  return summary;
}

export function groupEntriesByFieldDay(entries: FieldDiaryEntry[]): FieldDiaryDayGroup[] {
  const groups = new Map<string, FieldDiaryEntry[]>();

  for (const entry of entries) {
    const key = [entry.campaignName, entry.entryDate, entry.campaignDay].join("|");
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return [...groups.entries()]
    .map(([key, groupEntries]) => {
      const first = groupEntries[0];
      return {
        key,
        campaignName: first.campaignName,
        campaignDay: first.campaignDay,
        entryDate: first.entryDate,
        entries: [...groupEntries].sort((a, b) =>
          (a.locationName || a.sia || "").localeCompare(b.locationName || b.sia || "", "pt-BR", { numeric: true }),
        ),
        summary: summarizeFieldDiaryEntries(groupEntries),
      };
    })
    .sort(
      (a, b) =>
        b.entryDate.localeCompare(a.entryDate) ||
        b.campaignDay - a.campaignDay ||
        a.campaignName.localeCompare(b.campaignName, "pt-BR"),
    );
}

export function hasCoordinatePair(entry: FieldDiaryEntry) {
  return Boolean(String(entry.latitude ?? "").trim() && String(entry.longitude ?? "").trim());
}

function hasDiaryContent(entry: FieldDiaryEntry) {
  return Boolean(
    entry.activities.length ||
      entry.waterVisualConditions.length ||
      String(entry.dailySummary ?? "").trim() ||
      String(entry.followUpNotes ?? "").trim() ||
      hasCoordinatePair(entry),
  );
}

export function getOperationalStage(entry: FieldDiaryEntry): OperationalStage {
  if (!String(entry.locationName ?? "").trim() || !String(entry.municipality ?? "").trim()) {
    return "incomplete";
  }

  if (entry.hasOccurrence) {
    return "occurrence";
  }

  return hasDiaryContent(entry) ? "recorded" : "planned";
}

export function getOperationalSummary(entry: FieldDiaryEntry) {
  const summary = String(entry.dailySummary ?? "").trim();
  if (summary) return summary;

  const details = [
    entry.activities.length ? `Atividades: ${entry.activities.join(", ")}` : "",
    entry.waterVisualConditions.length ? `Água: ${entry.waterVisualConditions.join(", ")}` : "",
    entry.followUpNotes ? `Pendência: ${entry.followUpNotes}` : "",
  ].filter(Boolean);

  return details.join(" · ") || operationalStageDescriptions[getOperationalStage(entry)];
}

export function validateEntry(entry: FieldDiaryPayload) {
  if (!entry.campaignName.trim()) return "Informe a campanha.";
  if (!entry.campaignDay || entry.campaignDay < 1) return "Informe um dia de campanha válido.";
  if (!entry.entryDate) return "Informe a data.";
  const hasOperationalData = [
    entry.locationName,
    entry.sia,
    entry.latitude,
    entry.longitude,
    entry.municipality,
    entry.dailySummary,
    entry.occurrenceType,
    entry.occurrenceDescription,
    entry.followUpNotes,
  ].some((value) => String(value ?? "").trim()) ||
    entry.activities.length > 0 ||
    entry.waterVisualConditions.length > 0;

  if (!hasOperationalData) return "Informe ao menos um dado operacional do registro.";
  return "";
}

function buildFieldDiaryPointOptions() {
  const byKey = new Map<string, FieldDiaryPointOption>();

  for (const point of bundledCampaignMapPoints) {
    const locationName = String(point.waterBody ?? "").trim();
    const sia = String(point.code ?? "").trim();
    const municipality = String(point.municipality ?? "").trim();

    if (!locationName && !sia && !municipality) {
      continue;
    }

    const key = [
      normalizeFieldDiaryPointKey(sia),
      normalizeFieldDiaryPointKey(locationName),
      normalizeFieldDiaryPointKey(municipality),
    ].join("|");

    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key || `point-${byKey.size}`,
        locationName,
        sia,
        municipality,
      });
    }
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.locationName.localeCompare(b.locationName, "pt-BR", { numeric: true }) ||
      a.sia.localeCompare(b.sia, "pt-BR", { numeric: true }),
  );
}

export const fieldDiaryPointOptions: FieldDiaryPointOption[] = buildFieldDiaryPointOptions();

export function findFieldDiaryPointOption(entry: FieldDiaryPayload) {
  const entrySia = normalizeFieldDiaryPointKey(entry.sia);
  const entryLocation = normalizeFieldDiaryPointKey(entry.locationName);
  const entryMunicipality = normalizeFieldDiaryPointKey(entry.municipality);

  return (
    fieldDiaryPointOptions.find(
      (point) =>
        entrySia &&
        normalizeFieldDiaryPointKey(point.sia) === entrySia &&
        (!entryLocation || normalizeFieldDiaryPointKey(point.locationName) === entryLocation),
    ) ??
    fieldDiaryPointOptions.find(
      (point) =>
        entryLocation &&
        normalizeFieldDiaryPointKey(point.locationName) === entryLocation &&
        (!entryMunicipality || normalizeFieldDiaryPointKey(point.municipality) === entryMunicipality),
    ) ??
    null
  );
}

export function normalizeFieldDiaryPointKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

export function getCampaignCalendarMonthStart(
  campaignId: string,
  campaignName: string,
  entries: FieldDiaryEntry[],
) {
  return (
    campaignCollectionStartDates[campaignId] ??
    entries
      .filter(
        (entry) =>
          entry.campaignId === campaignId ||
          Boolean(campaignName && entry.campaignName === campaignName),
      )
      .map((entry) => entry.entryDate.slice(0, 10))
      .filter(isISODate)
      .sort()
      .at(0) ??
    todayISO()
  ).slice(0, 7) + "-01";
}

export function buildCalendarDays(monthStart: string) {
  const [year, month] = monthStart.slice(0, 10).split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const firstVisible = new Date(first);
  firstVisible.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisible);
    date.setDate(firstVisible.getDate() + index);
    const iso = toLocalISODate(date);

    return {
      date: iso,
      inMonth: date.getMonth() === month - 1,
    };
  });
}

export function buildCollectionDaysByDate(entries: FieldDiaryEntry[]) {
  const dates = uniqueSorted(
    entries
      .map((entry) => entry.entryDate.slice(0, 10))
      .filter(isISODate),
  );

  return new Map(dates.map((date, index) => [date, index + 1]));
}

export function getCollectionDayForDate(entries: FieldDiaryEntry[], date: string) {
  const collectionDays = buildCollectionDaysByDate(entries);
  const existing = collectionDays.get(date);

  if (existing) {
    return existing;
  }

  return [...collectionDays.keys()].filter((knownDate) => knownDate < date).length + 1;
}

export function shiftMonth(monthStart: string, offset: number) {
  const [year, month] = monthStart.slice(0, 7).split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-01`;
}

export function formatCalendarMonth(monthStart: string) {
  const [year, month] = monthStart.slice(0, 7).split("-").map(Number);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function todayISO() {
  return toLocalISODate(new Date());
}

function toLocalISODate(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function isISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function formatCoordinatePair(latitude?: string | null, longitude?: string | null) {
  const lat = String(latitude ?? "").trim();
  const lon = String(longitude ?? "").trim();

  return lat && lon ? `${lat}, ${lon}` : "Sem coordenada";
}
