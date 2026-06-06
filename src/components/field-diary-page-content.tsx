"use client";

import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  ListFilter,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sheet,
  UploadCloud,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import {
  OPERATION_CANCEL_EVENT,
  DashboardSkeleton,
  ErrorBoundary,
  beginGlobalOperation,
  emitLocalMode,
  isCloudConnectionError,
  toActionableErrorMessage,
} from "@/components/operational-feedback";
import {
  activityOptions,
  cacheFieldDiaryEntries,
  createEmptyFieldDiaryPayload,
  dedupeFieldDiaryEntries,
  fieldDiaryStatusOptions,
  followUpOptions,
  occurrenceTypeOptions,
  readFieldDiaryEntries,
  saveFieldDiaryEntry,
  waterVisualConditionOptions,
  type FieldDiaryEntry,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import { getStoredSession } from "@/lib/auth-users";

const campaignOptions = [
  { id: "campanha-1-verao-2026", name: "1ª Campanha - Verão 2026" },
  { id: "campanha-2-outono-2026", name: "2ª Campanha - Outono 2026" },
  { id: "campanha-3", name: "3ª Campanha - Inverno 2026" },
  { id: "campanha-4", name: "4ª Campanha - Primavera 2026" },
  { id: "campanha-5", name: "5ª Campanha - Verão 2027" },
  { id: "campanha-6", name: "6ª Campanha - Outono 2027" },
  { id: "campanha-7", name: "7ª Campanha - Inverno 2027" },
  { id: "campanha-8", name: "8ª Campanha - Primavera 2027" },
  { id: "campanha-9", name: "9ª Campanha - Verão 2028" },
  { id: "acao-pontual", name: "Ação pontual" },
  { id: "deslocamento-tecnico", name: "Deslocamento técnico" },
];

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

type OperationalStage = "planned" | "recorded" | "occurrence" | "incomplete";

type ViewMode = "daily" | "list";

const operationalStageLabels: Record<OperationalStage, string> = {
  planned: "Planejado",
  recorded: "Registrado",
  occurrence: "Com ocorrência",
  incomplete: "Incompleto",
};

const operationalStageDescriptions: Record<OperationalStage, string> = {
  planned: "Ponto importado ou programado, ainda sem dado operacional de campo.",
  recorded: "Registro com atividade, condição da água, resumo ou coordenada.",
  occurrence: "Registro com ocorrência relevante informada.",
  incomplete: "Registro sem local ou município suficientes para uso operacional.",
};

const operationalStageClassNames: Record<OperationalStage, string> = {
  planned: "bg-slate-100 text-slate-700",
  recorded: "bg-[var(--brand-green-soft)] text-[var(--brand-navy-strong)]",
  occurrence: "bg-[var(--brand-amber)]/12 text-[var(--brand-amber)]",
  incomplete: "bg-[rgba(186,26,26,0.10)] text-[var(--brand-danger)]",
};

type FieldDiaryCampaignScope = {
  id: string;
  name: string;
};

export function FieldDiaryPageContent({
  campaignScope,
}: {
  campaignScope?: FieldDiaryCampaignScope;
} = {}) {
  const [entries, setEntries] = useState<FieldDiaryEntry[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [formEntry, setFormEntry] = useState<FieldDiaryPayload | null>(null);
  const [viewEntry, setViewEntry] = useState<FieldDiaryEntry | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [message, setMessage] = useState("");
  const isCampaignScoped = Boolean(campaignScope);
  const campaignScopeId = campaignScope?.id ?? "";
  const campaignScopeName = campaignScope?.name ?? "";

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
          !campaignScopeId ||
          entry.campaignId === campaignScopeId ||
          entry.campaignName === campaignScopeName,
      ),
    [entries, campaignScopeId, campaignScopeName],
  );

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
  const dailyGroups = useMemo(() => groupEntriesByFieldDay(filteredEntries), [filteredEntries]);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === "occurrence" || key === "hasCoordinates" || key === "hasFollowUpNotes") {
      return value !== "todos";
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
  }).length;

  function openNewForm(defaults: Partial<FieldDiaryPayload> = {}) {
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
      : {};

    setMessage("");
    setFormEntry({
      ...payload,
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
      {campaignScope ? (
        <SectionCard
          title="Diário de Campo"
          description={`Registro operacional vinculado à ${campaignScope.name}.`}
          action={
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
      ) : (
        <PageHeader
          eyebrow="Campanhas"
          title="Diário de Campo"
          description="Memória operacional diária das campanhas e ações de campo."
          aside={
            <div className="flex flex-wrap items-start justify-end gap-2">
              <ImportButton onClick={() => setIsImportOpen(true)} />
              <NewEntryButton onClick={openNewForm} label="Novo registro" />
            </div>
          }
        />
      )}

      {message ? (
        <div className="rounded-2xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-semibold text-[var(--brand-navy-strong)] shadow-[var(--shadow-soft)]">
          {message}
        </div>
      ) : null}

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

      <ErrorBoundary title="Falha na lista do Diário de Campo">
      <SectionCard
        title={viewMode === "daily" ? "Diário por dia" : "Lista completa"}
        description={
          viewMode === "daily"
            ? `${dailyGroups.length} dia(s) de campo com ${filteredEntries.length} registro(s).`
            : `${filteredEntries.length} registro(s) encontrado(s).`
        }
        action={
          <div className="inline-flex rounded-xl border border-[var(--line-ghost)] bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode("daily")}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
                viewMode === "daily"
                  ? "bg-[var(--brand-navy-strong)] text-white"
                  : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Por dia
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
                viewMode === "list"
                  ? "bg-[var(--brand-navy-strong)] text-white"
                  : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
              }`}
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
          viewMode === "daily" ? (
            <div className="divide-y divide-[var(--line-ghost)]">
              {dailyGroups.map((group) => (
                <section key={group.key} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="heading-font text-xl font-black text-[var(--brand-navy-strong)]">
                        {formatDate(group.entryDate)} · Dia {group.campaignDay}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--ink-soft)]">{group.campaignName}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DailyCount label="Pontos" value={group.summary.total} />
                      <DailyCount label="Preenchidos" value={group.summary.recorded + group.summary.occurrence} />
                      <DailyCount label="Planejados" value={group.summary.planned} />
                      <button
                        type="button"
                        onClick={() =>
                          openNewForm({
                            campaignName: group.campaignName,
                            campaignDay: group.campaignDay,
                            entryDate: group.entryDate,
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-navy)]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Registrar ponto
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--line-ghost)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
                          <th className="px-3 py-3">Ponto / SIA</th>
                          <th className="px-3 py-3">Município</th>
                          <th className="px-3 py-3">Responsável</th>
                          <th className="px-3 py-3">Situação</th>
                          <th className="px-3 py-3">Resumo operacional</th>
                          <th className="px-3 py-3">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.entries.map((entry) => (
                          <OperationalEntryRow
                            key={entry.id}
                            entry={entry}
                            onView={() => setViewEntry(entry)}
                            onEdit={() => openEditForm(entry)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--line-ghost)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
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
                            <IconButton label="Editar" onClick={() => openEditForm(entry)} icon={Pencil} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <EmptyState
            title="Nenhum registro encontrado"
            description="Crie um novo registro ou ajuste os filtros para consultar outros dias de campo."
          />
        )}
      </SectionCard>
      </ErrorBoundary>

      {isImportOpen ? (
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

      {formEntry ? (
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
        <FieldDiaryView entry={viewEntry} onClose={() => setViewEntry(null)} onEdit={() => {
          setViewEntry(null);
          openEditForm(viewEntry);
        }} />
      ) : null}
    </div>
  );
}

type FieldDiarySummary = Record<OperationalStage, number> & {
  total: number;
  withoutCoordinates: number;
};

type FieldDiaryDayGroup = {
  key: string;
  campaignName: string;
  campaignDay: number;
  entryDate: string;
  entries: FieldDiaryEntry[];
  summary: FieldDiarySummary;
};

function summarizeFieldDiaryEntries(entries: FieldDiaryEntry[]): FieldDiarySummary {
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

function groupEntriesByFieldDay(entries: FieldDiaryEntry[]): FieldDiaryDayGroup[] {
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

function hasCoordinatePair(entry: FieldDiaryEntry) {
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

function getOperationalStage(entry: FieldDiaryEntry): OperationalStage {
  if (!String(entry.locationName ?? "").trim() || !String(entry.municipality ?? "").trim()) {
    return "incomplete";
  }

  if (entry.hasOccurrence) {
    return "occurrence";
  }

  return hasDiaryContent(entry) ? "recorded" : "planned";
}

function getOperationalSummary(entry: FieldDiaryEntry) {
  const summary = String(entry.dailySummary ?? "").trim();
  if (summary) return summary;

  const details = [
    entry.activities.length ? `Atividades: ${entry.activities.join(", ")}` : "",
    entry.waterVisualConditions.length ? `Água: ${entry.waterVisualConditions.join(", ")}` : "",
    entry.followUpNotes ? `Pendência: ${entry.followUpNotes}` : "",
  ].filter(Boolean);

  return details.join(" · ") || operationalStageDescriptions[getOperationalStage(entry)];
}

function OperationalMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="glass-panel rounded-[24px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="heading-font mt-3 text-3xl font-black text-[var(--brand-navy-strong)]">{value}</p>
        </div>
        <span className="rounded-2xl bg-[var(--brand-blue-soft)] p-3 text-[var(--brand-navy-strong)]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">{detail}</p>
    </article>
  );
}

function DailyCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-bold text-[var(--brand-navy-strong)]">
      {label}: {value}
    </span>
  );
}

function StageBadge({ stage }: { stage: OperationalStage }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${operationalStageClassNames[stage]}`}>
      {operationalStageLabels[stage]}
    </span>
  );
}

function OperationalEntryRow({
  entry,
  onView,
  onEdit,
}: {
  entry: FieldDiaryEntry;
  onView: () => void;
  onEdit: () => void;
}) {
  const stage = getOperationalStage(entry);

  return (
    <tr className="border-b border-[var(--line-ghost)] align-top last:border-0">
      <td className="px-3 py-4">
        <span className="block font-bold text-[var(--brand-navy-strong)]">{entry.locationName || "Sem local"}</span>
        {entry.sia ? <span className="text-xs font-semibold text-slate-500">{entry.sia}</span> : null}
      </td>
      <td className="px-3 py-4">{entry.municipality || "Não informado"}</td>
      <td className="px-3 py-4">{entry.createdByName || "Não informado"}</td>
      <td className="px-3 py-4">
        <StageBadge stage={stage} />
      </td>
      <td className="max-w-md px-3 py-4 text-sm leading-6 text-slate-600">{getOperationalSummary(entry)}</td>
      <td className="px-3 py-4">
        <div className="flex gap-2">
          <IconButton label="Visualizar" onClick={onView} icon={Eye} />
          <IconButton label="Editar" onClick={onEdit} icon={Pencil} />
        </div>
      </td>
    </tr>
  );
}

function FieldDiaryForm({
  entry,
  message,
  campaignScope,
  onChange,
  onSave,
  onClose,
}: {
  entry: FieldDiaryPayload;
  message: string;
  campaignScope?: FieldDiaryCampaignScope;
  onChange: (entry: FieldDiaryPayload) => void;
  onSave: (entry: FieldDiaryPayload) => void;
  onClose: () => void;
}) {
  function update(next: Partial<FieldDiaryPayload>) {
    onChange({ ...entry, ...next });
  }

  return (
    <Dialog title={entry.id ? "Editar registro" : "Novo registro"} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(entry);
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Campanha" required>
            {campaignScope ? (
              <input
                value={campaignScope.name}
                readOnly
                className={`${inputClassName} cursor-not-allowed bg-slate-50 text-slate-600`}
              />
            ) : (
              <select
                value={entry.campaignId ?? ""}
                onChange={(event) => {
                  const campaign = campaignOptions.find((item) => item.id === event.target.value);
                  update({ campaignId: campaign?.id ?? "", campaignName: campaign?.name ?? "" });
                }}
                className={inputClassName}
              >
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Dia da campanha" required>
            <input
              type="number"
              min={1}
              value={entry.campaignDay}
              onChange={(event) => update({ campaignDay: Number(event.target.value) })}
              className={inputClassName}
            />
          </Field>
          <Field label="Data" required>
            <input
              type="date"
              value={entry.entryDate}
              onChange={(event) => update({ entryDate: event.target.value })}
              className={inputClassName}
            />
          </Field>
          <Field label="Responsável pelo registro">
            <input
              value={entry.createdByName ?? ""}
              onChange={(event) => update({ createdByName: event.target.value })}
              className={inputClassName}
              placeholder="Nome do responsável"
            />
          </Field>
          <Field label="Local / Reservatório">
            <input
              value={entry.locationName}
              onChange={(event) => update({ locationName: event.target.value })}
              className={inputClassName}
              placeholder="Local visitado"
              maxLength={140}
            />
          </Field>
          <Field label="SIA">
            <input
              value={entry.sia ?? ""}
              onChange={(event) => update({ sia: event.target.value })}
              className={inputClassName}
              placeholder="Código ou referência SIA"
              maxLength={80}
            />
          </Field>
          <Field label="Latitude">
            <input
              value={entry.latitude ?? ""}
              onChange={(event) => update({ latitude: event.target.value })}
              className={inputClassName}
              placeholder="Ex: -25.4284"
              maxLength={20}
            />
          </Field>
          <Field label="Longitude">
            <input
              value={entry.longitude ?? ""}
              onChange={(event) => update({ longitude: event.target.value })}
              className={inputClassName}
              placeholder="Ex: -49.2733"
              maxLength={20}
            />
          </Field>
          <Field label="Município">
            <input
              value={entry.municipality}
              onChange={(event) => update({ municipality: event.target.value })}
              className={inputClassName}
              placeholder="Município"
              maxLength={100}
            />
          </Field>
          <Field label="Status">
            <select
              value={entry.status}
              onChange={(event) => update({ status: event.target.value as FieldDiaryPayload["status"] })}
              className={inputClassName}
            >
              {fieldDiaryStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Checklist
          label="Atividades realizadas"
          options={activityOptions}
          values={entry.activities}
          onChange={(activities) => update({ activities })}
        />

        <Checklist
          label="Condições visuais da água"
          options={waterVisualConditionOptions}
          values={entry.waterVisualConditions}
          onChange={(waterVisualConditions) => update({ waterVisualConditions })}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Houve ocorrência relevante?">
            <select
              value={entry.hasOccurrence ? "sim" : "nao"}
              onChange={(event) => update({ hasOccurrence: event.target.value === "sim" })}
              className={inputClassName}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </Field>
          <Field label="A ocorrência exige acompanhamento?">
            <select
              value={entry.requiresFollowUp}
              onChange={(event) => update({ requiresFollowUp: event.target.value as FieldDiaryPayload["requiresFollowUp"] })}
              className={inputClassName}
            >
              {followUpOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pendência ou encaminhamento">
            <input
              value={entry.followUpNotes ?? ""}
              onChange={(event) => update({ followUpNotes: event.target.value })}
              className={inputClassName}
              placeholder="Opcional"
              maxLength={180}
            />
          </Field>
        </div>

        {entry.hasOccurrence ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tipo de ocorrência">
              <select
                value={entry.occurrenceType ?? ""}
                onChange={(event) => update({ occurrenceType: event.target.value })}
                className={inputClassName}
              >
                <option value="">Selecionar</option>
                {occurrenceTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descrição da ocorrência">
              <textarea
                value={entry.occurrenceDescription ?? ""}
                onChange={(event) => update({ occurrenceDescription: event.target.value })}
                className={textareaClassName}
                placeholder="Descreva objetivamente a ocorrência"
                maxLength={500}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Resumo do dia">
          <textarea
            value={entry.dailySummary}
            onChange={(event) => update({ dailySummary: event.target.value })}
            className={textareaClassName}
            placeholder="Registre de forma objetiva o que ocorreu no dia."
            maxLength={700}
          />
        </Field>

        {message ? <p className="text-sm font-semibold text-[var(--brand-danger)]">{message}</p> : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)]"
          >
            Salvar registro
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function FieldDiaryView({
  entry,
  onClose,
  onEdit,
}: {
  entry: FieldDiaryEntry;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Dialog title="Visualizar registro" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Data" value={formatDate(entry.entryDate)} />
          <Info label="Campanha" value={entry.campaignName} />
          <Info label="Dia" value={String(entry.campaignDay)} />
          <Info label="Local / SIA" value={[entry.locationName, entry.sia].filter(Boolean).join(" · ")} />
          <Info label="Latitude" value={entry.latitude || "Não informado"} />
          <Info label="Longitude" value={entry.longitude || "Não informado"} />
          <Info label="Município" value={entry.municipality} />
          <Info label="Responsável" value={entry.createdByName || "Não informado"} />
          <Info label="Ocorrência" value={entry.hasOccurrence ? "Sim" : "Não"} />
          <Info label="Acompanhamento" value={entry.requiresFollowUp} />
          <Info label="Status" value={entry.status} />
        </div>

        <DetailBlock label="Atividades realizadas" value={entry.activities.join(", ") || "Não informado"} />
        <DetailBlock label="Condições visuais da água" value={entry.waterVisualConditions.join(", ") || "Não informado"} />
        {entry.hasOccurrence ? (
          <>
            <DetailBlock label="Tipo de ocorrência" value={entry.occurrenceType || "Não informado"} />
            <DetailBlock label="Descrição da ocorrência" value={entry.occurrenceDescription || "Não informado"} />
          </>
        ) : null}
        <DetailBlock label="Pendência ou encaminhamento" value={entry.followUpNotes || "Sem pendência registrada"} />
        <DetailBlock label="Resumo do dia" value={entry.dailySummary} />

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-5xl rounded-[28px] bg-white p-5 shadow-[0_28px_90px_-24px_rgba(0,0,0,0.45)]">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--line-ghost)] pb-4">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-[var(--brand-blue-soft)] p-3 text-[var(--brand-navy-strong)]">
              <ClipboardList className="h-5 w-5" />
            </span>
            <h2 className="heading-font text-2xl font-black text-[var(--brand-navy-strong)]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-[var(--surface-soft)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Checklist({
  label,
  options,
  values,
  onChange,
  required,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="rounded-2xl border border-[var(--line-ghost)] p-4">
      <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}{required ? " *" : ""}
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => {
          const checked = values.includes(option);

          return (
            <label key={option} className="flex items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold text-[var(--ink-soft)]">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...values, option]
                      : values.filter((value) => value !== option),
                  )
                }
                className="h-4 w-4 accent-[var(--brand-navy)]"
              />
              {option}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
      {label}{required ? " *" : ""}
      {children}
    </label>
  );
}

function ImportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]"
    >
      <Sheet className="h-4 w-4" />
      Importar planilha
    </button>
  );
}

type ImportResult = {
  saved: number;
  errors: string[];
  entries: FieldDiaryEntry[];
};

function FieldDiaryImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (entries: FieldDiaryEntry[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyFile(file: File) {
    setSelectedFileName(file.name);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecione um arquivo .xlsx para importar.");
      return;
    }
    setIsPending(true);
    setError(null);
    setResult(null);

    const operationId = `field-diary-import:${crypto.randomUUID()}`;
    const controller = new AbortController();
    const stopOperation = beginGlobalOperation({
      id: operationId,
      title: "Carregando Diário de Campo...",
      description: "Lendo a planilha, validando registros e preparando a sincronização.",
      cancelable: true,
    });
    const cancelHandler = (cancelEvent: Event) => {
      const detail = (cancelEvent as CustomEvent<{ id: string }>).detail;
      if (detail?.id === operationId) {
        controller.abort();
      }
    };

    window.addEventListener(OPERATION_CANCEL_EVENT, cancelHandler);

    try {
      const response = await fetch("/api/field-diary/import", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = (await response.json()) as ImportResult | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Erro ao processar a planilha.");
      }

      if (payload.errors.some((item) => /banco|supabase|nuvem/i.test(item))) {
        emitLocalMode("O Diário de Campo foi importado no navegador, mas a nuvem não confirmou todos os registros.");
      }

      setResult(payload as ImportResult);
    } catch (importError) {
      const message =
        importError instanceof DOMException && importError.name === "AbortError"
          ? "Importação cancelada. Nenhum registro novo foi aplicado."
          : toActionableErrorMessage(
              importError,
              "Não foi possível processar a planilha do Diário de Campo.",
            );
      setError(message);
      if (isCloudConnectionError(importError)) {
        emitLocalMode("Falha durante importação do Diário de Campo. Dados podem não ter sincronizado com a nuvem.");
      }
    } finally {
      window.removeEventListener(OPERATION_CANCEL_EVENT, cancelHandler);
      stopOperation();
      setIsPending(false);
    }
  }

  return (
    <Dialog title="Importar via planilha" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-4">
          <div className="rounded-xl bg-white p-2 text-[var(--brand-blue)]">
            <Sheet className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--brand-navy-strong)]">Planilha de ocorrências do Diário</p>
            <p className="text-xs text-[var(--ink-soft)]">
              Use uma planilha própria de registros diários; a planilha-síntese das campanhas fica reservada para mapas e pontos.
            </p>
          </div>
          <a
            href="/template-diario-de-campo.xlsx"
            download
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-2.5 text-sm font-bold text-[#ffffff] transition hover:bg-[var(--brand-navy)]"
          >
            <Download className="h-4 w-4" />
            Baixar modelo do Diário
          </a>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label
            className={`block cursor-pointer rounded-2xl border-2 p-5 text-sm transition-colors ${
              isDragging
                ? "border-[var(--brand-blue)] bg-[var(--brand-blue-soft)]"
                : "border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)]"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) applyFile(f); }}
          >
            <span className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-[0_18px_40px_-34px_rgba(0,66,98,0.18)]">
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-navy-strong)] px-4 py-2.5 text-sm font-bold text-white">
                <UploadCloud className="h-4 w-4" />
                {isDragging ? "Solte aqui" : "Selecionar planilha"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink-soft)]">
                {selectedFileName ?? "Arraste um arquivo .xlsx ou clique para selecionar"}
              </span>
            </span>
            <input
              ref={fileInputRef}
              name="file"
              type="file"
              accept=".xlsx,.xlsm"
              className="sr-only"
              onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) applyFile(f); }}
            />
          </label>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--line-ghost)] bg-white px-4 py-3 text-sm font-bold text-[var(--ink-soft)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedFileName}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Importar registros
            </button>
          </div>
        </form>

        {error ? (
          <div className="rounded-2xl bg-[rgba(186,26,26,0.08)] p-4 text-sm text-[var(--brand-danger)]">{error}</div>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[rgba(5,150,105,0.10)] p-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{result.entries.length} registro(s) importado(s) com sucesso.</span>
              {result.entries.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onImported(result.entries)}
                  className="ml-auto rounded-full bg-emerald-800 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-900"
                >
                  Fechar e ver registros
                </button>
              ) : null}
            </div>
            {result.errors.length > 0 ? (
              <div className="rounded-2xl bg-[rgba(234,179,8,0.12)] p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
                  {result.errors.length} aviso(s)
                </p>
                <ul className="space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-xs text-amber-900">{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function NewEntryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white shadow-[0_18px_38px_-28px_rgba(0,66,98,0.6)] transition hover:bg-[var(--brand-navy)]"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Eye;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg border border-[var(--line-ghost)] bg-white p-2 text-[var(--ink-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--brand-navy-strong)]"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
      <FileText className="mb-3 h-9 w-9 text-slate-400" />
      <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">{title}</p>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--brand-navy-strong)]">{value}</p>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function validateEntry(entry: FieldDiaryPayload) {
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

function formatDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function formatCoordinatePair(latitude?: string | null, longitude?: string | null) {
  const lat = String(latitude ?? "").trim();
  const lon = String(longitude ?? "").trim();

  return lat && lon ? `${lat}, ${lon}` : "Sem coordenada";
}

const inputClassName =
  "rounded-xl border border-[var(--line-strong)] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20";

const textareaClassName =
  "min-h-28 rounded-xl border border-[var(--line-strong)] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20";
