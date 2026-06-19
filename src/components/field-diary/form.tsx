"use client";

import { useMemo } from "react";
import {
  campaignOptions,
  inputClassName,
  textareaClassName,
  type FieldDiaryCampaignScope,
} from "@/components/field-diary/constants";
import {
  fieldDiaryPointOptions,
  findFieldDiaryPointOption,
  normalizeFieldDiaryPointKey,
  uniqueSorted,
} from "@/components/field-diary/helpers";
import { Checklist, Dialog, Field } from "@/components/field-diary/ui";
import {
  activityOptions,
  fieldDiaryStatusOptions,
  followUpOptions,
  occurrenceTypeOptions,
  pointAccessibilityOptions,
  weatherConditionOptions,
  waterVisualConditionOptions,
  type FieldDiaryPayload,
} from "@/lib/field-diary";

export function FieldDiaryForm({
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
  const selectedPointOption = findFieldDiaryPointOption(entry);
  const selectedPointOptionId = selectedPointOption?.id ?? "";
  const locationSelectValue = selectedPointOptionId || (entry.locationName ? "__current" : "");
  const siaSelectValue = selectedPointOptionId || (entry.sia ? "__current" : "");
  const municipalityOptions = uniqueSorted(fieldDiaryPointOptions.map((point) => point.municipality));
  const filteredPointOptions = useMemo(() => {
    const municipality = normalizeFieldDiaryPointKey(entry.municipality);

    return municipality
      ? fieldDiaryPointOptions.filter(
          (point) => normalizeFieldDiaryPointKey(point.municipality) === municipality,
        )
      : fieldDiaryPointOptions;
  }, [entry.municipality]);

  function selectPoint(optionId: string) {
    const point = fieldDiaryPointOptions.find((item) => item.id === optionId);

    if (!point) {
      return;
    }

    update({
      locationName: point.locationName,
      sia: point.sia,
      municipality: point.municipality,
    });
  }

  function selectMunicipality(municipality: string) {
    const options = fieldDiaryPointOptions.filter((point) => point.municipality === municipality);

    if (options.length === 1) {
      const [point] = options;
      update({
        municipality,
        locationName: point.locationName,
        sia: point.sia,
      });
      return;
    }

    const currentPointStillMatches =
      selectedPointOption && selectedPointOption.municipality === municipality;

    update({
      municipality,
      ...(currentPointStillMatches
        ? {}
        : {
            locationName: "",
            sia: "",
          }),
    });
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
          <Field label="Município">
            <select
              value={entry.municipality}
              onChange={(event) => selectMunicipality(event.target.value)}
              className={inputClassName}
            >
              <option value="">Selecionar município</option>
              {entry.municipality && !municipalityOptions.includes(entry.municipality) ? (
                <option value={entry.municipality}>{entry.municipality}</option>
              ) : null}
              {municipalityOptions.map((municipality) => (
                <option key={municipality} value={municipality}>
                  {municipality}
                </option>
              ))}
            </select>
          </Field>
          <Field label="SIA (código SIA)">
            <select
              value={siaSelectValue}
              onChange={(event) => selectPoint(event.target.value)}
              className={inputClassName}
            >
              <option value="">Selecionar SIA</option>
              {entry.sia && !selectedPointOption ? (
                <option value="__current">
                  {entry.sia}
                </option>
              ) : null}
              {filteredPointOptions.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.sia} · {point.locationName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Local / Reservatório">
            <select
              value={locationSelectValue}
              onChange={(event) => selectPoint(event.target.value)}
              className={inputClassName}
            >
              <option value="">Selecionar local</option>
              {entry.locationName && !selectedPointOption ? (
                <option value="__current">
                  {entry.locationName}
                </option>
              ) : null}
              {filteredPointOptions.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.locationName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data" required>
            <input
              type="date"
              value={entry.entryDate}
              onChange={(event) => update({ entryDate: event.target.value })}
              className={inputClassName}
            />
          </Field>
          <Field label="Hora da coleta">
            <input
              type="time"
              value={entry.collectionTime}
              onChange={(event) => update({ collectionTime: event.target.value })}
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
          <Field label="Amostras e Réplicas (eDNA)">
            <input
              value={entry.samplesReplicasEdna ?? ""}
              onChange={(event) => update({ samplesReplicasEdna: event.target.value })}
              className={inputClassName}
              placeholder="Ex: 3 réplicas"
              maxLength={120}
            />
          </Field>
          <Field label="ID Zooplâncton">
            <input
              value={entry.zooplanktonId ?? ""}
              onChange={(event) => update({ zooplanktonId: event.target.value })}
              className={inputClassName}
              placeholder="Identificador"
              maxLength={120}
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

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Condições climáticas">
            <select
              value={entry.weatherConditions ?? ""}
              onChange={(event) => update({ weatherConditions: event.target.value as FieldDiaryPayload["weatherConditions"] })}
              className={inputClassName}
            >
              <option value="">Selecionar</option>
              {weatherConditionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Acessibilidade do ponto">
            <select
              value={entry.pointAccessibility ?? ""}
              onChange={(event) => update({ pointAccessibility: event.target.value as FieldDiaryPayload["pointAccessibility"] })}
              className={inputClassName}
            >
              <option value="">Selecionar</option>
              {pointAccessibilityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>

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
