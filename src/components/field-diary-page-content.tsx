"use client";

import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  ListFilter,
  MapPin,
  Pencil,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "@/components/section-card";
import {
  DashboardSkeleton,
  ErrorBoundary,
} from "@/components/operational-feedback";
import {
  campaignOptions,
  inputClassName,
  operationalStageLabels,
  type FieldDiaryCampaignScope,
  type OperationalStage,
  type ViewMode,
} from "@/components/field-diary/constants";
import {
  formatCoordinatePair,
  formatDate,
  getCampaignCalendarMonthStart,
  getCollectionDayForDate,
  getOperationalStage,
  groupEntriesByFieldDay,
  hasCoordinatePair,
  summarizeFieldDiaryEntries,
  validateEntry,
} from "@/components/field-diary/helpers";
import {
  CampaignChoicePanel,
  FieldDiaryMonthCalendar,
  SelectedFieldDiaryDay,
} from "@/components/field-diary/calendar";
import { FieldDiaryForm } from "@/components/field-diary/form";
import { FieldDiaryImport } from "@/components/field-diary/import";
import {
  Checklist,
  EmptyState,
  Field,
  IconButton,
  ImportButton,
  NewEntryButton,
  OperationalMetric,
  StageBadge,
} from "@/components/field-diary/ui";
import { FieldDiaryView } from "@/components/field-diary/view";
import {
  activityOptions,
  cacheFieldDiaryEntries,
  createEmptyFieldDiaryPayload,
  dedupeFieldDiaryEntries,
  readFieldDiaryEntries,
  saveFieldDiaryEntry,
  waterVisualConditionOptions,
  type FieldDiaryEntry,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import { getStoredSession } from "@/lib/auth-users";

type Filters = {
  campaign: string;
  date: string;
  dateFrom: string;
  dateTo: string;
  location: string;
  municipality: string;
  occurrence: "todos" | "sim" | "nao";
  activities: string[];
  waterConditions: string[];
  occurrenceType: string;
  status: string;
  followUp: string;
  responsible: string;
  campaignDay: string;
  dayFrom: string;
  dayTo: string;
  operationalStage: OperationalStage | "";
  hasCoordinates: "todos" | "sim" | "nao";
  hasFollowUpNotes: "todos" | "sim" | "nao";
  search: string;
};

const emptyFilters: Filters = {
  campaign: "",
  date: "",
  dateFrom: "",
  dateTo: "",
  location: "",
  municipality: "",
  occurrence: "todos",
  activities: [],
  waterConditions: [],
  occurrenceType: "",
  status: "",
  followUp: "",
  responsible: "",
  campaignDay: "",
  dayFrom: "",
  dayTo: "",
  operationalStage: "",
  hasCoordinates: "todos",
  hasFollowUpNotes: "todos",
  search: "",
};

function uniqueSorted(values: Array<string | number | null | undefined>) {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

export function FieldDiaryPageContent({
  campaignScope,
  readOnly = false,
  hideHeader = false,
}: {
  campaignScope?: FieldDiaryCampaignScope;
  readOnly?: boolean;
  hideHeader?: boolean;
} = {}) {
  const initialScopedCalendarStart = campaignScope
    ? getCampaignCalendarMonthStart(campaignScope.id, campaignScope.name, [])
    : "";
  const [entries, setEntries] = useState<FieldDiaryEntry[]>([]);
  const [filters, setFilters] = useState<Filters>(() =>
    campaignScope ? { ...emptyFilters, date: initialScopedCalendarStart } : emptyFilters,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [formEntry, setFormEntry] = useState<FieldDiaryPayload | null>(null);
  const [viewEntry, setViewEntry] = useState<FieldDiaryEntry | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [message, setMessage] = useState("");
  const [selectedDiaryCampaignId, setSelectedDiaryCampaignId] = useState("");
  const [selectedDiaryDate, setSelectedDiaryDate] = useState(initialScopedCalendarStart);
  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState(initialScopedCalendarStart);
  const isCampaignScoped = Boolean(campaignScope);
  const campaignScopeId = campaignScope?.id ?? "";
  const campaignScopeName = campaignScope?.name ?? "";
  const selectedDiaryCampaign = useMemo(
    () => campaignOptions.find((campaign) => campaign.id === selectedDiaryCampaignId) ?? null,
    [selectedDiaryCampaignId],
  );
  const activeCampaignId = campaignScopeId || selectedDiaryCampaign?.id || "";
  const activeCampaignName = campaignScopeName || selectedDiaryCampaign?.name || "";
  const hasActiveDiaryCampaign = Boolean(isCampaignScoped || selectedDiaryCampaign);
  const calendarMonthStart = useMemo(
    () => getCampaignCalendarMonthStart(activeCampaignId, activeCampaignName, entries),
    [activeCampaignId, activeCampaignName, entries],
  );
  const activeCalendarMonth = visibleCalendarMonth || calendarMonthStart;
  const hasUserPickedDiaryDateRef = useRef(false);

  useEffect(() => {
    async function loadEntries() {
      setIsLoading(true);
      const loadedEntries = await readFieldDiaryEntries();
      setEntries(loadedEntries);
      setIsLoading(false);
    }

    void loadEntries();
  }, []);

  const scopedEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          !activeCampaignId ||
          entry.campaignId === activeCampaignId ||
          entry.campaignName === activeCampaignName,
      ),
    [activeCampaignId, activeCampaignName, entries],
  );

  // Sem interação do usuário, o calendário abre no primeiro dia que tem
  // registros da campanha em vez do dia 1 do mês (que pode estar vazio).
  useEffect(() => {
    if (isLoading || hasUserPickedDiaryDateRef.current || !hasActiveDiaryCampaign) {
      return;
    }

    const entryDates = scopedEntries
      .map((entry) => entry.entryDate.slice(0, 10))
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort();

    if (!entryDates.length || (selectedDiaryDate && entryDates.includes(selectedDiaryDate))) {
      return;
    }

    const firstEntryDate = entryDates[0];
    const timeout = window.setTimeout(() => {
      setSelectedDiaryDate(firstEntryDate);
      setVisibleCalendarMonth(`${firstEntryDate.slice(0, 7)}-01`);
      setFilters((current) => ({
        ...current,
        date: firstEntryDate,
        dateFrom: "",
        dateTo: "",
      }));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [hasActiveDiaryCampaign, isLoading, scopedEntries, selectedDiaryDate]);

  const filterOptions = useMemo(() => {
    const activities = new Set<string>();
    const waterConditions = new Set<string>();
    for (const entry of scopedEntries) {
      for (const activity of entry.activities) activities.add(activity);
      for (const condition of entry.waterVisualConditions) waterConditions.add(condition);
    }
    return {
      campaigns: uniqueSorted(scopedEntries.map((entry) => entry.campaignName)),
      municipalities: uniqueSorted(scopedEntries.map((entry) => entry.municipality)),
      responsibles: uniqueSorted(scopedEntries.map((entry) => entry.createdByName)),
      campaignDays: uniqueSorted(scopedEntries.map((entry) => String(entry.campaignDay))),
      occurrenceTypes: uniqueSorted(scopedEntries.map((entry) => entry.occurrenceType)),
      statuses: uniqueSorted(scopedEntries.map((entry) => entry.status)),
      followUps: uniqueSorted(scopedEntries.map((entry) => entry.requiresFollowUp)),
      activities: [...activities].sort((a, b) => a.localeCompare(b, "pt-BR")),
      waterConditions: [...waterConditions].sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  }, [scopedEntries]);

  const filteredEntries = useMemo(
    () =>
      scopedEntries.filter((entry) => {
        const locationText = `${entry.locationName} ${entry.sia ?? ""}`.toLowerCase();

        // Data e Intervalo de Datas
        if (filters.date && entry.entryDate !== filters.date) return false;
        if (filters.dateFrom && entry.entryDate < filters.dateFrom) return false;
        if (filters.dateTo && entry.entryDate > filters.dateTo) return false;

        // Dia e Intervalo de Dias da Campanha
        if (filters.campaignDay && String(entry.campaignDay) !== filters.campaignDay) return false;
        const dayFrom = filters.dayFrom ? Number(filters.dayFrom) : null;
        const dayTo = filters.dayTo ? Number(filters.dayTo) : null;
        if (dayFrom !== null && entry.campaignDay < dayFrom) return false;
        if (dayTo !== null && entry.campaignDay > dayTo) return false;

        // Filtro de coordenadas
        if (filters.hasCoordinates !== "todos") {
          const has = hasCoordinatePair(entry);
          if (filters.hasCoordinates === "sim" ? !has : has) return false;
        }

        // Filtro de observações de pendência/acompanhamento
        if (filters.hasFollowUpNotes !== "todos") {
          const has = Boolean(String(entry.followUpNotes ?? "").trim());
          if (filters.hasFollowUpNotes === "sim" ? !has : has) return false;
        }

        // Busca livre
        if (filters.search) {
          const haystack = [
            entry.campaignName,
            entry.locationName,
            entry.sia,
            entry.municipality,
            entry.createdByName,
            entry.occurrenceType,
            entry.occurrenceDescription,
            entry.followUpNotes,
            entry.dailySummary,
            entry.activities.join(" "),
            entry.waterVisualConditions.join(" "),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(filters.search.toLowerCase())) return false;
        }

        // Multi-select Atividades e Condições
        if (filters.activities.length) {
          const set = new Set(entry.activities);
          if (!filters.activities.every((a) => set.has(a))) return false;
        }
        if (filters.waterConditions.length) {
          const set = new Set(entry.waterVisualConditions);
          if (!filters.waterConditions.every((c) => set.has(c))) return false;
        }

        return (
          (isCampaignScoped || !filters.campaign || entry.campaignName === filters.campaign) &&
          (!filters.location || locationText.includes(filters.location.toLowerCase())) &&
          (!filters.municipality || entry.municipality === filters.municipality) &&
          (filters.occurrence === "todos" ||
            (filters.occurrence === "sim" ? entry.hasOccurrence : !entry.hasOccurrence)) &&
          (!filters.occurrenceType || (entry.occurrenceType ?? "") === filters.occurrenceType) &&
          (!filters.status || entry.status === filters.status) &&
          (!filters.followUp || entry.requiresFollowUp === filters.followUp) &&
          (!filters.responsible || (entry.createdByName ?? "") === filters.responsible) &&
          (!filters.operationalStage || getOperationalStage(entry) === filters.operationalStage)
        );
      }),
    [scopedEntries, filters, isCampaignScoped],
  );

  const scopedSummary = useMemo(() => summarizeFieldDiaryEntries(scopedEntries), [scopedEntries]);
  const filteredSummary = useMemo(() => summarizeFieldDiaryEntries(filteredEntries), [filteredEntries]);
  const selectedDayEntries = useMemo(
    () => scopedEntries.filter((entry) => entry.entryDate.slice(0, 10) === selectedDiaryDate),
    [scopedEntries, selectedDiaryDate],
  );
  const selectedDayGroup = useMemo(
    () => groupEntriesByFieldDay(selectedDayEntries)[0] ?? null,
    [selectedDayEntries],
  );
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === "occurrence" || key === "hasCoordinates" || key === "hasFollowUpNotes") {
      return value !== "todos";
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
  }).length;
  const shouldShowCompleteList = hasActiveDiaryCampaign && viewMode === "list";

  function openNewForm(defaults: Partial<FieldDiaryPayload> = {}) {
    if (!isCampaignScoped && !selectedDiaryCampaign && !defaults.campaignName && !defaults.campaignId) {
      setMessage("Escolha a campanha antes de criar um registro no Diário de Campo.");
      return;
    }

    const session = getStoredSession();
    const payload = createEmptyFieldDiaryPayload();
    const defaultCampaign = defaults.campaignName
      ? campaignOptions.find((campaign) => campaign.name === defaults.campaignName)
      : null;
    const normalizedDefaults = defaultCampaign && !defaults.campaignId
      ? { ...defaults, campaignId: defaultCampaign.id }
      : defaults;
    const scopedCampaign = campaignScope
      ? {
          campaignId: campaignScope.id,
          campaignName: campaignScope.name,
        }
      : selectedDiaryCampaign
        ? {
            campaignId: selectedDiaryCampaign.id,
            campaignName: selectedDiaryCampaign.name,
          }
      : {};

    setMessage("");
    setFormEntry({
      ...payload,
      campaignId: "",
      campaignName: "",
      ...normalizedDefaults,
      ...scopedCampaign,
      createdBy: session?.userId ?? "",
      createdByName: session?.name ?? "",
    });
  }

  function openEditForm(entry: FieldDiaryEntry) {
    setMessage("");
    setFormEntry({
      id: entry.id,
      campaignId: entry.campaignId || activeCampaignId,
      campaignName: entry.campaignName || activeCampaignName,
      campaignDay: entry.campaignDay,
      entryDate: entry.entryDate,
      collectionTime: entry.collectionTime,
      locationName: entry.locationName,
      sia: entry.sia,
      samplesReplicasEdna: entry.samplesReplicasEdna,
      zooplanktonId: entry.zooplanktonId,
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
      weatherConditions: entry.weatherConditions,
      pointAccessibility: entry.pointAccessibility,
      dailySummary: entry.dailySummary,
      status: entry.status,
      createdBy: entry.createdBy,
      createdByName: entry.createdByName,
    });
  }

  async function handleSave(payload: FieldDiaryPayload) {
    const scopedPayload = campaignScope
      ? {
          ...payload,
          campaignId: campaignScope.id,
          campaignName: campaignScope.name,
        }
      : payload;
    const error = validateEntry(scopedPayload);

    if (error) {
      setMessage(error);
      return;
    }

    const result = await saveFieldDiaryEntry(scopedPayload);
    if (result.persistence === "none") {
      setMessage("A nuvem não confirmou a gravação. O registro não foi publicado para outros usuários.");
      return;
    }

    setEntries((current) =>
      [
        result.entry,
        ...current.filter((entry) => entry.id !== result.entry.id),
      ].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt)),
    );
    setFormEntry(null);
    setMessage(
      result.persistence === "cloud"
        ? "Registro salvo no Diário de Campo."
        : "Registro salvo localmente. A nuvem será usada quando estiver disponível.",
    );
  }

  return (
    <div className="space-y-6">
      {!hideHeader && campaignScope ? (
        <SectionCard
          title="Diário de Campo"
          description={
            readOnly
              ? `Consulta operacional vinculada à ${campaignScope.name}.`
              : `Registro operacional vinculado à ${campaignScope.name}.`
          }
          action={
            readOnly ? null :
            <div className="flex flex-wrap gap-2">
              <ImportButton onClick={() => setIsImportOpen(true)} />
              <NewEntryButton onClick={openNewForm} label="Novo registro" />
            </div>
          }
        >
          <p className="text-sm leading-6 text-[var(--ink-soft)]">
            Memória operacional da campanha. Detalhes de uso em Ajuda → Diário de Campo.
          </p>
        </SectionCard>
      ) : !hideHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-6 text-[var(--ink-soft)]">
            {hasActiveDiaryCampaign ? activeCampaignName : "Escolha a campanha."}
          </p>
          {readOnly ? null : (
            <div className="flex flex-wrap items-start justify-end gap-2">
              <ImportButton onClick={() => setIsImportOpen(true)} />
              <NewEntryButton onClick={openNewForm} label="Novo registro" />
            </div>
          )}
        </div>
      ) : null}
      {readOnly && hideHeader ? (
        <div className="rounded-2xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] px-4 py-3 text-xs font-semibold text-[var(--ink-soft)]">
          Dados espelhados de Entrada de dados - Diário de Campo. Esta visualização é somente leitura.
        </div>
      ) : null}

      {!isCampaignScoped && !hideHeader ? (
        <CampaignChoicePanel
          selectedCampaignId={selectedDiaryCampaignId}
          onSelectCampaign={(campaignId) => {
            setSelectedDiaryCampaignId(campaignId);
            const selected = campaignOptions.find((campaign) => campaign.id === campaignId);
            setFilters((current) => ({
              ...current,
              campaign: "",
              date: "",
              dateFrom: "",
              dateTo: "",
              campaignDay: "",
              dayFrom: "",
              dayTo: "",
            }));
            const campaignStart = selected
              ? getCampaignCalendarMonthStart(selected.id, selected.name, entries)
              : "";
            hasUserPickedDiaryDateRef.current = false;
            setSelectedDiaryDate(campaignStart);
            setVisibleCalendarMonth(campaignStart);
            setViewMode("daily");
            setMessage("");
          }}
        />
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-semibold text-[var(--brand-navy-strong)] shadow-[var(--shadow-soft)]">
          {message}
        </div>
      ) : null}

      {hasActiveDiaryCampaign ? (
        <>
          <ErrorBoundary title="Falha no resumo do Diário de Campo">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <OperationalMetric
                icon={BarChart3}
                label="Registros no diário"
                value={String(scopedSummary.total)}
                detail={`${filteredSummary.total} visível(is) na consulta atual.`}
              />
              <OperationalMetric
                icon={CheckCircle2}
                label="Preenchidos"
                value={String(scopedSummary.recorded + scopedSummary.occurrence)}
                detail={`${scopedSummary.recorded} registrado(s), ${scopedSummary.occurrence} com ocorrência.`}
              />
              <OperationalMetric
                icon={CalendarDays}
                label="Planejados"
                value={String(scopedSummary.planned)}
                detail="Pontos importados ainda sem relato operacional."
              />
              <OperationalMetric
                icon={MapPin}
                label="Sem coordenada"
                value={String(scopedSummary.withoutCoordinates)}
                detail="Registros que dependem de localização complementar."
              />
            </div>
          </ErrorBoundary>

          <ErrorBoundary title="Falha no calendário do Diário de Campo">
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(18rem,1fr)_minmax(0,2fr)]">
              <FieldDiaryMonthCalendar
                campaignName={activeCampaignName}
                monthStart={activeCalendarMonth}
                entries={scopedEntries}
                selectedDate={selectedDiaryDate}
                onMonthChange={setVisibleCalendarMonth}
                onSelectDate={(date) => {
                  hasUserPickedDiaryDateRef.current = true;
                  setSelectedDiaryDate(date);
                  setFilters((current) => ({
                    ...current,
                    date,
                    dateFrom: "",
                    dateTo: "",
                  }));
                }}
              />
              <SelectedFieldDiaryDay
                campaignId={activeCampaignId}
                campaignName={activeCampaignName}
                selectedDate={selectedDiaryDate}
                group={selectedDayGroup}
                onNewEntry={
                  readOnly
                    ? undefined
                    : (date) =>
                        openNewForm({
                          campaignId: activeCampaignId,
                          campaignName: activeCampaignName,
                          campaignDay: getCollectionDayForDate(scopedEntries, date),
                          entryDate: date,
                        })
                }
                onViewEntry={setViewEntry}
                onEditEntry={readOnly ? undefined : openEditForm}
              />
            </div>
          </ErrorBoundary>
        </>
      ) : (
        null
      )}

      {hasActiveDiaryCampaign ? (
      <ErrorBoundary title="Falha na consulta do Diário de Campo">
      <SectionCard
        title="Consulta operacional"
        description="Use os filtros principais para localizar rapidamente dias e pontos de campo."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsAdvancedFiltersOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-ghost)] bg-white px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]"
            >
              <ListFilter className="h-3.5 w-3.5" />
              Filtros avançados
              {activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setFilters(emptyFilters)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-ghost)] bg-white px-3 py-2 text-xs font-bold text-[var(--ink-soft)] transition hover:text-[var(--brand-navy-strong)]"
            >
              <Search className="h-3.5 w-3.5" />
              Limpar
            </button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Busca livre">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                className={`${inputClassName} pl-9`}
                placeholder="Texto em qualquer campo"
              />
            </div>
          </Field>
          {!isCampaignScoped ? (
            <Field label="Campanha">
              <select
                value={filters.campaign}
                onChange={(event) => setFilters((current) => ({ ...current, campaign: event.target.value }))}
                className={inputClassName}
              >
                <option value="">Todas</option>
                {filterOptions.campaigns.map((campaign) => (
                  <option key={campaign} value={campaign}>
                    {campaign}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Data">
            <input
              type="date"
              value={filters.date}
              onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
              className={inputClassName}
            />
          </Field>
          <Field label="Dia">
            <select
              value={filters.campaignDay}
              onChange={(event) => setFilters((current) => ({ ...current, campaignDay: event.target.value }))}
              className={inputClassName}
            >
              <option value="">Todos</option>
              {filterOptions.campaignDays.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ponto / SIA">
            <input
              value={filters.location}
              onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))}
              className={inputClassName}
              placeholder="Buscar ponto"
            />
          </Field>
          <Field label="Situação">
            <select
              value={filters.operationalStage}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  operationalStage: event.target.value as Filters["operationalStage"],
                }))
              }
              className={inputClassName}
            >
              <option value="">Todas</option>
              {Object.entries(operationalStageLabels).map(([stage, label]) => (
                <option key={stage} value={stage}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {isAdvancedFiltersOpen ? (
          <div className="mt-4 border-t border-[var(--line-ghost)] pt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Data inicial">
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Data final">
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Dia da campanha (de)">
                <input
                  type="number"
                  min={1}
                  value={filters.dayFrom}
                  onChange={(event) => setFilters((current) => ({ ...current, dayFrom: event.target.value }))}
                  className={inputClassName}
                  placeholder="Ex: 1"
                />
              </Field>
              <Field label="Dia da campanha (até)">
                <input
                  type="number"
                  min={1}
                  value={filters.dayTo}
                  onChange={(event) => setFilters((current) => ({ ...current, dayTo: event.target.value }))}
                  className={inputClassName}
                  placeholder="Ex: 5"
                />
              </Field>
              <Field label="Município">
                <select
                  value={filters.municipality}
                  onChange={(event) => setFilters((current) => ({ ...current, municipality: event.target.value }))}
                  className={inputClassName}
                >
                  <option value="">Todos</option>
                  {filterOptions.municipalities.map((municipality) => (
                    <option key={municipality} value={municipality}>
                      {municipality}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Responsável">
                <select
                  value={filters.responsible}
                  onChange={(event) => setFilters((current) => ({ ...current, responsible: event.target.value }))}
                  className={inputClassName}
                >
                  <option value="">Todos</option>
                  {filterOptions.responsibles.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tem coordenadas?">
                <select
                  value={filters.hasCoordinates}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, hasCoordinates: event.target.value as Filters["hasCoordinates"] }))
                  }
                  className={inputClassName}
                >
                  <option value="todos">Todos</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </Field>
              <Field label="Pendência registrada?">
                <select
                  value={filters.hasFollowUpNotes}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, hasFollowUpNotes: event.target.value as Filters["hasFollowUpNotes"] }))
                  }
                  className={inputClassName}
                >
                  <option value="todos">Todos</option>
                  <option value="sim">Com pendência</option>
                  <option value="nao">Sem pendência</option>
                </select>
              </Field>
              <Field label="Houve ocorrência?">
                <select
                  value={filters.occurrence}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, occurrence: event.target.value as Filters["occurrence"] }))
                  }
                  className={inputClassName}
                >
                  <option value="todos">Todos</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </Field>
              <Field label="Tipo de ocorrência">
                <select
                  value={filters.occurrenceType}
                  onChange={(event) => setFilters((current) => ({ ...current, occurrenceType: event.target.value }))}
                  className={inputClassName}
                  disabled={filters.occurrence === "nao"}
                >
                  <option value="">Todos</option>
                  {filterOptions.occurrenceTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Acompanhamento">
                <select
                  value={filters.followUp}
                  onChange={(event) => setFilters((current) => ({ ...current, followUp: event.target.value }))}
                  className={inputClassName}
                >
                  <option value="">Todos</option>
                  {filterOptions.followUps.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status do registro">
                <select
                  value={filters.status}
                  onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                  className={inputClassName}
                >
                  <option value="">Todos</option>
                  {filterOptions.statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 border-t border-[var(--line-ghost)] pt-4">
              <Checklist
                label="Atividades realizadas"
                options={activityOptions}
                values={filters.activities}
                onChange={(activities) => setFilters((current) => ({ ...current, activities }))}
              />
              <Checklist
                label="Condições visuais da água"
                options={waterVisualConditionOptions}
                values={filters.waterConditions}
                onChange={(waterConditions) => setFilters((current) => ({ ...current, waterConditions }))}
              />
            </div>
          </div>
        ) : null}
      </SectionCard>
      </ErrorBoundary>
      ) : null}

      {shouldShowCompleteList ? (
      <ErrorBoundary title="Falha na lista do Diário de Campo">
      <SectionCard
        title="Lista completa"
        description={`${filteredEntries.length} registro(s) encontrado(s).`}
        action={
          <div className="inline-flex rounded-xl border border-[var(--line-ghost)] bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode("daily")}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-[var(--ink-soft)] transition hover:bg-[var(--surface-soft)]"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Por dia
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-navy-strong)] px-3 py-2 text-xs font-bold text-white transition"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>
        }
      >
        {isLoading ? (
          <DashboardSkeleton rows={4} />
        ) : filteredEntries.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line-ghost)] text-caption uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Campanha</th>
                  <th className="px-3 py-3">Dia</th>
                  <th className="px-3 py-3">Local / SIA</th>
                  <th className="px-3 py-3">Coordenadas</th>
                  <th className="px-3 py-3">Município</th>
                  <th className="px-3 py-3">Situação</th>
                  <th className="px-3 py-3">Responsável</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const stage = getOperationalStage(entry);

                  return (
                    <tr key={entry.id} className="border-b border-[var(--line-ghost)] align-top">
                      <td className="px-3 py-4 font-bold text-[var(--brand-navy-strong)]">{formatDate(entry.entryDate)}</td>
                      <td className="px-3 py-4">{entry.campaignName}</td>
                      <td className="px-3 py-4">{entry.campaignDay}</td>
                      <td className="px-3 py-4">
                        <span className="block font-semibold">{entry.locationName || "Sem local"}</span>
                        {entry.sia ? <span className="text-xs text-slate-500">{entry.sia}</span> : null}
                      </td>
                      <td className="px-3 py-4 text-xs font-semibold text-slate-600">
                        {formatCoordinatePair(entry.latitude, entry.longitude)}
                      </td>
                      <td className="px-3 py-4">{entry.municipality || "Não informado"}</td>
                      <td className="px-3 py-4">
                        <StageBadge stage={stage} />
                      </td>
                      <td className="px-3 py-4">{entry.createdByName || "Não informado"}</td>
                      <td className="px-3 py-4">{entry.status}</td>
                      <td className="px-3 py-4">
                        <div className="flex gap-2">
                          <IconButton label="Visualizar" onClick={() => setViewEntry(entry)} icon={Eye} />
                          {!readOnly ? (
                            <IconButton label="Editar" onClick={() => openEditForm(entry)} icon={Pencil} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nenhum registro encontrado"
            description="Crie um novo registro ou ajuste os filtros para consultar outros dias de campo."
          />
        )}
      </SectionCard>
      </ErrorBoundary>
      ) : null}

      {isImportOpen && !readOnly ? (
        <FieldDiaryImport
          onClose={() => setIsImportOpen(false)}
          onImported={(imported) => {
            const nextEntries = [
              ...imported,
              ...entries.filter((e) => !imported.some((i) => i.id === e.id)),
            ];
            const dedupedEntries = dedupeFieldDiaryEntries(nextEntries);

            setEntries(dedupedEntries);
            cacheFieldDiaryEntries(dedupedEntries);
            setIsImportOpen(false);
            setMessage(`${imported.length} registro(s) importado(s) com sucesso.`);
          }}
        />
      ) : null}

      {formEntry && !readOnly ? (
        <FieldDiaryForm
          entry={formEntry}
          message={message}
          campaignScope={campaignScope}
          onChange={setFormEntry}
          onSave={handleSave}
          onClose={() => {
            setFormEntry(null);
            setMessage("");
          }}
        />
      ) : null}

      {viewEntry ? (
        <FieldDiaryView
          entry={viewEntry}
          onClose={() => setViewEntry(null)}
          onEdit={
            readOnly
              ? undefined
              : () => {
                  setViewEntry(null);
                  openEditForm(viewEntry);
                }
          }
        />
      ) : null}
    </div>
  );
}
