"use client";

import { Camera, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  campaignOptions,
  inputClassName,
  textareaClassName,
  type FieldDiaryCampaignScope,
  type FieldDiaryPointOption,
} from "@/components/field-diary/constants";
import { CollectionStartPanel, type CaptureFeedback } from "@/components/field-diary/collection-start";
import { ParametersPanel, readingValueInputId } from "@/components/field-diary/parameters-panel";
import { SamplesPanel } from "@/components/field-diary/samples-panel";
import { useCollectionDefaults } from "@/components/field-diary/use-collection-defaults";
import { useEntryReadings } from "@/components/field-diary/use-entry-readings";
import { useEntrySamples } from "@/components/field-diary/use-entry-samples";
import {
  findFieldDiaryPointOption,
  normalizeFieldDiaryPointKey,
  uniqueSorted,
} from "@/components/field-diary/helpers";
import { Checklist, Dialog, Field } from "@/components/field-diary/ui";
import {
  buildPositionCapture,
  buildTimeCapture,
  collectionRestartWarning,
  describeCoordinateSource,
  formatCollectionStart,
  localIsoDate,
  plannedPatchForPointChange,
} from "@/lib/collection-capture";
import { readDeviceGps } from "@/lib/device-gps";
import type { CollectedChange, FieldRecordSaveOutcome } from "@/lib/field-collection-client";
import {
  fetchPlannedCoordinate,
  plannedCoordinateKey,
  type PlannedCoordinate,
  type PlannedCoordinateTarget,
} from "@/lib/planned-coordinate";
import {
  activityOptions,
  fieldDiaryStatusOptions,
  followUpOptions,
  occurrenceTypeOptions,
  pointAccessibilityOptions,
  weatherConditionOptions,
  waterVisualConditionOptions,
  effectiveExecutionStatus,
  type FieldDiaryPayload,
  type FieldDiaryPhoto,
} from "@/lib/field-diary";
import { validateCoordinatePair } from "@/lib/coordinates";
import {
  RELOCATION_REASON_MAX_LENGTH,
  pointExecutionStatusLabels,
  pointExecutionStatuses,
  validateRelocation,
  type PointExecutionStatus,
} from "@/lib/point-execution-status";

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
  /**
   * Salva o registro e, em seguida, as amostras e os parâmetros medidos dele (o que
   * vier ausente em `collected` não mudou). Devolve o que a nuvem respondeu sobre eles.
   */
  onSave: (
    entry: FieldDiaryPayload,
    collected?: CollectedChange,
  ) => void | FieldRecordSaveOutcome | Promise<void | FieldRecordSaveOutcome>;
  onClose: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingPhotoIds, setUploadingPhotoIds] = useState<string[]>([]);
  const [uploadMessage, setUploadMessage] = useState("");
  const [fieldDiaryPointOptions, setPointOptions] = useState<FieldDiaryPointOption[]>([]);
  const [pointOptionsMessage, setPointOptionsMessage] = useState("Carregando pontos…");
  const [isLocating, setIsLocating] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState<CaptureFeedback | null>(null);
  // A leitura do GPS leva alguns segundos: o formulário pode ter sido fechado.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/field-diary/point-options", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Pontos indisponíveis.");
        return response.json() as Promise<{options: FieldDiaryPointOption[]}>;
      })
      .then(({options}) => { setPointOptions(options); setPointOptionsMessage(""); })
      .catch(() => { if (!controller.signal.aborted) setPointOptionsMessage("Não foi possível carregar os pontos. Os dados preenchidos foram preservados."); });
    return () => controller.abort();
  }, []);

  // Sempre a versão mais recente do formulário: o envio da foto termina depois de
  // alguns segundos e não pode apagar o que foi digitado nesse meio tempo.
  const latestEntryRef = useRef(entry);
  latestEntryRef.current = entry;

  // Amostras do ponto e parâmetros medidos. O id é o de quando o formulário abriu:
  // se o registro for salvo e eles não, continuam aqui para a nova tentativa.
  const [initialEntryId] = useState(entry.id ?? "");
  const collectionDefaults = useCollectionDefaults(entry.campaignId ?? "");
  const entrySamples = useEntrySamples({ initialEntryId, collectionDefaults });
  const entryReadings = useEntryReadings({ initialEntryId, collectionDefaults });

  function update(next: Partial<FieldDiaryPayload>) {
    let merged = { ...latestEntryRef.current, ...next };

    // O código das amostras leva a data e o ponto: os campos de texto antigos que o
    // app preencheu acompanham.
    if ("entryDate" in next || "sia" in next) {
      merged = { ...merged, ...entrySamples.legacyPatch(merged) };
    }

    latestEntryRef.current = merged;
    onChange(merged);
  }

  /** Depois de qualquer mudança nas amostras: atualiza os campos de texto antigos. */
  function afterSamplesChange() {
    const patch = entrySamples.legacyPatch(latestEntryRef.current);

    if (Object.keys(patch).length) {
      update(patch);
    }
  }

  function showSamplesPanel() {
    requestAnimationFrame(() =>
      document.getElementById("field-diary-samples")?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }

  function showParametersPanel() {
    requestAnimationFrame(() =>
      document.getElementById("field-diary-parameters")?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }

  /** Leva o cursor para o valor da medição que acabou de entrar. */
  function focusReading(readingId: string) {
    if (readingId) {
      requestAnimationFrame(() => document.getElementById(readingValueInputId(readingId))?.focus());
    }
  }
  const executionStatus = effectiveExecutionStatus(entry);
  const coordinateCheck = validateCoordinatePair(entry.latitude, entry.longitude);
  const coordinateError = coordinateCheck.ok ? "" : coordinateCheck.error;
  const relocationError = validateRelocation(executionStatus, entry.relocationReason);
  const coordinateSourceText =
    entry.latitude && entry.longitude ? describeCoordinateSource(entry.coordinateSource, entry.gpsAccuracyM) : "";
  const selectedPointOption = findFieldDiaryPointOption(entry, fieldDiaryPointOptions);
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
  }, [entry.municipality, fieldDiaryPointOptions]);

  // Coordenada planejada do ponto: consultada uma vez por ponto e campanha. A lista
  // de pontos do formulário não traz coordenadas.
  const plannedCacheRef = useRef(new Map<string, Promise<PlannedCoordinate | null>>());

  function plannedFor(target: PlannedCoordinateTarget) {
    const key = plannedCoordinateKey(target);
    const cached = plannedCacheRef.current.get(key);

    if (cached) {
      return cached;
    }

    const pending = fetchPlannedCoordinate(target).then((planned) => {
      // Sem resposta, a próxima captura consulta de novo.
      if (!planned) {
        plannedCacheRef.current.delete(key);
      }
      return planned;
    });

    plannedCacheRef.current.set(key, pending);
    return pending;
  }

  // Ponto ou campanha trocados num registro cuja coordenada é a planejada: ela era
  // do ponto anterior e sai. A do GPS e a digitada ficam, porque dizem onde a
  // pessoa estava.
  function changePoint(next: Partial<FieldDiaryPayload>) {
    const cleared = plannedPatchForPointChange(latestEntryRef.current.coordinateSource, null);

    update({ ...next, ...(cleared ?? {}) });

    if (cleared) {
      setCaptureFeedback({
        notices: [
          "A coordenada planejada era do ponto anterior e foi apagada. Toque em “Ler o GPS de novo”.",
        ],
        farFromPlanned: null,
        needsCoordinateCheck: true,
      });
    }

    // Adianta a consulta, para o "Iniciar coleta" não depender do sinal na hora.
    void plannedFor(latestEntryRef.current);
  }

  function selectPoint(optionId: string) {
    const point = fieldDiaryPointOptions.find((item) => item.id === optionId);

    if (!point) {
      return;
    }

    changePoint({
      locationName: point.locationName,
      sia: point.sia,
      municipality: point.municipality,
    });
  }

  async function capturePosition() {
    setIsLocating(true);
    const [reading] = await Promise.all([readDeviceGps(), plannedFor(latestEntryRef.current)]);

    if (!isMountedRef.current) {
      return null;
    }

    // A pessoa pode ter trocado o ponto enquanto o GPS respondia: vale o de agora.
    const planned = await plannedFor(latestEntryRef.current);

    if (!isMountedRef.current) {
      return null;
    }

    const current = latestEntryRef.current;
    const position = buildPositionCapture({
      gps: reading.gps,
      gpsProblem: reading.problem,
      planned,
      hadCoordinates: Boolean(current.latitude && current.longitude),
    });

    update(position.patch);
    setIsLocating(false);
    return position;
  }

  async function startCollection() {
    if (isLocating) {
      return;
    }

    // A hora é a do toque, não a de quando o GPS responde.
    const time = buildTimeCapture({ now: new Date(), currentEntryDate: latestEntryRef.current.entryDate });
    update(time.patch);

    // Coleta iniciada num registro ainda sem amostras: entram as que a campanha propõe.
    const proposed = entrySamples.proposeForCollectionStart();
    const startNotices = proposed
      ? [...time.notices, `Amostras propostas pelo padrão da campanha: ${proposed}. Confira em “Amostras do ponto”.`]
      : [...time.notices];

    if (proposed) {
      afterSamplesChange();
    }

    // O mesmo para os parâmetros que a campanha mede em todo ponto: as linhas abrem
    // em branco e a pessoa só digita os valores.
    const proposedParameters = entryReadings.proposeForCollectionStart();

    if (proposedParameters) {
      startNotices.push(
        proposedParameters === 1
          ? "1 parâmetro da campanha pronto para preencher em “Parâmetros medidos”."
          : `${proposedParameters} parâmetros da campanha prontos para preencher em “Parâmetros medidos”.`,
      );
    }

    setCaptureFeedback({
      notices: [...startNotices, "Lendo o GPS do celular…"],
      farFromPlanned: null,
      needsCoordinateCheck: false,
    });

    const position = await capturePosition();

    if (position) {
      setCaptureFeedback({ ...position, notices: [...startNotices, ...position.notices] });
    }
  }

  async function readPositionAgain() {
    if (isLocating) {
      return;
    }

    setCaptureFeedback({ notices: ["Lendo o GPS do celular…"], farFromPlanned: null, needsCoordinateCheck: false });

    const position = await capturePosition();

    if (position) {
      setCaptureFeedback(position);
    }
  }

  function markRelocated() {
    update({ executionStatus: "relocated" });
    // O campo do motivo só existe depois que a situação muda.
    requestAnimationFrame(() => document.getElementById("field-diary-relocation-reason")?.focus());
  }

  function selectMunicipality(municipality: string) {
    const options = fieldDiaryPointOptions.filter((point) => point.municipality === municipality);

    if (options.length === 1) {
      const [point] = options;
      changePoint({
        municipality,
        locationName: point.locationName,
        sia: point.sia,
      });
      return;
    }

    const currentPointStillMatches =
      selectedPointOption && selectedPointOption.municipality === municipality;

    if (currentPointStillMatches) {
      update({ municipality });
      return;
    }

    changePoint({ municipality, locationName: "", sia: "" });
  }

  function addPhoto() {
    update({
      photos: [
        ...(latestEntryRef.current.photos ?? []),
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
      photos: (latestEntryRef.current.photos ?? []).map((photo) =>
        photo.id === photoId ? { ...photo, ...patch } : photo,
      ),
    });
  }

  function removePhoto(photoId: string) {
    update({
      photos: (latestEntryRef.current.photos ?? []).filter((photo) => photo.id !== photoId),
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
        onSubmit={async (event) => {
          event.preventDefault();
          if (isSaving) {
            return;
          }
          if (uploadingPhotoIds.length) {
            setUploadMessage("Aguarde o envio da foto terminar antes de salvar o registro.");
            return;
          }
          const samplesToSave = entrySamples.prepareSave(latestEntryRef.current);
          if (!samplesToSave.ok) {
            showSamplesPanel();
            return;
          }
          const readingsToSave = entryReadings.prepareSave();
          if (!readingsToSave.ok) {
            showParametersPanel();
            return;
          }
          setIsSaving(true);
          try {
            const outcome = await onSave(latestEntryRef.current, {
              samples: samplesToSave.change,
              readings: readingsToSave.change,
            });
            if (isMountedRef.current) {
              const samplesNeedAttention = entrySamples.applySaveResult(outcome?.samples);
              const readingsNeedAttention = entryReadings.applySaveResult(outcome?.readings);

              if (samplesNeedAttention) {
                showSamplesPanel();
              } else if (readingsNeedAttention) {
                showParametersPanel();
              }
            }
          } finally {
            if (isMountedRef.current) {
              setIsSaving(false);
            }
          }
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
                  // Cada campanha tem a própria coordenada planejada do ponto.
                  changePoint({ campaignId: campaign?.id ?? "", campaignName: campaign?.name ?? "" });
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
          <div className="md:col-span-2">
            <CollectionStartPanel
              isLocating={isLocating}
              startedLabel={formatCollectionStart(entry.collectionStartedAt)}
              getOverwriteWarning={() => collectionRestartWarning(latestEntryRef.current, new Date())}
              feedback={captureFeedback}
              canMarkRelocated={executionStatus !== "relocated"}
              onStart={() => void startCollection()}
              onReadPosition={() => void readPositionAgain()}
              onMarkRelocated={markRelocated}
            />
          </div>
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
          <Field label="Equipe">
            <input
              value={entry.createdByName ?? ""}
              onChange={(event) => update({ createdByName: event.target.value })}
              className={inputClassName}
              placeholder="Nome da equipe"
            />
          </Field>
          <div className="min-w-0 md:col-span-2">
            <SamplesPanel
              status={entrySamples.status}
              samples={entrySamples.samples}
              context={{
                projectCode: entrySamples.projectCode,
                date: entry.entryDate,
                point: entry.sia ?? "",
              }}
              defaultsDescription={entrySamples.defaultsDescription}
              removedCount={entrySamples.removedCount}
              conflicts={entrySamples.conflicts}
              message={entrySamples.message}
              expandedIds={entrySamples.expandedIds}
              onToggle={entrySamples.toggle}
              onAdd={(sampleType) => {
                entrySamples.add(sampleType);
                afterSamplesChange();
              }}
              onChange={(id, patch) => {
                entrySamples.change(id, patch);
                afterSamplesChange();
              }}
              onRemove={(id) => {
                entrySamples.remove(id);
                afterSamplesChange();
              }}
              onUndoRemove={() => {
                entrySamples.undoRemove();
                afterSamplesChange();
              }}
              onUseDefaults={() => {
                entrySamples.fillFromCampaignDefaults();
                afterSamplesChange();
              }}
              onUseSuggestions={() => {
                entrySamples.acceptSuggestedNumbers();
                afterSamplesChange();
              }}
              onKeepSaved={() => entrySamples.reload(latestEntryRef.current.id ?? "")}
              onRetry={() => entrySamples.reload(latestEntryRef.current.id ?? "")}
            />
          </div>
          {/* min-w-0: a lista de parâmetros tem nomes compridos e não pode alargar o formulário no celular. */}
          <div className="min-w-0 md:col-span-2">
            <ParametersPanel
              status={entryReadings.status}
              catalog={entryReadings.catalog}
              readings={entryReadings.readings}
              removedCount={entryReadings.removedCount}
              message={entryReadings.message}
              hasConflict={entryReadings.hasConflict}
              expandedIds={entryReadings.expandedIds}
              defaultParameterCount={entryReadings.defaultParameterCount}
              onToggle={entryReadings.toggle}
              onAdd={(parameterId) => focusReading(entryReadings.add(parameterId))}
              onChange={(id, patch) =>
                // A hora da medição só é anotada sozinha no dia da coleta.
                entryReadings.change(id, patch, {
                  stampTime: latestEntryRef.current.entryDate === localIsoDate(new Date()),
                })
              }
              onRemove={entryReadings.remove}
              onUndoRemove={entryReadings.undoRemove}
              onUseDefaults={() => {
                entryReadings.fillFromCampaignDefaults();
              }}
              onCreateParameter={async (input) => {
                const created = await entryReadings.createParameter(input);

                if (!created.ok) {
                  return created.error;
                }

                focusReading(created.readingId);
                return "";
              }}
              onKeepSaved={() => entryReadings.reload(latestEntryRef.current.id ?? "")}
              onOverwriteSaved={entryReadings.overwriteSaved}
              onRetry={() => entryReadings.reload(latestEntryRef.current.id ?? "")}
            />
          </div>
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
              onChange={(event) =>
                update({ latitude: event.target.value, coordinateSource: "manual", gpsAccuracyM: null })
              }
              className={inputClassName}
              placeholder="Ex: -25.428400"
              inputMode="decimal"
              aria-invalid={Boolean(coordinateError)}
              aria-describedby={coordinateError ? "field-diary-coordinate-error" : undefined}
              maxLength={20}
            />
          </Field>
          <Field label="Longitude">
            <input
              value={entry.longitude ?? ""}
              onChange={(event) =>
                update({ longitude: event.target.value, coordinateSource: "manual", gpsAccuracyM: null })
              }
              className={inputClassName}
              placeholder="Ex: -49.273300"
              inputMode="decimal"
              aria-invalid={Boolean(coordinateError)}
              aria-describedby={coordinateError ? "field-diary-coordinate-error" : undefined}
              maxLength={20}
            />
          </Field>
          {coordinateSourceText ? (
            <p className="text-sm font-semibold text-[var(--ink-soft)] md:col-span-2">
              Origem da coordenada: {coordinateSourceText}.
              {entry.coordinateSource === "planned" ? " Confira se a coleta foi nesse lugar." : ""}
            </p>
          ) : null}
          {coordinateError ? (
            <p
              id="field-diary-coordinate-error"
              role="alert"
              className="text-sm font-semibold text-[var(--brand-danger)] md:col-span-2"
            >
              {coordinateError}
            </p>
          ) : null}
          <Field label="Situação do ponto">
            <select
              value={executionStatus}
              onChange={(event) => {
                const next = event.target.value as PointExecutionStatus;
                update({
                  executionStatus: next,
                  relocationReason: next === "relocated" ? entry.relocationReason ?? "" : "",
                });
              }}
              className={inputClassName}
            >
              {pointExecutionStatuses.map((status) => (
                <option key={status} value={status}>
                  {pointExecutionStatusLabels[status]}
                </option>
              ))}
            </select>
          </Field>
          {executionStatus === "relocated" ? (
            <Field label="Motivo da realocação" required>
              <textarea
                id="field-diary-relocation-reason"
                value={entry.relocationReason ?? ""}
                onChange={(event) => update({ relocationReason: event.target.value })}
                className={textareaClassName}
                placeholder="Por que a coleta foi feita fora do ponto previsto"
                aria-invalid={Boolean(relocationError)}
                maxLength={RELOCATION_REASON_MAX_LENGTH}
                required
              />
              {relocationError ? (
                <span role="alert" className="mt-1 block text-sm font-semibold text-[var(--brand-danger)]">
                  {relocationError}
                </span>
              ) : null}
            </Field>
          ) : null}
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
            <legend className="inline-flex items-center gap-2 text-caption font-bold text-slate-500">
              <Camera className="h-3.5 w-3.5" />
              Imagens da coleta
            </legend>
            <button
              type="button"
              onClick={addPhoto}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-caption font-bold text-[var(--brand-navy-strong)]"
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
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-white px-3 py-2 text-caption font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-muted)]">
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

        {pointOptionsMessage ? <p role="status" className="text-sm">{pointOptionsMessage}</p> : null}
        {uploadMessage ? (
          <p role="alert" className="text-sm font-semibold text-[var(--brand-danger)]">{uploadMessage}</p>
        ) : null}
        {message && message !== uploadMessage ? (
          <p role="alert" className="text-sm font-semibold text-[var(--brand-danger)]">{message}</p>
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
            disabled={isSaving || uploadingPhotoIds.length > 0}
            className="rounded-xl bg-[var(--brand-navy-strong)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-navy)] disabled:cursor-wait disabled:opacity-70"
          >
            {isSaving ? "Salvando…" : uploadingPhotoIds.length ? "Enviando foto…" : "Salvar registro"}
          </button>
        </div>
      </form>
    </Dialog>
  );
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
