"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Eye, Pencil, Plus } from "lucide-react";
import { useMemo } from "react";
import { campaignOptions } from "@/components/field-diary/constants";
import { EmptyState } from "@/components/empty-state";
import {
  buildCalendarDays,
  buildCollectionDaysByDate,
  formatCalendarMonth,
  formatDate,
  getCampaignCalendarMonthStart,
  getOperationalStage,
  getOperationalSummary,
  shiftMonth,
  type FieldDiaryDayGroup,
} from "@/components/field-diary/helpers";
import { IconButton, StageBadge } from "@/components/field-diary/ui";
import type { FieldDiaryEntry } from "@/lib/field-diary";

export function CampaignChoicePanel({
  selectedCampaignId,
  onSelectCampaign,
}: {
  selectedCampaignId: string;
  onSelectCampaign: (campaignId: string) => void;
}) {
  return (
    <section className="glass-panel rounded-2xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 sm:w-44"
          htmlFor="field-diary-campaign"
        >
          Escolha a campanha
        </label>
        <select
          id="field-diary-campaign"
          value={selectedCampaignId}
          onChange={(event) => onSelectCampaign(event.target.value)}
          className="w-full rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-navy-strong)] outline-none transition focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 sm:max-w-md"
        >
          <option value="">Escolha a campanha</option>
          {campaignOptions
            .filter((campaign) => campaign.id.startsWith("campanha-"))
            .map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
        </select>
      </div>
    </section>
  );
}

export function FieldDiaryMonthCalendar({
  campaignName,
  monthStart,
  entries,
  selectedDate,
  onMonthChange,
  onSelectDate,
}: {
  campaignName: string;
  monthStart: string;
  entries: FieldDiaryEntry[];
  selectedDate: string;
  onMonthChange: (monthStart: string) => void;
  onSelectDate: (date: string) => void;
}) {
  const days = buildCalendarDays(monthStart);
  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, FieldDiaryEntry[]>();

    for (const entry of entries) {
      const date = entry.entryDate.slice(0, 10);
      grouped.set(date, [...(grouped.get(date) ?? []), entry]);
    }

    return grouped;
  }, [entries]);
  const collectionDaysByDate = useMemo(() => buildCollectionDaysByDate(entries), [entries]);
  const previousMonth = shiftMonth(monthStart, -1);
  const nextMonth = shiftMonth(monthStart, 1);

  return (
    <section className="glass-panel rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Mês anterior"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-ghost)] bg-white text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]"
          onClick={() => onMonthChange(previousMonth)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="heading-font text-center text-lg font-bold tracking-tight text-[var(--brand-navy-strong)]">
            {formatCalendarMonth(monthStart)}
          </h2>
          <p className="text-center text-xs font-semibold text-[var(--ink-soft)]">{campaignName}</p>
        </div>
        <button
          type="button"
          aria-label="Próximo mês"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-ghost)] bg-white text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)]"
          onClick={() => onMonthChange(nextMonth)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-label font-black uppercase tracking-[0.12em] text-slate-500">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayEntries = day.inMonth ? entriesByDate.get(day.date) ?? [] : [];
          const collectionDay = collectionDaysByDate.get(day.date);
          const isSelected = day.date === selectedDate;

          return (
            <button
              key={day.date}
              type="button"
              disabled={!day.inMonth}
              onClick={() => onSelectDate(day.date)}
              className={`flex h-16 flex-col items-center justify-center rounded-lg border text-center transition ${
                day.inMonth
                  ? isSelected
                    ? "border-[var(--brand-blue)] bg-[var(--brand-navy-strong)] text-white shadow"
                    : dayEntries.length
                      ? "border-[var(--brand-teal)]/40 bg-[var(--brand-green-soft)] text-[var(--brand-navy-strong)] hover:border-[var(--brand-blue)] hover:bg-white"
                    : "border-[var(--line-ghost)] bg-white text-[var(--brand-navy-strong)] hover:border-[var(--brand-blue)] hover:bg-[var(--surface-soft)]"
                  : "border-transparent bg-slate-50/60 text-slate-300"
              }`}
            >
              <span className="text-base font-black leading-none">{Number(day.date.slice(8, 10))}</span>
              <span className={`mt-1 h-3 text-caption font-black leading-none ${isSelected ? "text-white/80" : "text-[var(--brand-teal)]"}`}>
                {collectionDay ? collectionDay : ""}
              </span>
              <span className={`mt-0.5 h-3 text-caption font-bold leading-none ${isSelected ? "text-white/80" : "text-slate-500"}`}>
                {dayEntries.length ? `(${dayEntries.length})` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function SelectedFieldDiaryDay({
  campaignId,
  campaignName,
  selectedDate,
  group,
  onNewEntry,
  onViewEntry,
  onEditEntry,
}: {
  campaignId: string;
  campaignName: string;
  selectedDate: string;
  group: FieldDiaryDayGroup | null;
  onNewEntry?: (date: string) => void;
  onViewEntry: (entry: FieldDiaryEntry) => void;
  onEditEntry?: (entry: FieldDiaryEntry) => void;
}) {
  const dateForAction = selectedDate || getCampaignCalendarMonthStart(campaignId, campaignName, []);

  return (
    <section className="glass-panel min-h-80 rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line-ghost)] pb-3">
        <div>
          <p className="text-label font-black uppercase tracking-[0.16em] text-slate-500">
            Diário por dia
          </p>
          <h2 className="heading-font mt-1 text-xl font-black text-[var(--brand-navy-strong)]">
            {selectedDate ? formatDate(selectedDate) : "Selecione uma data"}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[var(--ink-soft)]">
            {group ? `Dia ${group.campaignDay} · ${group.summary.total} ponto(s)` : campaignName}
          </p>
        </div>
        {onNewEntry ? (
          <button
            type="button"
            onClick={() => onNewEntry(dateForAction)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-navy)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Registrar ponto
          </button>
        ) : null}
      </div>

      {!selectedDate ? (
        <div className="flex min-h-52 items-center justify-center text-center text-sm font-semibold text-slate-500">
          Clique em uma data do calendário para ver os registros daquele dia.
        </div>
      ) : group ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line-ghost)] text-caption uppercase tracking-[0.16em] text-slate-500">
                <th className="px-3 py-3">Ponto / SIA</th>
                <th className="px-3 py-3">Município</th>
                <th className="px-3 py-3">Equipe</th>
                <th className="px-3 py-3">Responsável</th>
                <th className="px-3 py-3">Situação</th>
                <th className="px-3 py-3">Resumo operacional</th>
                <th className="px-3 py-3">Fotos</th>
                <th className="px-3 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {group.entries.map((entry) => (
                <OperationalEntryRow
                  key={entry.id}
                  entry={entry}
                  onView={() => onViewEntry(entry)}
                  onEdit={onEditEntry ? () => onEditEntry(entry) : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={CalendarDays}
            title="Nenhum ponto registrado nesta data"
            description={
              onNewEntry
                ? `Use "Registrar ponto" para incluir uma coleta em ${formatDate(selectedDate)}.`
                : "Não há registros do Diário de Campo para a data selecionada."
            }
            compact
          />
        </div>
      )}
    </section>
  );
}

export function OperationalEntryRow({
  entry,
  onView,
  onEdit,
}: {
  entry: FieldDiaryEntry;
  onView: () => void;
  onEdit?: () => void;
}) {
  const stage = getOperationalStage(entry);
  const fieldTeamMembers = entry.fieldTeamMembers ?? [];
  const photos = entry.photos ?? [];

  return (
    <tr className="border-b border-[var(--line-ghost)] align-top last:border-0">
      <td className="px-3 py-4">
        <span className="block font-bold text-[var(--brand-navy-strong)]">{entry.locationName || "Sem local"}</span>
        {entry.sia ? <span className="text-xs font-semibold text-slate-500">{entry.sia}</span> : null}
      </td>
      <td className="px-3 py-4">{entry.municipality || "Não informado"}</td>
      <td className="px-3 py-4">
        <span className="block font-semibold">{entry.fieldTeamName || "Não informado"}</span>
        {fieldTeamMembers.length ? (
          <span className="text-xs text-slate-500">{fieldTeamMembers.join(", ")}</span>
        ) : null}
      </td>
      <td className="px-3 py-4">{entry.createdByName || "Não informado"}</td>
      <td className="px-3 py-4">
        <StageBadge stage={stage} />
      </td>
      <td className="max-w-md px-3 py-4 text-sm leading-6 text-slate-600">{getOperationalSummary(entry)}</td>
      <td className="px-3 py-4">{photos.length}</td>
      <td className="px-3 py-4">
        <div className="flex gap-2">
          <IconButton label="Visualizar" onClick={onView} icon={Eye} />
          {onEdit ? <IconButton label="Editar" onClick={onEdit} icon={Pencil} /> : null}
        </div>
      </td>
    </tr>
  );
}
