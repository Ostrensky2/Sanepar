"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cacheFieldDiaryEntries,
  createEmptyFieldDiaryPayload,
  dedupeFieldDiaryEntries,
  readFieldDiaryEntries,
  saveFieldDiaryEntry,
  type FieldDiaryEntry,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import { getStoredSession } from "@/lib/auth-users";

export type FieldDiaryFilters = {
  campaign: string;
  date: string;
  location: string;
  municipality: string;
  occurrence: "todos" | "sim" | "nao";
};

export const emptyFilters: FieldDiaryFilters = {
  campaign: "",
  date: "",
  location: "",
  municipality: "",
  occurrence: "todos",
};

type CampaignScope = {
  id: string;
  name: string;
};

type SaveResult = {
  persistence: "cloud" | "local";
  entry: FieldDiaryEntry;
};

export type FieldDiaryHookResult = {
  entries: FieldDiaryEntry[];
  filteredEntries: FieldDiaryEntry[];
  filters: FieldDiaryFilters;
  isLoading: boolean;
  formEntry: FieldDiaryPayload | null;
  viewEntry: FieldDiaryEntry | null;
  isImportOpen: boolean;
  setFilters: React.Dispatch<React.SetStateAction<FieldDiaryFilters>>;
  resetFilters: () => void;
  openNewForm: () => void;
  openEditForm: (entry: FieldDiaryEntry) => void;
  closeForm: () => void;
  openView: (entry: FieldDiaryEntry) => void;
  closeView: () => void;
  openImport: () => void;
  closeImport: () => void;
  handleSave: (payload: FieldDiaryPayload) => Promise<SaveResult | null>;
  applyImport: (imported: FieldDiaryEntry[]) => void;
};

export function useFieldDiary(campaignScope?: CampaignScope): FieldDiaryHookResult {
  const [entries, setEntries] = useState<FieldDiaryEntry[]>([]);
  const [filters, setFilters] = useState<FieldDiaryFilters>(emptyFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [formEntry, setFormEntry] = useState<FieldDiaryPayload | null>(null);
  const [viewEntry, setViewEntry] = useState<FieldDiaryEntry | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const campaignScopeId = campaignScope?.id ?? "";
  const campaignScopeName = campaignScope?.name ?? "";
  const isCampaignScoped = Boolean(campaignScope);

  useEffect(() => {
    let cancelled = false;

    async function loadEntries() {
      setIsLoading(true);
      const loadedEntries = await readFieldDiaryEntries();

      if (!cancelled) {
        setEntries(loadedEntries);
        setIsLoading(false);
      }
    }

    void loadEntries();
    return () => { cancelled = true; };
  }, []);

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const locationText = `${entry.locationName} ${entry.sia ?? ""}`.toLowerCase();
        const matchesCampaignScope =
          !campaignScopeId ||
          entry.campaignId === campaignScopeId ||
          entry.campaignName === campaignScopeName;

        return (
          matchesCampaignScope &&
          (isCampaignScoped || !filters.campaign || entry.campaignName === filters.campaign) &&
          (!filters.date || entry.entryDate === filters.date) &&
          (!filters.location || locationText.includes(filters.location.toLowerCase())) &&
          (!filters.municipality ||
            entry.municipality.toLowerCase().includes(filters.municipality.toLowerCase())) &&
          (filters.occurrence === "todos" ||
            (filters.occurrence === "sim" ? entry.hasOccurrence : !entry.hasOccurrence))
        );
      }),
    [campaignScopeId, campaignScopeName, entries, filters, isCampaignScoped],
  );

  function openNewForm() {
    const session = getStoredSession();
    const payload = createEmptyFieldDiaryPayload();
    const scopedCampaign = campaignScope
      ? { campaignId: campaignScope.id, campaignName: campaignScope.name }
      : {};

    setFormEntry({
      ...payload,
      ...scopedCampaign,
      createdBy: session?.userId ?? "",
      createdByName: session?.name ?? "",
    });
  }

  function openEditForm(entry: FieldDiaryEntry) {
    setFormEntry({
      id: entry.id,
      campaignId: entry.campaignId,
      campaignName: entry.campaignName,
      campaignDay: entry.campaignDay,
      entryDate: entry.entryDate,
      locationName: entry.locationName,
      sia: entry.sia,
      latitude: entry.latitude,
      longitude: entry.longitude,
      municipality: entry.municipality,
      activities: entry.activities,
      waterVisualConditions: entry.waterVisualConditions,
      hasOccurrence: entry.hasOccurrence,
      occurrenceType: entry.occurrenceType,
      occurrenceDescription: entry.occurrenceDescription,
      requiresFollowUp: entry.requiresFollowUp,
      followUpNotes: entry.followUpNotes,
      dailySummary: entry.dailySummary,
      status: entry.status,
      createdBy: entry.createdBy,
      createdByName: entry.createdByName,
    });
  }

  async function handleSave(payload: FieldDiaryPayload): Promise<SaveResult | null> {
    const scopedPayload = campaignScope
      ? { ...payload, campaignId: campaignScope.id, campaignName: campaignScope.name }
      : payload;

    const result = await saveFieldDiaryEntry(scopedPayload);

    setEntries((current) =>
      [result.entry, ...current.filter((entry) => entry.id !== result.entry.id)].sort(
        (a, b) =>
          b.entryDate.localeCompare(a.entryDate) ||
          b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
    setFormEntry(null);

    return result;
  }

  function applyImport(imported: FieldDiaryEntry[]) {
    const nextEntries = [...imported, ...entries.filter((e) => !imported.some((i) => i.id === e.id))];
    const deduped = dedupeFieldDiaryEntries(nextEntries);

    setEntries(deduped);
    cacheFieldDiaryEntries(deduped);
    setIsImportOpen(false);
  }

  return {
    entries,
    filteredEntries,
    filters,
    isLoading,
    formEntry,
    viewEntry,
    isImportOpen,
    setFilters,
    resetFilters: () => setFilters(emptyFilters),
    openNewForm,
    openEditForm,
    closeForm: () => setFormEntry(null),
    openView: (entry) => setViewEntry(entry),
    closeView: () => setViewEntry(null),
    openImport: () => setIsImportOpen(true),
    closeImport: () => setIsImportOpen(false),
    handleSave,
    applyImport,
  };
}
