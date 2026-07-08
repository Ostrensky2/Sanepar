"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Camera,
  MapPinned,
  Pencil,
  Plus,
  Sheet,
  Trash2,
  Target,
  Upload,
  X,
} from "lucide-react";
import {
  readPointActions,
  writePointActions,
  type PointActionEvent,
  type PointActionPhoto,
  type PointActionSamplePoint,
} from "@/lib/point-actions";
import {
  readStoredDocumentsFromStorage,
  type StoredDocument,
} from "@/lib/app-documents";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import { PointActionsImportDialog } from "@/components/point-actions-import-dialog";

type PointForm = {
  id: string;
  waterBody: string;
  dates: string;
  municipality: string;
  effectiveLat: string;
  effectiveLon: string;
  results: string;
  photos: PhotoForm[];
};

type PhotoForm = {
  id: string;
  url: string;
  caption: string;
};

const emptyPoint = (): PointForm => ({
  id: crypto.randomUUID(),
  waterBody: "",
  dates: "",
  municipality: "",
  effectiveLat: "",
  effectiveLon: "",
  results: "",
  photos: [emptyPhoto()],
});

const emptyPhoto = (): PhotoForm => ({
  id: crypto.randomUUID(),
  url: "",
  caption: "",
});

function pointToForm(point: PointActionSamplePoint): PointForm {
  return {
    id: point.id,
    waterBody: point.waterBody,
    dates: point.dates,
    municipality: point.municipality,
    effectiveLat: String(point.effectiveLat),
    effectiveLon: String(point.effectiveLon),
    results: point.results,
    photos: point.photos.length
      ? point.photos.map((photo) => ({
          id: photo.id,
          url: photo.url,
          caption: photo.caption,
        }))
      : [emptyPhoto()],
  };
}

