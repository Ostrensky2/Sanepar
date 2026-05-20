"use client";

import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  Eye,
  Filter,
  MapPin,
  NotebookPen,
  Search,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import {
  activityOptions,
  fieldDiaryStatusOptions,
  followUpOptions,
  occurrenceTypeOptions,
  readFieldDiaryEntries,
  waterVisualConditionOptions,
  type FieldDiaryEntry,
} from "@/lib/field-diary";

const ALL_CAMPAIGNS = "__all__";

const campaignOptions = [
  { id: ALL_CAMPAIGNS, name: "Todas as campanhas" },
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

const SELECTED_CAMPAIGN_STORAGE_KEY = "yvae:selected-campaign-id";

type Filters = {
  campaignId: string;
  dateFrom: string;
  dateTo: string;
  dayFrom: string;
  dayTo: string;
  location: string;
  sia: string;
  municipality: string;
  responsible: string;
  activities: string[];
  waterVisualConditions: string[];
  occurrence: "todos" | "sim" | "nao";
  occurrenceType: string;
  requiresFollowUp: "todos" | (typeof followUpOptions)[number];
  status: "todos" | (typeof fieldDiaryStatusOptions)[number];
  hasCoordinates: "todos" | "sim" | "nao";
  hasFollowUpNotes: "todos" | "sim" | "nao";
  search: string;
};

const emptyFilters: Filters = {
  campaignId: ALL_CAMPAIGNS,
  dateFrom: "",
  dateTo: "",
  dayFrom: "",
  dayTo: "",
  location: "",
  sia: "",
  municipality: "",
  responsible: "",
  activities: [],
  waterVisualConditions: [],
  occurrence: "todos",
  occurrenceType: "",
  requiresFollowUp: "todos",
  status: "todos",
  hasCoordinates: "todos",
  hasFollowUpNotes: "todos",
  search: "",
};

export function CampaignsFieldDiaryContent() {
  const [entries, setEntries] = useState<FieldDiaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(() => ({
    ...emptyFilters,
    campaignId: readInitialCampaignId(),
  }));
  const [viewEntry, setViewEntry] = useState<FieldDiaryEntry | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      const data = await readFieldDiaryEntries();
      if (isMounted) {
        setEntries(data);
        setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (filters.campaignId === ALL_CAMPAIGNS) return;
    window.localStorage.setItem(SELECTED_CAMPAIGN_STORAGE_KEY, filters.campaignId);
  }, [filters.campaignId]);

  const selectedCampaign = useMemo(
    () => campaignOptions.find((c) => c.id === filters.campaignId) ?? campaignOptions[0],
    [filters.campaignId],
  );

  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesFilters(entry, filters, selectedCampaign.name)),
    [entries, filters, selectedCampaign.name],
  );

  const eventsByDay = useMemo(() => groupByDate(filteredEntries), [filteredEntries]);

  const stats = useMemo(() => {
    const occurrences = filteredEntries.filter((e) => e.hasOccurrence).length;
    const pending = filteredEntries.filter((e) => e.requiresFollowUp === "Sim").length;
    const responsibles = new Set(
      filteredEntries.map((e) => e.createdByName?.trim()).filter((n): n is string => !!n),
    ).size;
    return { total: filteredEntries.length, occurrences, pending, responsibles };
  }, [filteredEntries]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campanhas · Diário de Campo"
        title="Diário de Campo das Campanhas"
        description="Resgate eventos e ocorrências registradas pela equipe em campo. Filtre por qualquer variável da planilha do Diário de Campo para reconstruir o histórico operacional de cada campanha."
        aside={
          <div className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Campanha exibida
            </p>
            <select
              className="mt-2 w-full rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-bold text-[var(--brand-navy-strong)] outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              value={filters.campaignId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, campaignId: event.target.value }))
              }
            >
              {campaignOptions.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
            <p className="mt-3 text-xs text-[var(--ink-soft)]">
              A inclusão e edição de registros permanece em <strong>Entrada de dados → Diário de campo</strong>.
            </p>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={NotebookPen} label="Registros filtrados" value={String(stats.total)} />
        <StatCard icon={AlertTriangle} label="Com ocorrência" value={String(stats.occurrences)} tone="warning" />
        <StatCard icon={CalendarDays} label="Pendências em aberto" value={String(stats.pending)} tone="primary" />
        <StatCard icon={Users} label="Responsáveis distintos" value={String(stats.responsibles)} tone="success" />
      </section>

      <SectionCard
        title="Filtros por variáveis da planilha"
        description="Combine quantos filtros forem necessários. Todos refletem colunas existentes na planilha do Diário de Campo."
        action={
          <button
            type="button"
            onClick={() => setFilters({ ...emptyFilters, campaignId: filters.campaignId })}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-ghost)] bg-white px-3 py-2 text-xs font-bold text-[var(--ink-soft)] transition hover:text-[var(--brand-navy-strong)]"
          >
            <X className="h-3.5 w-3.5" />
            Limpar filtros
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Busca livre">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((c) => ({ ...c, search: event.target.value }))}
                className={`${inputClassName} pl-9`}
                placeholder="Texto em qualquer campo"
              />
            </div>
          </Field>
          <Field label="Campanha">
            <select
              value={filters.campaignId}
              onChange={(event) => setFilters((c) => ({ ...c, campaignId: event.target.value }))}
              className={inputClassName}
            >
              {campaignOptions.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data inicial">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters((c) => ({ ...c, dateFrom: event.target.value }))}
              className={inputClassName}
            />
          </Field>
          <Field label="Data final">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters((c) => ({ ...c, dateTo: event.target.value }))}
              className={inputClassName}
            />
          </Field>
          <Field label="Dia da campanha (de)">
            <input
              type="number"
              min={1}
              value={filters.dayFrom}
              onChange={(event) => setFilters((c) => ({ ...c, dayFrom: event.target.value }))}
              className={inputClassName}
              placeholder="Ex: 1"
            />
          </Field>
          <Field label="Dia da campanha (até)">
            <input
              type="number"
              min={1}
              value={filters.dayTo}
              onChange={(event) => setFilters((c) => ({ ...c, dayTo: event.target.value }))}
              className={inputClassName}
              placeholder="Ex: 5"
            />
          </Field>
          <Field label="Local / Reservatório">
            <input
              value={filters.location}
              onChange={(event) => setFilters((c) => ({ ...c, location: event.target.value }))}
              className={inputClassName}
              placeholder="Buscar local"
            />
          </Field>
          <Field label="SIA">
            <input
              value={filters.sia}
              onChange={(event) => setFilters((c) => ({ ...c, sia: event.target.value }))}
              className={inputClassName}
              placeholder="Código SIA"
            />
          </Field>
          <Field label="Município">
            <input
              value={filters.municipality}
              onChange={(event) => setFilters((c) => ({ ...c, municipality: event.target.value }))}
              className={inputClassName}
              placeholder="Buscar município"
            />
          </Field>
          <Field label="Responsável">
            <input
              value={filters.responsible}
              onChange={(event) => setFilters((c) => ({ ...c, responsible: event.target.value }))}
              className={inputClassName}
              placeholder="Nome do responsável"
            />
          </Field>
          <Field label="Tem coordenadas?">
            <select
              value={filters.hasCoordinates}
              onChange={(event) =>
                setFilters((c) => ({ ...c, hasCoordinates: event.target.value as Filters["hasCoordinates"] }))
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
                setFilters((c) => ({ ...c, hasFollowUpNotes: event.target.value as Filters["hasFollowUpNotes"] }))
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
                setFilters((c) => ({ ...c, occurrence: event.target.value as Filters["occurrence"] }))
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
              onChange={(event) => setFilters((c) => ({ ...c, occurrenceType: event.target.value }))}
              className={inputClassName}
            >
              <option value="">Todos</option>
              {occurrenceTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Acompanhamento">
            <select
              value={filters.requiresFollowUp}
              onChange={(event) =>
                setFilters((c) => ({
                  ...c,
                  requiresFollowUp: event.target.value as Filters["requiresFollowUp"],
                }))
              }
              className={inputClassName}
            >
              <option value="todos">Todos</option>
              {followUpOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status do registro">
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((c) => ({ ...c, status: event.target.value as Filters["status"] }))
              }
              className={inputClassName}
            >
              <option value="todos">Todos</option>
              {fieldDiaryStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <MultiSelect
            label="Atividades realizadas"
            options={activityOptions}
            values={filters.activities}
            onChange={(activities) => setFilters((c) => ({ ...c, activities }))}
          />
          <MultiSelect
            label="Condições visuais da água"
            options={waterVisualConditionOptions}
            values={filters.waterVisualConditions}
            onChange={(waterVisualConditions) =>
              setFilters((c) => ({ ...c, waterVisualConditions }))
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Eventos da equipe em campo"
        description={
          stats.total
            ? `${stats.total} registro(s) atendendo aos filtros · Agrupados por data.`
            : "Nenhum registro atende aos filtros atuais."
        }
        action={
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-blue-soft)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--brand-navy-strong)]">
            <Filter className="h-3 w-3" />
            {selectedCampaign.name}
          </span>
        }
      >
        {isLoading ? (
          <EmptyState
            title="Carregando registros"
            description="Consultando o Diário de Campo."
          />
        ) : eventsByDay.length === 0 ? (
          <EmptyState
            title="Nenhum evento encontrado"
            description="Ajuste os filtros ou registre novos eventos em Entrada de dados → Diário de campo."
          />
        ) : (
          <ol className="relative space-y-6 border-l border-[var(--line-ghost)] pl-6">
            {eventsByDay.map((day) => (
              <li key={day.date} className="relative">
                <span className="absolute -left-[33px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-navy-strong)] text-white shadow-[0_4px_10px_-2px_rgba(0,66,98,0.4)]">
                  <CalendarDays className="h-3.5 w-3.5" />
                </span>
                <div className="mb-3 flex flex-wrap items-baseline gap-3">
                  <h3 className="heading-font text-lg font-extrabold text-[var(--brand-navy-strong)]">
                    {formatLongDate(day.date)}
                  </h3>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {day.entries.length} evento(s)
                  </span>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {day.entries.map((entry) => (
                    <EventCard key={entry.id} entry={entry} onView={() => setViewEntry(entry)} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      {viewEntry ? <EntryDialog entry={viewEntry} onClose={() => setViewEntry(null)} /> : null}
    </div>
  );
}

function EventCard({ entry, onView }: { entry: FieldDiaryEntry; onView: () => void }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[var(--line-ghost)] bg-white p-4 shadow-[0_18px_40px_-34px_rgba(0,66,98,0.25)]">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--brand-teal)]">
            {entry.campaignName} · Dia {entry.campaignDay}
          </p>
          <h4 className="heading-font mt-1 text-base font-extrabold text-[var(--brand-navy-strong)]">
            {entry.locationName || "Local não informado"}
          </h4>
          {entry.sia ? (
            <p className="text-xs font-semibold text-slate-500">SIA: {entry.sia}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onView}
          aria-label="Visualizar"
          className="rounded-lg border border-[var(--line-ghost)] bg-white p-2 text-[var(--ink-soft)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--brand-navy-strong)]"
        >
          <Eye className="h-4 w-4" />
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Datum icon={MapPin} label="Município" value={entry.municipality || "—"} />
        <Datum icon={Users} label="Responsável" value={entry.createdByName || "—"} />
      </dl>

      <div className="flex flex-wrap gap-1.5">
        {entry.hasOccurrence ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-amber)]/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--brand-amber)]">
            <AlertTriangle className="h-3 w-3" />
            {entry.occurrenceType || "Ocorrência"}
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-[var(--brand-green-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--brand-navy-strong)]">
            Sem ocorrência
          </span>
        )}
        <span className="inline-flex rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          {entry.status}
        </span>
        {entry.requiresFollowUp !== "Não" ? (
          <span className="inline-flex rounded-full bg-[var(--brand-blue-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--brand-navy-strong)]">
            Acompanhar: {entry.requiresFollowUp}
          </span>
        ) : null}
      </div>

      {entry.dailySummary ? (
        <p className="line-clamp-3 text-xs leading-5 text-[var(--ink-soft)]">
          {entry.dailySummary}
        </p>
      ) : null}
    </article>
  );
}

function EntryDialog({ entry, onClose }: { entry: FieldDiaryEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-4xl rounded-[28px] bg-white p-5 shadow-[0_28px_90px_-24px_rgba(0,0,0,0.45)]">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--line-ghost)] pb-4">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-[var(--brand-blue-soft)] p-3 text-[var(--brand-navy-strong)]">
              <ClipboardList className="h-5 w-5" />
            </span>
            <h2 className="heading-font text-2xl font-black text-[var(--brand-navy-strong)]">
              Detalhes do registro
            </h2>
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

        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Info label="Data" value={formatDate(entry.entryDate)} />
            <Info label="Campanha" value={entry.campaignName} />
            <Info label="Dia" value={String(entry.campaignDay)} />
            <Info
              label="Local / SIA"
              value={[entry.locationName, entry.sia].filter(Boolean).join(" · ") || "—"}
            />
            <Info label="Latitude" value={entry.latitude || "—"} />
            <Info label="Longitude" value={entry.longitude || "—"} />
            <Info label="Município" value={entry.municipality || "—"} />
            <Info label="Responsável" value={entry.createdByName || "—"} />
            <Info label="Status" value={entry.status} />
            <Info label="Ocorrência" value={entry.hasOccurrence ? "Sim" : "Não"} />
            <Info label="Acompanhamento" value={entry.requiresFollowUp} />
            <Info label="Atualizado em" value={formatDate(entry.updatedAt.slice(0, 10))} />
          </div>

          <DetailBlock
            label="Atividades realizadas"
            value={entry.activities.join(", ") || "Não informado"}
          />
          <DetailBlock
            label="Condições visuais da água"
            value={entry.waterVisualConditions.join(", ") || "Não informado"}
          />
          {entry.hasOccurrence ? (
            <>
              <DetailBlock label="Tipo de ocorrência" value={entry.occurrenceType || "—"} />
              <DetailBlock label="Descrição da ocorrência" value={entry.occurrenceDescription || "—"} />
            </>
          ) : null}
          <DetailBlock
            label="Pendência ou encaminhamento"
            value={entry.followUpNotes || "Sem pendência registrada"}
          />
          <DetailBlock label="Resumo do dia" value={entry.dailySummary || "—"} />
        </div>
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-[var(--line-ghost)] p-4">
      <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = values.includes(option);
          return (
            <label
              key={option}
              className="flex items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold text-[var(--ink-soft)]"
            >
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
      {label}
      {children}
    </label>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  tone?: "primary" | "success" | "warning" | "neutral";
}) {
  const toneClass = {
    primary: "border-[var(--brand-blue)]",
    success: "border-[var(--brand-green)]",
    warning: "border-[var(--brand-amber)]",
    neutral: "border-slate-300",
  }[tone];

  return (
    <article className={`glass-panel rounded-[28px] border-b-2 p-4 ${toneClass}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-[var(--brand-navy)]" />
      </div>
      <p className="heading-font text-3xl font-black text-[var(--brand-navy-strong)]">{value}</p>
    </article>
  );
}

function Datum({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-[var(--surface-soft)] px-2.5 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-[var(--brand-navy)]" />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className="truncate text-xs font-bold text-[var(--brand-navy-strong)]">{value}</p>
      </div>
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
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
      <NotebookPen className="mb-3 h-9 w-9 text-slate-400" />
      <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">{title}</p>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function matchesFilters(entry: FieldDiaryEntry, filters: Filters, selectedCampaignName: string) {
  if (filters.campaignId !== ALL_CAMPAIGNS) {
    const matchesCampaign =
      entry.campaignId === filters.campaignId || entry.campaignName === selectedCampaignName;
    if (!matchesCampaign) return false;
  }

  if (filters.dateFrom && entry.entryDate < filters.dateFrom) return false;
  if (filters.dateTo && entry.entryDate > filters.dateTo) return false;

  const dayFrom = filters.dayFrom ? Number(filters.dayFrom) : null;
  const dayTo = filters.dayTo ? Number(filters.dayTo) : null;
  if (dayFrom !== null && entry.campaignDay < dayFrom) return false;
  if (dayTo !== null && entry.campaignDay > dayTo) return false;

  if (filters.location && !entry.locationName.toLowerCase().includes(filters.location.toLowerCase())) {
    return false;
  }
  if (filters.sia && !(entry.sia ?? "").toLowerCase().includes(filters.sia.toLowerCase())) {
    return false;
  }
  if (
    filters.municipality &&
    !entry.municipality.toLowerCase().includes(filters.municipality.toLowerCase())
  ) {
    return false;
  }
  if (
    filters.responsible &&
    !(entry.createdByName ?? "").toLowerCase().includes(filters.responsible.toLowerCase())
  ) {
    return false;
  }

  if (filters.activities.length) {
    const set = new Set(entry.activities);
    if (!filters.activities.every((a) => set.has(a))) return false;
  }
  if (filters.waterVisualConditions.length) {
    const set = new Set(entry.waterVisualConditions);
    if (!filters.waterVisualConditions.every((a) => set.has(a))) return false;
  }

  if (filters.occurrence !== "todos") {
    const yes = filters.occurrence === "sim";
    if (entry.hasOccurrence !== yes) return false;
  }
  if (filters.occurrenceType && entry.occurrenceType !== filters.occurrenceType) return false;
  if (filters.requiresFollowUp !== "todos" && entry.requiresFollowUp !== filters.requiresFollowUp) {
    return false;
  }
  if (filters.status !== "todos" && entry.status !== filters.status) return false;

  if (filters.hasCoordinates !== "todos") {
    const has = Boolean(String(entry.latitude ?? "").trim() && String(entry.longitude ?? "").trim());
    if (filters.hasCoordinates === "sim" ? !has : has) return false;
  }
  if (filters.hasFollowUpNotes !== "todos") {
    const has = Boolean(String(entry.followUpNotes ?? "").trim());
    if (filters.hasFollowUpNotes === "sim" ? !has : has) return false;
  }

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

  return true;
}

function groupByDate(entries: FieldDiaryEntry[]) {
  const map = new Map<string, FieldDiaryEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.entryDate) ?? [];
    list.push(entry);
    map.set(entry.entryDate, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, entries: list }));
}

function readInitialCampaignId() {
  if (typeof window === "undefined") return ALL_CAMPAIGNS;
  const stored = window.localStorage.getItem(SELECTED_CAMPAIGN_STORAGE_KEY);
  if (stored && campaignOptions.some((c) => c.id === stored)) return stored;
  return ALL_CAMPAIGNS;
}

function formatDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function formatLongDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-");
  if (!year || !month || !day) return date;
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return formatter.format(new Date(Number(year), Number(month) - 1, Number(day)));
}

const inputClassName =
  "rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20";
