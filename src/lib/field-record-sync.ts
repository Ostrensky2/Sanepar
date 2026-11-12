/**
 * Salvar um registro de campo com ou sem sinal.
 *
 * O formulário (Diário de campo e mapa da campanha) chama submitFieldRecord. Com
 * sinal, o registro, as fotos, as amostras e as medições vão para a nuvem como
 * antes. Sem sinal (ou sem resposta a tempo), o que não subiu fica guardado no
 * aparelho (lib/field-outbox) e syncFieldOutbox manda depois, sozinho, quando o
 * sinal voltar.
 */

import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import {
  prepareFieldDiaryEntry,
  saveFieldDiaryEntry,
  sendFieldDiaryEntry,
  type FieldDiaryEntry,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import {
  RECORD_NOT_SAVED,
  collectedNotSavedMessage,
  saveCollectedOfSavedEntry,
  type CollectedChange,
  type FieldRecordSaveOutcome,
} from "@/lib/field-collection-client";
import {
  findFieldOutboxRecord,
  mergeFieldOutboxRecord,
  putFieldOutboxRecord,
  readFieldOutbox,
  removeFieldOutboxRecord,
  updateFieldOutboxRecord,
  type FieldOutboxRecord,
} from "@/lib/field-outbox";
import { forgetDevicePhoto, uploadDevicePhotos } from "@/lib/field-photo-upload";

export const FIELD_OUTBOX_SYNCED_EVENT = "yvae:registros-enviados";

export const DEVICE_SAVED_MESSAGE =
  "Sem sinal agora: o registro ficou guardado neste aparelho e vai para a nuvem sozinho quando o sinal voltar. Pode seguir para o próximo ponto.";
const DEVICE_SESSION_MESSAGE =
  "Sua sessão expirou: o registro ficou guardado neste aparelho e vai para a nuvem quando você entrar de novo no sistema.";
const DEVICE_FULL_MESSAGE =
  "Sem sinal, e o aparelho não tem espaço para guardar o registro. Libere espaço no celular e toque em “Salvar registro” de novo. Os dados preenchidos continuam no formulário.";

/** Resultado de mandar um item (registro + o que falta dele) para a nuvem. */
export type FieldRecordSend =
  /** Tudo gravado. */
  | { kind: "done"; entry: FieldDiaryEntry; outcome: FieldRecordSaveOutcome }
  /** Registro gravado; a nuvem recusou amostras ou medições (o que falta volta em `remaining`). */
  | { kind: "partial"; entry: FieldDiaryEntry; outcome: FieldRecordSaveOutcome; remaining: FieldOutboxRecord; problem: string }
  /** Sem sinal: o que falta volta em `remaining`, para guardar e tentar depois. */
  | { kind: "offline"; remaining: FieldOutboxRecord; outcome: FieldRecordSaveOutcome }
  /** Sessão expirada: idem, depois de entrar de novo. */
  | { kind: "session"; remaining: FieldOutboxRecord; outcome: FieldRecordSaveOutcome }
  /** A nuvem recusou o registro (ou uma foto). */
  | { kind: "refused"; error: string };

/** Manda o registro, as fotos guardadas, as amostras e as medições, nessa ordem. */
export async function sendFieldOutboxRecord(record: FieldOutboxRecord): Promise<FieldRecordSend> {
  let entry = record.entry;
  let savedEntryId = record.savedEntryId;

  if (!savedEntryId) {
    const photos = await uploadDevicePhotos(entry);

    if (!photos.ok) {
      return photos.offline
        ? { kind: "offline", remaining: record, outcome: { ...RECORD_NOT_SAVED } }
        : { kind: "refused", error: `${photos.error} O registro não foi salvo.` };
    }

    // As fotos que subiram não sobem de novo, mesmo que o registro fique para depois.
    entry = photos.entry;

    const sent = await sendFieldDiaryEntry(entry, record.mode === "insert" ? "POST" : "PUT");

    if (sent.kind === "offline") {
      return { kind: "offline", remaining: { ...record, entry }, outcome: { ...RECORD_NOT_SAVED } };
    }

    if (sent.kind === "session") {
      return { kind: "session", remaining: { ...record, entry, waitingLogin: true }, outcome: { ...RECORD_NOT_SAVED } };
    }

    if (sent.kind === "refused") {
      return { kind: "refused", error: sent.error };
    }

    entry = sent.entry;
    savedEntryId = sent.entry.id;
    await Promise.all(photos.uploadedIds.map(forgetDevicePhoto));
  }

  const change: CollectedChange = { samples: record.samples, readings: record.readings };
  const outcome = await saveCollectedOfSavedEntry(savedEntryId, change);
  const samplesFailed = outcome.samples && !outcome.samples.ok ? outcome.samples : null;
  const readingsFailed = outcome.readings && !outcome.readings.ok ? outcome.readings : null;

  if (!samplesFailed && !readingsFailed) {
    return { kind: "done", entry, outcome };
  }

  const remaining: FieldOutboxRecord = {
    ...record,
    entry,
    savedEntryId,
    samples: samplesFailed ? record.samples : undefined,
    readings: readingsFailed ? record.readings : undefined,
    waitingLogin: undefined,
    problem: undefined,
  };

  if (samplesFailed?.offline || readingsFailed?.offline) {
    return { kind: "offline", remaining, outcome };
  }

  if (samplesFailed?.status === 401 || readingsFailed?.status === 401) {
    return { kind: "session", remaining: { ...remaining, waitingLogin: true }, outcome };
  }

  const problem = collectedNotSavedMessage(outcome);
  return { kind: "partial", entry, outcome, remaining: { ...remaining, problem }, problem };
}

/** O que a tela faz depois de salvar. */
export type FieldRecordSubmit =
  /** Na nuvem. `message` vazio = tudo gravado; senão, o aviso do que faltou (o formulário continua aberto). */
  | { status: "cloud"; entry: FieldDiaryEntry; outcome: FieldRecordSaveOutcome; message: string }
  /** Guardado neste aparelho, para subir depois. */
  | { status: "device"; entry: FieldDiaryEntry; outcome: FieldRecordSaveOutcome; message: string }
  /** Só no navegador (app rodando no computador local, sem nuvem). */
  | { status: "browser"; entry: FieldDiaryEntry; outcome: FieldRecordSaveOutcome; message: string }
  /** Não foi salvo; a mensagem diz por quê. */
  | { status: "none"; error: string };

export async function submitFieldRecord(payload: FieldDiaryPayload, collected?: CollectedChange): Promise<FieldRecordSubmit> {
  if (canUseBrowserOnlyPersistence()) {
    return submitOnLocalComputer(payload, collected);
  }

  const previous = findFieldOutboxRecord(payload.id);
  const entry = prepareFieldDiaryEntry(payload, previous?.entry.createdAt);
  const record = mergeFieldOutboxRecord(previous, {
    entry,
    mode: payload.id ? "upsert" : "insert",
    samples: collected?.samples,
    readings: collected?.readings,
  });
  const sent = await sendFieldOutboxRecord(record);

  try {
    switch (sent.kind) {
      case "done":
        removeFieldOutboxRecord(record.id);
        return { status: "cloud", entry: sent.entry, outcome: sent.outcome, message: "" };
      case "partial":
        // O registro está na nuvem; o que a nuvem recusou fica guardado até alguém corrigir.
        putFieldOutboxRecord(sent.remaining);
        return { status: "cloud", entry: sent.entry, outcome: sent.outcome, message: sent.problem };
      case "offline":
        putFieldOutboxRecord(sent.remaining);
        return {
          status: "device",
          entry: sent.remaining.entry,
          outcome: { ...RECORD_NOT_SAVED, savedEntryId: sent.remaining.entry.id },
          message: DEVICE_SAVED_MESSAGE,
        };
      case "session":
        putFieldOutboxRecord(sent.remaining);
        return {
          status: "device",
          entry: sent.remaining.entry,
          outcome: { ...RECORD_NOT_SAVED, savedEntryId: sent.remaining.entry.id },
          message: DEVICE_SESSION_MESSAGE,
        };
      case "refused":
        return { status: "none", error: sent.error };
    }
  } catch (error) {
    console.error("[field-outbox] não foi possível guardar o registro no aparelho", error);
    return { status: "none", error: DEVICE_FULL_MESSAGE };
  }
}

/** Computador local sem nuvem: o comportamento de antes (registro guardado no navegador). */
async function submitOnLocalComputer(payload: FieldDiaryPayload, collected?: CollectedChange): Promise<FieldRecordSubmit> {
  const result = await saveFieldDiaryEntry(payload);

  if (result.persistence === "none") {
    return {
      status: "none",
      error:
        ("error" in result && result.error) ||
        "A nuvem não confirmou a gravação. O registro não foi publicado para outros usuários.",
    };
  }

  if (result.persistence === "browser") {
    return {
      status: "browser",
      entry: result.entry,
      outcome: { ...RECORD_NOT_SAVED, savedEntryId: result.entry.id },
      message: "Registro salvo localmente. A nuvem será usada quando estiver disponível.",
    };
  }

  const outcome = await saveCollectedOfSavedEntry(result.entry.id, collected);
  return { status: "cloud", entry: result.entry, outcome, message: collectedNotSavedMessage(outcome) };
}

export type FieldOutboxSyncResult = {
  sent: number;
  /** Itens que a nuvem recusou e precisam de alguém. */
  attention: number;
  /** Parou por falta de sinal ou sessão expirada; ainda há o que enviar. */
  stopped: "offline" | "session" | null;
  /** Não rodou: outro envio já estava em andamento. */
  skipped?: boolean;
};

let running: Promise<FieldOutboxSyncResult> | null = null;

/**
 * Manda para a nuvem o que está guardado no aparelho, um registro por vez. Para no
 * primeiro sinal de falta de conexão. Itens com problema só voltam a ser enviados
 * com `retryProblems` (botão “Tentar de novo”) ou quando a pessoa salva o registro.
 */
export function syncFieldOutbox(options: { retryProblems?: boolean } = {}): Promise<FieldOutboxSyncResult> {
  if (running) {
    return running.then((result) => ({ ...result, skipped: true }));
  }

  const run = async () => {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;

    if (locks?.request) {
      // Duas abas abertas não enviam o mesmo registro ao mesmo tempo.
      return locks.request("yvae-registros-no-aparelho", { ifAvailable: true }, async (lock) =>
        lock ? syncNow(options) : { sent: 0, attention: 0, stopped: null, skipped: true },
      );
    }

    return syncNow(options);
  };

  running = run().finally(() => {
    running = null;
  });

  return running;
}

async function syncNow({ retryProblems = false }: { retryProblems?: boolean }): Promise<FieldOutboxSyncResult> {
  const result: FieldOutboxSyncResult = { sent: 0, attention: 0, stopped: null };

  for (const record of [...readFieldOutbox()].reverse()) {
    if (record.problem && !retryProblems) {
      result.attention += 1;
      continue;
    }

    const attempt = { attempts: record.attempts + 1, lastAttemptAt: new Date().toISOString() };
    const sent = await sendFieldOutboxRecord(record);

    try {
      if (sent.kind === "done") {
        removeFieldOutboxRecord(record.id, record.updatedAt);
        result.sent += 1;
        continue;
      }

      if (sent.kind === "refused") {
        updateFieldOutboxRecord(record.id, record.updatedAt, { ...attempt, problem: sent.error });
        result.attention += 1;
        continue;
      }

      const { id: _id, queuedAt: _queuedAt, ...remaining } = sent.remaining;
      void _id;
      void _queuedAt;
      updateFieldOutboxRecord(record.id, record.updatedAt, { ...remaining, ...attempt });

      if (sent.kind === "partial") {
        result.sent += 1;
        result.attention += 1;
        continue;
      }

      result.stopped = sent.kind;
      break;
    } catch (error) {
      console.error("[field-outbox] não foi possível atualizar o registro guardado", error);
    }
  }

  if (result.sent && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FIELD_OUTBOX_SYNCED_EVENT, { detail: result }));
  }

  return result;
}