export function PointActionEntryPanel({ canImport }: { canImport: boolean }) {
  const [actions, setActions] = useState<PointActionEvent[]>([]);
  const [eventName, setEventName] = useState("");
  const [objectives, setObjectives] = useState("");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [points, setPoints] = useState<PointForm[]>([emptyPoint()]);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [uploadingPhotoIds, setUploadingPhotoIds] = useState<string[]>([]);

  function syncDocuments() {
    setDocuments(readStoredDocumentsFromStorage());
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void readPointActions().then(setActions);
      syncDocuments();
    }, 0);

    window.addEventListener("storage", syncDocuments);
    window.addEventListener("yvae:documents-updated", syncDocuments);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", syncDocuments);
      window.removeEventListener("yvae:documents-updated", syncDocuments);
    };
  }, []);

  const metrics = useMemo(() => {
    const pointCount = actions.reduce((total, action) => total + action.points.length, 0);
    const photoCount = actions.reduce(
      (total, action) =>
        total + action.points.reduce((pointTotal, point) => pointTotal + point.photos.length, 0),
      0,
    );

    return {
      events: actions.length,
      points: pointCount,
      photos: photoCount,
      documents: documents.length,
    };
  }, [actions, documents.length]);

  function updatePoint(pointId: string, patch: Partial<PointForm>) {
    setPoints((current) =>
      current.map((point) => (point.id === pointId ? { ...point, ...patch } : point)),
    );
  }

  function updatePhoto(pointId: string, photoId: string, patch: Partial<PhotoForm>) {
    setPoints((current) =>
      current.map((point) =>
        point.id === pointId
          ? {
              ...point,
              photos: point.photos.map((photo) =>
                photo.id === photoId ? { ...photo, ...patch } : photo,
              ),
            }
          : point,
      ),
    );
  }

  function addPhoto(pointId: string) {
    setPoints((current) =>
      current.map((point) =>
        point.id === pointId
          ? { ...point, photos: [...point.photos, emptyPhoto()] }
          : point,
      ),
    );
  }

  function removePhoto(pointId: string, photoId: string) {
    setPoints((current) =>
      current.map((point) =>
        point.id === pointId
          ? {
              ...point,
              photos:
                point.photos.length > 1
                  ? point.photos.filter((photo) => photo.id !== photoId)
                  : point.photos,
            }
          : point,
      ),
    );
  }

  function removePoint(pointId: string) {
    setPoints((current) =>
      current.length > 1 ? current.filter((point) => point.id !== pointId) : current,
    );
  }

  async function handleImported(imported: PointActionEvent[]) {
    const nextActions = [...imported, ...actions];
    const savedInCloud = await writePointActions(nextActions);

    if (!savedInCloud && !canUseBrowserOnlyPersistence()) {
      setError("A nuvem não confirmou a importação. Os eventos não foram publicados para outros usuários.");
      return;
    }

    setActions(nextActions);
    setIsImportOpen(false);
    const totalPoints = imported.reduce((t, e) => t + e.points.length, 0);
    setMessage(
      savedInCloud
        ? `${imported.length} evento(s) e ${totalPoints} ponto(s) importados na nuvem.`
        : `${imported.length} evento(s) e ${totalPoints} ponto(s) importados neste navegador.`,
    );
  }

  function resetForm() {
    setEventName("");
    setObjectives("");
    setSelectedDocumentId("");
    setPoints([emptyPoint()]);
    setEditingActionId(null);
  }

  function editAction(action: PointActionEvent) {
    setError(null);
    setMessage(null);
    setEditingActionId(action.id);
    setEventName(action.eventName);
    setObjectives(action.objectives);
    setSelectedDocumentId(action.document?.id ?? "");
    setPoints(action.points.length ? action.points.map(pointToForm) : [emptyPoint()]);
  }

  async function uploadPointPhoto(pointId: string, photoId: string, file: File | null) {
    if (!file) {
      return;
    }

    setError(null);
    setUploadingPhotoIds((current) => [...current, photoId]);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("pointId", pointId);

      const response = await fetch("/api/photos/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Não foi possível enviar a foto.");
      }

      updatePhoto(pointId, photoId, { url: payload.url });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Não foi possível enviar a foto.",
      );
    } finally {
      setUploadingPhotoIds((current) => current.filter((id) => id !== photoId));
    }
  }

  async function savePointAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!canImport) {
      setError("A categoria ativa não pode registrar ações pontuais.");
      return;
    }

    const trimmedEventName = eventName.trim();
    const trimmedObjectives = objectives.trim();
    const selectedDocument = documents.find((document) => document.id === selectedDocumentId);

    if (!trimmedEventName || !trimmedObjectives) {
      setError("Nome do evento e objetivos devem ser preenchidos.");
      return;
    }

    const normalizedPoints: PointActionSamplePoint[] = [];

    for (const [index, point] of points.entries()) {
      const effectiveLat = parseCoordinate(point.effectiveLat, "lat");
      const effectiveLon = parseCoordinate(point.effectiveLon, "lon");
      const photos = point.photos
        .map((photo): PointActionPhoto | null => {
          const url = photo.url.trim();

          if (!url) {
            return null;
          }

          return {
            id: photo.id,
            url,
            caption: photo.caption.trim(),
          };
        })
        .filter((photo): photo is PointActionPhoto => photo !== null);

      if (
        !point.waterBody.trim() ||
        !point.dates.trim() ||
        !point.municipality.trim() ||
        effectiveLat === null ||
        effectiveLon === null ||
        !point.results.trim()
      ) {
        setError(`Preencha todos os campos obrigatórios do ponto ${index + 1}.`);
        return;
      }

      normalizedPoints.push({
        id: point.id,
        waterBody: point.waterBody.trim(),
        dates: point.dates.trim(),
        municipality: point.municipality.trim(),
        effectiveLat,
        effectiveLon,
        results: point.results.trim(),
        photos,
      });
    }

    const currentAction = actions.find((action) => action.id === editingActionId);
    const today = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
    const actionPayload: PointActionEvent = {
      id: editingActionId ?? `acao-pontual-${crypto.randomUUID()}`,
      eventName: trimmedEventName,
      objectives: trimmedObjectives,
      document: selectedDocument
        ? {
            id: selectedDocument.id,
            title: selectedDocument.title,
            dropboxUrl: selectedDocument.dropboxUrl,
            originalUrl: selectedDocument.originalUrl,
            storageBucket: selectedDocument.storageBucket,
            storagePath: selectedDocument.storagePath,
            type: selectedDocument.type,
          }
        : null,
      createdAt: currentAction?.createdAt ?? today,
      points: normalizedPoints,
    };
    const nextActions = editingActionId
      ? actions.map((action) => (action.id === editingActionId ? actionPayload : action))
      : [actionPayload, ...actions];

    const savedInCloud = await writePointActions(nextActions);

    if (!savedInCloud && !canUseBrowserOnlyPersistence()) {
      setError("A nuvem não confirmou a gravação. A ação pontual não foi publicada para outros usuários.");
      return;
    }

    setActions(nextActions);
    resetForm();
    setMessage(
      editingActionId
        ? savedInCloud
          ? "Ação pontual atualizada na nuvem e disponível no módulo Ações pontuais."
          : "Ação pontual atualizada neste navegador. Verifique a configuração do Supabase para aparecer em outros computadores."
        : savedInCloud
          ? "Ação pontual registrada na nuvem e disponível no módulo Ações pontuais."
          : "Ação pontual registrada neste navegador. Verifique a configuração do Supabase para aparecer em outros computadores.",
    );
  }

  return (
    <section className="glass-panel radius-panel p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-blue-soft)] px-2.5 py-0.5 text-caption font-bold uppercase tracking-[0.18em] text-[var(--brand-navy-strong)]">
            <Target className="h-3.5 w-3.5" />
            Ações pontuais
          </span>
          <h3 className="heading-font text-xl font-extrabold text-[var(--brand-navy-strong)]">
            Novo registro de ação pontual
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Registro de campanhas pontuais a pedido da Sanepar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            disabled={!canImport}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-ghost)] bg-white px-3 py-2 text-xs font-bold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sheet className="h-4 w-4" />
            Importar planilha
          </button>
          <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
            <MiniMetric label="Eventos" value={metrics.events} />
            <MiniMetric label="Pontos" value={metrics.points} />
            <MiniMetric label="Fotos" value={metrics.photos} />
            <MiniMetric label="Docs." value={metrics.documents} />
          </div>
        </div>
      </div>

      {isImportOpen ? (
        <PointActionsImportDialog
          onClose={() => setIsImportOpen(false)}
          onImported={handleImported}
        />
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
        <form className="space-y-2" onSubmit={savePointAction}>
          <div className="radius-card border border-[var(--line-ghost)] bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand-navy-strong)]">
                {editingActionId ? "Edição do evento" : "Novo evento"}
              </p>
              {editingActionId ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-caption font-bold uppercase tracking-[0.12em] text-[var(--brand-navy-strong)]"
                  onClick={resetForm}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar
                </button>
              ) : null}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                placeholder="Nome do evento"
                value={eventName}
                disabled={!canImport}
                onChange={(event) => setEventName(event.target.value)}
              />
              <label className="grid gap-1 text-caption font-bold uppercase tracking-[0.14em] text-slate-500">
                Documento descritivo do evento
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)]"
                  value={selectedDocumentId}
                  disabled={!canImport}
                  onFocus={syncDocuments}
                  onMouseDown={syncDocuments}
                  onChange={(event) => setSelectedDocumentId(event.target.value)}
                >
                  <option value="">
                    {documents.length ? "Nenhum documento vinculado" : "Nenhum documento cadastrado"}
                  </option>
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title} · {document.type}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                className="min-h-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-justify text-xs leading-5 lg:col-span-2"
                placeholder="Objetivos"
                value={objectives}
                disabled={!canImport}
                onChange={(event) => setObjectives(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
          {points.map((point, pointIndex) => (
            <div
              key={point.id}
              className="radius-card border border-[var(--line-ghost)] bg-white p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--brand-navy-strong)]">
                  <MapPinned className="h-4 w-4 text-[var(--brand-blue)]" />
                  Ponto de coleta {pointIndex + 1}
                </p>
                <button
                  type="button"
                  className="rounded p-1.5 text-[var(--brand-danger)] transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={points.length === 1 || !canImport}
                  onClick={() => removePoint(point.id)}
                  aria-label={`Remover ponto ${pointIndex + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 lg:grid-cols-6">
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:col-span-2"
                  placeholder="Manancial"
                  value={point.waterBody}
                  disabled={!canImport}
                  onChange={(event) => updatePoint(point.id, { waterBody: event.target.value })}
                />
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  placeholder="Datas"
                  value={point.dates}
                  disabled={!canImport}
                  onChange={(event) => updatePoint(point.id, { dates: event.target.value })}
                />
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  placeholder="Município"
                  value={point.municipality}
                  disabled={!canImport}
                  onChange={(event) => updatePoint(point.id, { municipality: event.target.value })}
                />
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  placeholder="Latitude efetiva"
                  value={point.effectiveLat}
                  disabled={!canImport}
                  onChange={(event) => updatePoint(point.id, { effectiveLat: event.target.value })}
                />
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  placeholder="Longitude efetiva"
                  value={point.effectiveLon}
                  disabled={!canImport}
                  onChange={(event) => updatePoint(point.id, { effectiveLon: event.target.value })}
                />
                <textarea
                  className="min-h-16 rounded-lg border border-slate-200 bg-white px-3 py-2 text-justify text-xs leading-5 lg:col-span-6"
                  placeholder="Resultados"
                  value={point.results}
                  disabled={!canImport}
                  onChange={(event) => updatePoint(point.id, { results: event.target.value })}
                />
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 text-caption font-black uppercase tracking-[0.18em] text-slate-500">
                    <Camera className="h-3.5 w-3.5" />
                    Fotos e legendas
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-caption font-bold uppercase tracking-[0.12em] text-[var(--brand-navy-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canImport}
                    onClick={() => addPhoto(point.id)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Foto
                  </button>
                </div>

                {point.photos.map((photo, photoIndex) => (
                  <div key={photo.id} className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                    <input
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                      placeholder={`Link ou upload da foto ${photoIndex + 1}`}
                      value={photo.url}
                      disabled={!canImport}
                      onChange={(event) =>
                        updatePhoto(point.id, photo.id, { url: event.target.value })
                      }
                    />
                    <textarea
                      className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-2 text-justify text-xs leading-5"
                      placeholder="Legenda da foto"
                      value={photo.caption}
                      disabled={!canImport}
                      onChange={(event) =>
                        updatePhoto(point.id, photo.id, { caption: event.target.value })
                      }
                    />
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-caption font-bold uppercase tracking-[0.12em] text-[var(--brand-navy-strong)] transition-colors hover:bg-[var(--surface-muted)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      {uploadingPhotoIds.includes(photo.id) ? "Enviando" : "Upload"}
                      <input
                        className="sr-only"
                        type="file"
                        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                        disabled={!canImport || uploadingPhotoIds.includes(photo.id)}
                        onChange={(event) => {
                          void uploadPointPhoto(point.id, photo.id, event.target.files?.[0] ?? null);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-[var(--brand-danger)] transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={point.photos.length === 1 || !canImport}
                      onClick={() => removePhoto(point.id, photo.id)}
                      aria-label={`Remover foto ${photoIndex + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </div>

          <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface-soft)] px-4 py-2 text-xs font-bold text-[var(--brand-navy-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canImport}
            onClick={() => setPoints((current) => [...current, emptyPoint()])}
          >
            <Plus className="h-4 w-4" />
            Acrescentar ponto
          </button>
          <button
            type="submit"
            disabled={!canImport}
            className="rounded-lg bg-[var(--brand-navy-strong)] px-5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {editingActionId ? "Ação pontual será atualizada" : "Ação pontual será registrada"}
          </button>
          </div>
        </form>

        <aside>
          <div className="radius-card border border-[var(--line-ghost)] bg-white p-3">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[var(--brand-navy-strong)]">
              Ações cadastradas
            </p>
            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {actions.length ? (
                actions.map((action) => (
                  <button
                    type="button"
                    key={action.id}
                    className={`w-full radius-card border p-3 text-left transition-colors ${
                      action.id === editingActionId
                        ? "border-[var(--brand-blue)] bg-[var(--brand-blue-soft)]"
                        : "border-[var(--line-ghost)] bg-[var(--surface-soft)] hover:bg-white"
                    }`}
                    onClick={() => editAction(action)}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-[var(--brand-navy-strong)]">
                          {action.eventName}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">
                          {action.points.length} ponto(s) · {action.createdAt}
                        </span>
                        <span className="mt-1 block truncate text-label font-semibold text-[var(--brand-teal)]">
                          {action.document?.title ?? "Sem documento vinculado"}
                        </span>
                      </span>
                      <Pencil className="h-4 w-4 shrink-0 text-[var(--brand-navy)]" />
                    </span>
                  </button>
                ))
              ) : (
                <p className="radius-card bg-[var(--surface-soft)] p-3 text-justify text-xs leading-5 text-slate-500">
                  Nenhuma ação pontual cadastrada. Os eventos salvos nesta tela serão exibidos aqui para edição rápida.
                </p>
              )}
            </div>
          </div>

        </aside>
      </div>

      {message ? (
        <p className="mt-4 rounded-lg bg-[rgba(0,168,107,0.08)] px-4 py-3 text-xs font-semibold text-[#0b5f40]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg bg-[rgba(186,26,26,0.08)] px-4 py-3 text-xs font-semibold text-[var(--brand-danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}


function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-soft)] px-3 py-2">
      <p className="text-caption font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="heading-font text-xl font-black text-[var(--brand-navy-strong)]">
        {value}
      </p>
    </div>
  );
}

function parseCoordinate(value: string, kind: "lat" | "lon") {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const normalizedValue = trimmedValue.replace(",", ".");
  const directCoordinate = Number(normalizedValue);

  if (isValidCoordinate(directCoordinate, kind)) {
    return directCoordinate;
  }

  const sign = normalizedValue.startsWith("-") ? -1 : 1;
  const separators = normalizedValue.match(/[.,]/g) ?? [];
  const digits = normalizedValue.replace(/[^\d]/g, "");

  if (separators.length > 1 && digits.length > 2) {
    const coordinate = sign * Number(`${digits.slice(0, 2)}.${digits.slice(2)}`);

    if (isValidCoordinate(coordinate, kind)) {
      return coordinate;
    }
  }

  return null;
}

function isValidCoordinate(value: number, kind: "lat" | "lon") {
  if (!Number.isFinite(value)) {
    return false;
  }

  return kind === "lat"
    ? value >= -90 && value <= 90
    : value >= -180 && value <= 180;
}


