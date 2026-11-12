/**
 * Fotos do registro de campo: envio para a nuvem e, sem sinal, guarda no aparelho.
 *
 * A foto tirada sem sinal fica no IndexedDB do navegador (o localStorage não
 * comporta imagens). No registro ela aparece com um endereço provisório
 * ("aparelho:<id>"); antes de o registro subir, a foto sobe e o endereço é trocado
 * pelo da nuvem. Um endereço provisório nunca vai para a nuvem.
 */

import type { FieldDiaryEntry, FieldDiaryPhoto } from "@/lib/field-diary";

export const DEVICE_PHOTO_PREFIX = "aparelho:";
const DB_NAME = "yvae-aparelho";
const STORE = "fotos";
const UPLOAD_TIMEOUT_MS = 45000;

export type PhotoUploadContext = { entryDate: string; pointId: string };

type StoredPhoto = {
  id: string;
  file: Blob;
  fileName: string;
  context: PhotoUploadContext;
  savedAt: string;
};

export type PhotoUploadResult =
  | { ok: true; url: string; bucket?: string; path?: string }
  | { ok: false; offline: true }
  | { ok: false; offline: false; error: string };

export function isDevicePhotoUrl(url: string | null | undefined) {
  return typeof url === "string" && url.startsWith(DEVICE_PHOTO_PREFIX);
}

export function devicePhotoUrl(photoId: string) {
  return `${DEVICE_PHOTO_PREFIX}${photoId}`;
}

/** Envia uma foto já reduzida. `offline` = sem sinal ou sem resposta a tempo. */
export async function uploadFieldPhoto(file: File | Blob, fileName: string, context: PhotoUploadContext): Promise<PhotoUploadResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.set("file", file, fileName);
    formData.set("context", "field-diary");
    formData.set("entryDate", context.entryDate);
    formData.set("pointId", context.pointId);

    const response = await fetch("/api/photos/upload", { method: "POST", body: formData, signal: controller.signal });
    const payload = (await response.json().catch(() => ({}))) as { url?: string; bucket?: string; path?: string; error?: string };

    if (response.ok && payload.url) {
      return { ok: true, url: payload.url, bucket: payload.bucket, path: payload.path };
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      return { ok: false, offline: true };
    }

    return { ok: false, offline: false, error: payload.error ?? "Não foi possível enviar a foto." };
  } catch {
    return { ok: false, offline: true };
  } finally {
    clearTimeout(timer);
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador não guarda fotos sem sinal."));
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento do aparelho."));
  });
}

async function withStore<Result>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<Result>): Promise<Result> {
  const database = await openDatabase();

  try {
    return await new Promise<Result>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Gravação cancelada pelo navegador."));
    });
  } finally {
    database.close();
  }
}

/** Guarda a foto no aparelho e devolve o endereço provisório dela. */
export async function keepPhotoOnDevice(photoId: string, file: Blob, fileName: string, context: PhotoUploadContext) {
  const stored: StoredPhoto = { id: photoId, file, fileName, context, savedAt: new Date().toISOString() };

  await withStore("readwrite", (store) => store.put(stored));
  return devicePhotoUrl(photoId);
}

export async function readDevicePhoto(photoId: string): Promise<StoredPhoto | null> {
  try {
    const stored = await withStore<StoredPhoto | undefined>("readonly", (store) => store.get(photoId) as IDBRequest<StoredPhoto | undefined>);
    return stored ?? null;
  } catch {
    return null;
  }
}

export async function forgetDevicePhoto(photoId: string) {
  try {
    await withStore("readwrite", (store) => store.delete(photoId));
  } catch {
    // Nada a fazer: a foto já não estava guardada.
  }
}

export type DevicePhotosUpload =
  | { ok: true; entry: FieldDiaryEntry; uploadedIds: string[]; lostCount: number }
  | { ok: false; offline: true }
  | { ok: false; offline: false; error: string };

/**
 * Antes de o registro subir: envia as fotos guardadas no aparelho e troca o
 * endereço provisório pelo da nuvem. Foto que sumiu do aparelho (dados do
 * navegador apagados) sai do registro, e a contagem volta em `lostCount`.
 */
export async function uploadDevicePhotos(entry: FieldDiaryEntry): Promise<DevicePhotosUpload> {
  const pending = (entry.photos ?? []).filter((photo) => isDevicePhotoUrl(photo.url));

  if (!pending.length) {
    return { ok: true, entry, uploadedIds: [], lostCount: 0 };
  }

  const replaced = new Map<string, FieldDiaryPhoto | null>();
  const uploadedIds: string[] = [];

  for (const photo of pending) {
    const stored = await readDevicePhoto(photo.id);

    if (!stored) {
      replaced.set(photo.id, null);
      continue;
    }

    const result = await uploadFieldPhoto(stored.file, stored.fileName, stored.context);

    if (!result.ok) {
      return result.offline ? { ok: false, offline: true } : { ok: false, offline: false, error: result.error };
    }

    uploadedIds.push(photo.id);
    replaced.set(photo.id, {
      ...photo,
      url: result.url,
      bucket: result.bucket ?? null,
      path: result.path ?? null,
      uploadedAt: new Date().toISOString(),
    });
  }

  const photos = (entry.photos ?? [])
    .map((photo) => (replaced.has(photo.id) ? replaced.get(photo.id) ?? null : photo))
    .filter((photo): photo is FieldDiaryPhoto => photo !== null);

  return {
    ok: true,
    entry: { ...entry, photos },
    uploadedIds,
    lostCount: [...replaced.values()].filter((photo) => photo === null).length,
  };
}
