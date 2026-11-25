"use client";

import { Check, PencilLine, Plus, Siren, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { inputClassName, textareaClassName } from "@/components/field-diary/constants";
import { PointSelect, pointOptionLabel, type PointOption } from "@/components/point-select";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  hasPrivilege,
  normalizeUserCategory,
  type UserCategory,
} from "@/lib/access-control";
import {
  EMERGENCY_ACTIVITY_OTHER_MAX,
  EMERGENCY_DESCRIPTION_MAX,
  EMERGENCY_LOCATION_MAX,
  EMERGENCY_NAME_MAX,
  EMERGENCY_OBJECTIVE_MAX,
  EMERGENCY_OTHER_MAX,
  EMERGENCY_VISIT_NOTES_MAX,
  EMERGENCY_VISITS_MAX,
  emergencyActivities,
  emergencyActivitiesText,
  emergencyProblems,
  emergencyProblemText,
  emergencyVisitOrdinal,
  emptyEmergencyEventInput,
  emptyEmergencyVisit,
  formatEmergencyDate,
  normalizeEmergencyEventInput,
  sortEmergencyEvents,
  type EmergencyActivityId,
  type EmergencyEvent,
  type EmergencyEventInput,
  type EmergencyInputCheck,
  type EmergencyVisit,
} from "@/lib/emergency-events";

type Notice = { kind: "success" | "error"; text: string } | null;
type InvalidField = { field: Extract<EmergencyInputCheck, { ok: false }>["field"]; visitIndex?: number } | null;
type PointOptionsResponse = { options?: Array<{ sia?: string; locationName?: string; municipality?: string }> };

const fieldClassName = `${inputClassName} w-full min-w-0`;

/**
 * Central de dados › Eventos emergenciais: registrar e consultar problemas comunicados
 * fora da rotina das campanhas e cada ida da equipe ao local (regras em lib/emergency-events).
 */
