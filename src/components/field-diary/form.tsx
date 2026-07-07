"use client";

import { Camera, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
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
  type FieldDiaryPhoto,
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
  const [uploadingPhotoIds, setUploadingPhotoIds] = useState<string[]>([]);
  const [uploadMessage, setUploadMessage] = useState("");

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

  function addPhoto() {
    update({
      photos: [
        ...(entry.photos ?? []),
        {
          id: crypto.randomUUID(),
          url: "",
          caption: "",
        },
      ],
    });
  }

  function updatePhoto(photoId: string, patch: Partial<FieldDiaryPhoto>) {
    update({
      photos: (entry.photos ?? []).map((photo) =>
        photo.id === photoId ? { ...photo, ...patch } : photo,
      ),
    });
  }

  function removePhoto(photoId: string) {
    update({
      photos: (entry.photos ?? []).filter((photo) => photo.id !== photoId),
    });
  }

  async function uploadPhoto(photoId: string, file: File | null) {
    if (!file) {
      return;
    }

    setUploadMessage("");
    setUploadingPhotoIds((current) => [...current, photoId]);

    try {
      const resized = await resizeImageForFieldDiary(file);
      const formData = new FormData();
      formData.set("file", resized.file);
      formData.set("context", "field-diary");
      formData.set("entryDate", entry.entryDate);
      formData.set("pointId", [entry.campaignName, entry.entryDate, entry.sia || entry.locationName || "dia"]
        .filter(Boolean)
        .join("-"));

      const response = await fetch("/api/photos/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { url?: string; bucket?: string; path?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Não foi possível enviar a foto.");
      }

      updatePhoto(photoId, {
        url: payload.url,
        bucket: payload.bucket,
        path: payload.path,
        fileName: resized.file.name,
        width: resized.width,
        height: resized.height,
        uploadedAt: new Date().toISOString(),
      });
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Não foi possível enviar a foto.");
    } finally {
      setUploadingPhotoIds((current) => current.filter((id) => id !== photoId));
    }
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
          <Field label="Equipe em campo">
            <input
              value={entry.fieldTeamName ?? ""}
              onChange={(event) => update({ fieldTeamName: event.target.value })}
              className={inputClassName}
              placeholder="Ex: Equipe Curitiba / Rota 1"
              maxLength={120}
            />
          </Field>
          <Field label="Membros da equipe">
            <textarea
              value={(entry.fieldTeamMembers ?? []).join("\n")}
              onChange={(event) => update({ fieldTeamMembers: parseTeamMembers(event.target.value) })}
              className={textareaClassName}
              placeholder="Um nome por linha"
              maxLength={500}
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

        <fieldset className="rounded-2xl border border-[var(--line-ghost)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <legend className="inline-flex items-center gap-2 text-caption font-bold uppercase tracking-[0.18em] text-slate-500">
              <Camera className="h-3.5 w-3.5" />
              Imagens da coleta
            </legend>
            <button
              type="button"
              onClick={addPhoto}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-caption font-bold uppercase tracking-[0.12em] text-[var(--brand-navy-strong)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Foto
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {(entry.photos ?? []).length ? (
              (entry.photos ?? []).map((photo, index) => (
                <div key={photo.id} className="grid gap-2 rounded-xl bg-[var(--surface-soft)] p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                  <input
                    value={photo.url}
                    onChange={(event) => updatePhoto(photo.id, { url: event.target.value })}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[var(--brand-navy-strong)]"
                    placeholder={`Link ou upload da foto ${index + 1}`}
                  />
                  <input
                    value={photo.caption ?? ""}
                    onChange={(event) => updatePhoto(photo.id, { caption: event.target.value })}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                    placeholder="Legenda da foto"
                    maxLength={180}
                  />
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-white px-3 py-2 text-caption font-bold uppercase tracking-[0.12em] text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-muted)]">
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    {uploadingPhotoIds.includes(photo.id) ? "Enviando" : "Upload"}
                    <input
                      className="sr-only"
                      type="file"
                      accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                      disabled={uploadingPhotoIds.includes(photo.id)}
                      onChange={(event) => {
                        void uploadPhoto(photo.id, event.target.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    aria-label={`Remover foto ${index + 1}`}
                    className="rounded-lg p-2 text-[var(--brand-danger)] transition hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="rounded-xl bg-[var(--surface-soft)] px-3 py-3 text-sm font-semibold text-slate-500">
                Nenhuma imagem vinculada a este registro.
              </p>
            )}
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">
            O upload reduz automaticamente a imagem para no máximo 1600 px no maior lado.
          </p>
        </fieldset>

        {message || uploadMessage ? (
          <p className="text-sm font-semibold text-[var(--brand-danger)]">{message || uploadMessage}</p>
        ) : null}

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

function parseTeamMembers(value: string) {
  return value
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resizeImageForFieldDiary(file: File) {
  const maxSide = 1600;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    return { file, width: bitmap.width, height: bitmap.height };
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Não foi possível redimensionar a foto."))),
      "image/jpeg",
      0.82,
    );
  });
  const resizedName = file.name.replace(/\.[^.]+$/, "") || "foto";
  const resizedFile = new File([blob], `${resizedName}.jpg`, { type: "image/jpeg" });

  return { file: resizedFile, width, height };
}