export function EmergencyEventsPanel() {
  const category = useActiveCategory();
  const canEdit = hasPrivilege(category, "data.import");
  const canDelete = hasPrivilege(category, "data.delete");

  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [points, setPoints] = useState<PointOption[]>([]);
  const [draft, setDraft] = useState<EmergencyEventInput>(emptyEmergencyEventInput);
  const [editingId, setEditingId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [invalid, setInvalid] = useState<InvalidField>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/emergency-events", { cache: "no-store", signal });
      const payload = (await response.json().catch(() => null)) as { available?: boolean; events?: EmergencyEvent[] } | null;

      if (!response.ok || !payload) {
        setStatus("error");
        return;
      }

      setEvents(sortEmergencyEvents(payload.events ?? []));
      setStatus(payload.available === false ? "unavailable" : "ready");
    } catch {
      if (!signal?.aborted) setStatus("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    fetch("/api/field-diary/point-options", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<PointOptionsResponse>) : { options: [] }))
      .then(({ options }) =>
        setPoints(
          (options ?? [])
            .filter((option) => option.sia)
            .map((option) => ({
              sia: String(option.sia),
              municipality: option.municipality || null,
              waterBody: option.locationName || null,
            })),
        ),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [load]);

  /** Quem volta a mexer no formulário depois de um aviso de erro não precisa mais ver o aviso. */
  function clearError() {
    setInvalid(null);
    setNotice((current) => (current?.kind === "error" ? null : current));
  }

  function update(patch: Partial<EmergencyEventInput>) {
    setDraft((current) => ({ ...current, ...patch }));
    clearError();
  }

  function updateVisit(visitId: string, patch: Partial<EmergencyVisit>) {
    setDraft((current) => ({
      ...current,
      visits: current.visits.map((visit) => (visit.id === visitId ? { ...visit, ...patch } : visit)),
    }));
    clearError();
  }

  function toggleActivity(visitId: string, id: EmergencyActivityId) {
    setDraft((current) => ({
      ...current,
      visits: current.visits.map((visit) =>
        visit.id === visitId
          ? {
              ...visit,
              activities: visit.activities.includes(id)
                ? visit.activities.filter((activity) => activity !== id)
                : [...visit.activities, id],
            }
          : visit,
      ),
    }));
    clearError();
  }

  function addVisit() {
    const index = draft.visits.length;
    setDraft((current) => ({ ...current, visits: [...current.visits, emptyEmergencyVisit()] }));
    clearError();
    focusVisit(index);
  }

  function removeVisit(visitId: string) {
    setDraft((current) => ({ ...current, visits: current.visits.filter((visit) => visit.id !== visitId) }));
    clearError();
  }

  function choosePoint(value: string) {
    const sia = value.startsWith("sia:") ? value.slice(4) : "";
    const point = points.find((option) => option.sia === sia);
    update({
      sia,
      // O local acompanha o ponto escolhido; sem ponto, quem digita decide.
      location: point ? [point.waterBody, point.municipality].filter(Boolean).join(" · ") : sia ? draft.location : "",
    });
  }

  /** Abre o evento no formulário. Com `withNewVisit`, já acrescenta uma ida em branco no fim. */
  function startEditing(event: EmergencyEvent, { withNewVisit = false } = {}) {
    const visits = event.visits.map((visit) => ({ ...visit, activities: [...visit.activities] }));

    if (withNewVisit || !visits.length) {
      visits.push(emptyEmergencyVisit());
    }

    setEditingId(event.id);
    setDraft({
      name: event.name,
      reportedDate: event.reportedDate,
      visits,
      mainProblem: event.mainProblem,
      mainProblemOther: event.mainProblemOther,
      sia: event.sia,
      location: event.location,
      description: event.description,
    });
    setNotice(null);
    setInvalid(null);

    if (withNewVisit) {
      focusVisit(visits.length - 1);
    } else {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function resetForm() {
    setEditingId("");
    setDraft(emptyEmergencyEventInput());
    setInvalid(null);
  }

  async function save(formEvent: FormEvent) {
    formEvent.preventDefault();
    const checked = normalizeEmergencyEventInput(draft);

    if (!checked.ok) {
      setNotice({ kind: "error", text: checked.error });
      setInvalid({ field: checked.field, visitIndex: checked.visitIndex });
      focusField(checked.field, checked.visitIndex);
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/emergency-events", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...checked.event } : checked.event),
      });
      const payload = (await response.json().catch(() => null)) as
        | { event?: EmergencyEvent; error?: string; field?: NonNullable<InvalidField>["field"]; visitIndex?: number }
        | null;

      if (!response.ok || !payload?.event) {
        setNotice({ kind: "error", text: payload?.error ?? "A nuvem não confirmou a gravação. O evento não foi salvo; tente de novo." });
        if (payload?.field) setInvalid({ field: payload.field, visitIndex: payload.visitIndex });
        return;
      }

      const saved = payload.event;
      setEvents((current) => sortEmergencyEvents([saved, ...current.filter((event) => event.id !== saved.id)]));
      setNotice({ kind: "success", text: editingId ? `Evento “${saved.name}” atualizado.` : `Evento “${saved.name}” registrado.` });
      resetForm();
    } catch {
      setNotice({ kind: "error", text: "Sem conexão com a nuvem. O evento não foi salvo; confira a internet e tente de novo." });
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(event: EmergencyEvent) {
    setConfirmingDeleteId("");
    setNotice(null);

    try {
      const response = await fetch(`/api/emergency-events?id=${encodeURIComponent(event.id)}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok && response.status !== 404) {
        setNotice({ kind: "error", text: payload?.error ?? "Não foi possível apagar o evento." });
        return;
      }

      setEvents((current) => current.filter((item) => item.id !== event.id));
      if (editingId === event.id) resetForm();
      setNotice({ kind: "success", text: `Evento “${event.name}” apagado.` });
    } catch {
      setNotice({ kind: "error", text: "Sem conexão com a nuvem. O evento não foi apagado." });
    }
  }

  const lastEvent = events[0];
  const summary = useMemo(() => {
    if (!events.length) return "Nenhum evento registrado ainda.";
    const visits = events.reduce((total, event) => total + event.visits.length, 0);
    return `${events.length} ${events.length === 1 ? "evento" : "eventos"} · ${visits} ${visits === 1 ? "ida" : "idas"} ao local · mais recente em ${formatEmergencyDate(lastEvent.reportedDate)}`;
  }, [events, lastEvent]);

  return (
    <div className="space-y-6">
      {status === "unavailable" ? (
        <p role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          O banco ainda não recebeu a atualização dos eventos emergenciais. A tela já está pronta; os registros
          passam a ser gravados assim que o administrador aplicar a atualização.
        </p>
      ) : null}

      {canEdit ? (
        <form
          ref={formRef}
          onSubmit={save}
          noValidate
          aria-labelledby="emergency-form-title"
          className="glass-panel radius-panel scroll-mt-24 space-y-5 p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <h2 id="emergency-form-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">
                {editingId ? "Editar evento" : "Registrar evento"}
              </h2>
              <ResultsInterpretationHelp title="Como registrar um evento emergencial">
                <FormHelp />
              </ResultsInterpretationHelp>
            </div>
            {editingId ? (
              <button type="button" onClick={resetForm} className="min-h-11 rounded-lg px-3 text-sm font-bold text-[var(--ink-soft)] underline">
                Cancelar edição
              </button>
            ) : null}
          </div>

          <Labeled label="Nome do evento" required invalid={isInvalid(invalid, "name")}>
            <input
              id="emergency-name"
              value={draft.name}
              maxLength={EMERGENCY_NAME_MAX}
              placeholder="Ex.: Cheiro forte na captação do Iraí"
              onChange={(event) => update({ name: event.target.value })}
              className={fieldClassName}
              aria-invalid={isInvalid(invalid, "name")}
            />
          </Labeled>

          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Data do evento (informada)" required invalid={isInvalid(invalid, "reportedDate")}>
              <input
                id="emergency-reportedDate"
                type="date"
                value={draft.reportedDate}
                onChange={(event) => update({ reportedDate: event.target.value })}
                className={fieldClassName}
                aria-invalid={isInvalid(invalid, "reportedDate")}
              />
            </Labeled>
            <Labeled label="Problema principal" required invalid={isInvalid(invalid, "mainProblem")}>
              <select
                id="emergency-mainProblem"
                value={draft.mainProblem}
                onChange={(event) => update({ mainProblem: event.target.value as EmergencyEventInput["mainProblem"] })}
                className={fieldClassName}
                aria-invalid={isInvalid(invalid, "mainProblem")}
              >
                <option value="">Escolha o problema</option>
                {emergencyProblems.map((problem) => (
                  <option key={problem.id} value={problem.id}>
                    {problem.label}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>

          {draft.mainProblem === "other" ? (
            <Labeled label="Qual problema?" required invalid={isInvalid(invalid, "mainProblemOther")}>
              <input
                id="emergency-mainProblemOther"
                value={draft.mainProblemOther}
                maxLength={EMERGENCY_OTHER_MAX}
                onChange={(event) => update({ mainProblemOther: event.target.value })}
                className={fieldClassName}
                aria-invalid={isInvalid(invalid, "mainProblemOther")}
              />
            </Labeled>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <PointSelect
              label="Ponto da campanha (SIA)"
              points={points}
              value={draft.sia ? `sia:${draft.sia}` : ""}
              onChange={choosePoint}
              allLabel="Fora dos pontos da campanha"
              className="text-[var(--ink-soft)]"
              selectClassName={`${fieldClassName} mt-2 block`}
            />
            <Labeled label="Local">
              <input
                id="emergency-location"
                value={draft.location}
                maxLength={EMERGENCY_LOCATION_MAX}
                placeholder="Rio ou reservatório, município"
                onChange={(event) => update({ location: event.target.value })}
                className={fieldClassName}
              />
            </Labeled>
          </div>

          <Labeled label="Descrição do fato" required invalid={isInvalid(invalid, "description")}>
            <textarea
              id="emergency-description"
              value={draft.description}
              maxLength={EMERGENCY_DESCRIPTION_MAX}
              rows={5}
              placeholder="O que foi informado, por quem, o que já se sabe e o que ficou de encaminhamento."
              onChange={(event) => update({ description: event.target.value })}
              className={`${textareaClassName} w-full min-w-0`}
              aria-invalid={isInvalid(invalid, "description")}
            />
          </Labeled>

          <fieldset className="space-y-3">
            <legend className="type-label text-slate-500">Idas ao local</legend>
            <p className="type-metadata text-[var(--ink-soft)]">
              Uma ida para cada vez que a equipe foi ao local, cada uma com a data, o objetivo e o que foi feito. Se ainda
              ninguém foi, deixe em branco e acrescente depois.
            </p>

            {draft.visits.map((visit, index) => (
              <VisitFields
                key={visit.id}
                visit={visit}
                index={index}
                reportedDate={draft.reportedDate}
                invalid={invalid?.visitIndex === index ? invalid.field : null}
                onChange={(patch) => updateVisit(visit.id, patch)}
                onToggleActivity={(id) => toggleActivity(visit.id, id)}
                onRemove={() => removeVisit(visit.id)}
              />
            ))}

            {draft.visits.length < EMERGENCY_VISITS_MAX ? (
              <button
                type="button"
                onClick={addVisit}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-[var(--brand-navy-strong)] px-4 text-sm font-bold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {draft.visits.length ? "Adicionar outra ida ao local" : "Adicionar ida ao local"}
              </button>
            ) : null}
          </fieldset>

          <div role="status" aria-live="polite">
            {notice ? <NoticeBox notice={notice} /> : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={isSaving || status === "unavailable"}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-6 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Siren className="h-4 w-4" aria-hidden="true" />
              {isSaving ? "Salvando…" : editingId ? "Salvar alterações" : "Registrar evento"}
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-2xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--ink-soft)]">
          Seu perfil consulta os eventos. Registrar e editar é com quem lança dados no aplicativo.
        </p>
      )}

      <section aria-labelledby="emergency-list-title" className="glass-panel radius-panel space-y-4 p-4 sm:p-6">
        <div>
          <h2 id="emergency-list-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">
            Eventos registrados
          </h2>
          <p className="type-metadata mt-1 text-[var(--ink-soft)]">
            {status === "loading" ? "Consultando os eventos…" : summary}
          </p>
        </div>

        {!canEdit && notice ? <NoticeBox notice={notice} /> : null}

        {status === "error" ? (
          <div className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">
            Não foi possível consultar os eventos.{" "}
            <button type="button" className="underline" onClick={() => { setStatus("loading"); void load(); }}>
              Tentar de novo
            </button>
          </div>
        ) : null}

        {status === "ready" && !events.length ? (
          <p className="rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-[var(--ink-soft)]">
            Quando a equipe for a campo por causa de um problema (entupimento de filtro, cheiro, floração…), registre aqui.
          </p>
        ) : null}

        <ul className="grid gap-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-2xl border border-[var(--line-ghost)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-black text-[var(--brand-navy-strong)]">{event.name}</p>
                  <p className="type-metadata mt-1 text-[var(--ink-soft)]">
                    Evento em {formatEmergencyDate(event.reportedDate)}
                    {" · "}
                    {visitCountText(event.visits.length)}
                    {event.sia || event.location ? ` · ${placeText(event, points)}` : ""}
                  </p>
                </div>
                <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-[#a50f15]">
                  {emergencyProblemText(event)}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-line text-sm text-[var(--ink)]">{event.description}</p>

              {event.visits.length ? (
                <ol aria-label={`Idas ao local: ${event.name}`} className="mt-3 grid gap-2 border-l-2 border-[var(--line-strong)] pl-3">
                  {event.visits.map((visit, index) => (
                    <li key={visit.id} className="grid gap-1.5">
                      <p className="text-sm font-bold text-[var(--brand-navy-strong)]">
                        {emergencyVisitOrdinal(index)} · {formatEmergencyDate(visit.date)}
                        {visit.objective ? <span className="font-semibold text-[var(--ink-soft)]"> · {visit.objective}</span> : null}
                      </p>
                      {visit.activities.some((activity) => activity !== "other") ? (
                        <ul aria-label="Atividades realizadas" className="flex flex-wrap gap-1.5">
                          {emergencyActivitiesText({
                            activities: visit.activities.filter((activity) => activity !== "other"),
                            activityOther: "",
                          }).map((label) => (
                            <li key={label} className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-navy-strong)]">
                              {label}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {visit.activities.includes("other") && visit.activityOther ? (
                        <p className="whitespace-pre-line break-words text-sm text-[var(--ink)]">
                          <span className="font-semibold text-[var(--brand-navy-strong)]">Outras atividades: </span>
                          {visit.activityOther}
                        </p>
                      ) : null}
                      {visit.notes ? <p className="whitespace-pre-line text-sm text-[var(--ink)]">{visit.notes}</p> : null}
                    </li>
                  ))}
                </ol>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="type-metadata text-[var(--ink-soft)]">
                  {event.updatedBy || event.createdBy ? `Registrado por ${event.updatedBy || event.createdBy}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {canEdit && event.visits.length < EMERGENCY_VISITS_MAX ? (
                    <button
                      type="button"
                      onClick={() => startEditing(event, { withNewVisit: true })}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Nova ida
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => startEditing(event)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]"
                    >
                      <PencilLine className="h-4 w-4" aria-hidden="true" />
                      Editar
                    </button>
                  ) : null}
                  {canDelete ? (
                    confirmingDeleteId === event.id ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#a50f15]">Apagar este evento?</span>
                        <button type="button" onClick={() => void remove(event)} className="min-h-11 rounded-lg bg-[#a50f15] px-3 text-sm font-bold text-white">
                          Sim, apagar
                        </button>
                        <button type="button" onClick={() => setConfirmingDeleteId("")} className="min-h-11 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold">
                          Não
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(event.id)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold text-[#a50f15] hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Apagar
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function placeText(event: EmergencyEvent, points: PointOption[]) {
  if (!event.sia) return event.location;
  const point = points.find((option) => option.sia === event.sia);
  const code = point ? pointOptionLabel(point).split(" · ")[0] : /^\d+$/.test(event.sia) ? `SIA ${event.sia}` : event.sia;
  return event.location ? `${code} · ${event.location}` : code;
}

function visitCountText(count: number) {
  if (!count) return "ninguém foi ao local ainda";
  return count === 1 ? "1 ida ao local" : `${count} idas ao local`;
}

function isInvalid(invalid: InvalidField, field: NonNullable<InvalidField>["field"], visitIndex?: number) {
  return Boolean(invalid && invalid.field === field && invalid.visitIndex === visitIndex);
}

function fieldId(field: NonNullable<InvalidField>["field"], visitIndex?: number) {
  return visitIndex === undefined ? `emergency-${field}` : `emergency-visit-${visitIndex}-${field.replace(/^visits\./, "")}`;
}

function focusField(field: NonNullable<InvalidField>["field"], visitIndex?: number) {
  window.requestAnimationFrame(() => document.getElementById(fieldId(field, visitIndex))?.focus());
}

/** Leva a tela até a ida e põe o cursor na data (depois que o React desenhar a ida nova). */
function focusVisit(index: number) {
  window.setTimeout(() => {
    const block = document.getElementById(`emergency-visit-${index}`);
    block?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById(`emergency-visit-${index}-date`)?.focus({ preventScroll: true });
  }, 60);
}

function VisitFields({
  visit,
  index,
  reportedDate,
  invalid,
  onChange,
  onToggleActivity,
  onRemove,
}: {
  visit: EmergencyVisit;
  index: number;
  reportedDate: string;
  /** Campo desta ida que a conferência recusou. */
  invalid: NonNullable<InvalidField>["field"] | null;
  onChange: (patch: Partial<EmergencyVisit>) => void;
  onToggleActivity: (id: EmergencyActivityId) => void;
  onRemove: () => void;
}) {
  const title = `${emergencyVisitOrdinal(index)} ao local`;
  const id = (field: keyof EmergencyVisit) => `emergency-visit-${index}-${field}`;

  return (
    <section
      id={`emergency-visit-${index}`}
      aria-label={title}
      className="scroll-mt-24 space-y-4 rounded-2xl border border-[var(--line-ghost)] bg-[var(--surface-soft)]/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-[var(--brand-navy-strong)]">{title}</h3>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-[var(--ink-soft)] hover:bg-white hover:text-[#a50f15]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Remover esta ida
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Data da ida" required invalid={invalid === "visits.date"}>
          <input
            id={id("date")}
            type="date"
            value={visit.date}
            min={reportedDate || undefined}
            onChange={(event) => onChange({ date: event.target.value })}
            className={fieldClassName}
            aria-invalid={invalid === "visits.date"}
          />
        </Labeled>
        <Labeled label="Objetivo desta ida">
          <input
            id={id("objective")}
            value={visit.objective}
            maxLength={EMERGENCY_OBJECTIVE_MAX}
            placeholder="Ex.: primeira vistoria, nova coleta, conferir se melhorou"
            onChange={(event) => onChange({ objective: event.target.value })}
            className={fieldClassName}
          />
        </Labeled>
      </div>

      <div role="group" aria-labelledby={`${id("activities")}-label`}>
        <p id={`${id("activities")}-label`} className="text-sm font-semibold text-[var(--ink-soft)]">
          Atividades realizadas nesta ida
        </p>
        <p className="type-metadata mb-2 text-[var(--ink-soft)]">Toque em todas as que foram feitas.</p>
        <div className="flex flex-wrap gap-2">
          {emergencyActivities.map((activity) => {
            const selected = visit.activities.includes(activity.id);
            return (
              <button
                key={activity.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleActivity(activity.id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition ${
                  selected
                    ? "border-[var(--brand-navy-strong)] bg-[var(--brand-navy-strong)] text-white"
                    : "border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]"
                }`}
              >
                {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                {activity.label}
              </button>
            );
          })}
        </div>
      </div>

      {visit.activities.includes("other") ? (
        <Labeled label="Descreva a outra atividade (ou as outras)" required invalid={invalid === "visits.activityOther"}>
          <textarea
            id={id("activityOther")}
            value={visit.activityOther}
            maxLength={EMERGENCY_ACTIVITY_OTHER_MAX}
            rows={3}
            placeholder="Ex.: batimetria; coleta de macrófitas; reunião com a operação da ETA"
            onChange={(event) => onChange({ activityOther: event.target.value })}
            className={`${textareaClassName} min-h-20 w-full min-w-0`}
            aria-invalid={invalid === "visits.activityOther"}
          />
        </Labeled>
      ) : null}

      <Labeled label="Observações desta ida">
        <textarea
          id={id("notes")}
          value={visit.notes}
          maxLength={EMERGENCY_VISIT_NOTES_MAX}
          rows={3}
          placeholder="O que a equipe viu, quem acompanhou, o que ficou para a próxima ida."
          onChange={(event) => onChange({ notes: event.target.value })}
          className={`${textareaClassName} min-h-20 w-full min-w-0`}
        />
      </Labeled>
    </section>
  );
}

function Labeled({ label, required, invalid, children }: { label: string; required?: boolean; invalid?: boolean; children: ReactNode }) {
  return (
    <label className={`grid gap-2 text-sm font-semibold ${invalid ? "text-[#a50f15]" : "text-[var(--ink-soft)]"}`}>
      <span>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function NoticeBox({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <p
      className={`rounded-xl p-3 text-sm font-semibold ${
        notice.kind === "success" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"
      }`}
    >
      {notice.text}
    </p>
  );
}

function FormHelp() {
  return (
    <>
      <p>
        <strong>Para que serve:</strong> guardar os problemas na água que levam a equipe a campo fora das campanhas
        (filtro entupindo, cheiro ou gosto, floração de algas, peixes mortos) e cada ida ao local por causa deles.
      </p>
      <p>
        <strong>Data do evento (informada):</strong> o dia em que o problema aconteceu ou foi comunicado à equipe.
      </p>
      <p>
        <strong>Idas ao local:</strong> uma para cada vez que a equipe foi lá, com a data, o objetivo (primeira vistoria,
        nova coleta, conferir se melhorou…) e as atividades feitas. Se ninguém foi ainda, deixe em branco. Para voltar
        ao local outro dia, use <strong>Nova ida</strong> no evento já registrado, ou{" "}
        <strong>Adicionar outra ida ao local</strong> no formulário.
      </p>
      <p>
        <strong>Problema principal:</strong> escolha o que mais pesou. Se nenhum servir, use “Outro problema” e escreva qual.
      </p>
      <p>
        <strong>Atividades realizadas:</strong> em cada ida, toque em todas as que foram feitas (dá para marcar várias).
        Toque de novo para desmarcar. Se marcar “Outra atividade”, abre um campo para descrever qual (ou quais).
      </p>
      <p>
        <strong>Ponto e local:</strong> se o evento foi num ponto das campanhas, escolha o SIA e o local é preenchido
        sozinho. Se foi em outro lugar, deixe “Fora dos pontos da campanha” e escreva o local.
      </p>
      <p>
        <strong>Descrição do fato:</strong> o que foi informado, por quem, o que já se sabe e o que ficou de
        encaminhamento. O que a equipe viu em cada ida vai nas observações daquela ida.
      </p>
      <p>Por enquanto os eventos aparecem só aqui. Depois eles serão mostrados também em Campanhas.</p>
    </>
  );
}

function useActiveCategory() {
  const [category, setCategory] = useState<UserCategory>(() =>
    typeof window === "undefined" ? "Admin" : normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)),
  );

  useEffect(() => {
    function refresh() {
      setCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
    }

    window.addEventListener("storage", refresh);
    window.addEventListener("yvae:access-category-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("yvae:access-category-updated", refresh);
    };
  }, []);

  return category;
}
