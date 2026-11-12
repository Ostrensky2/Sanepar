/**
 * Registros de campo guardados no aparelho enquanto não há sinal.
 *
 * Quando o registro (ou as amostras e os parâmetros dele) não consegue chegar à
 * nuvem por falta de sinal, ele fica aqui e sobe sozinho depois (ver
 * lib/field-record-sync). Nada aqui é apagado sem a nuvem ter confirmado.
 *
 * Cada item é o registro inteiro, mais as amostras e as medições que ainda faltam
 * gravar. Salvar de novo o mesmo registro troca o item, sem perder o que já estava
 * pendente (amostras tiradas continuam saindo, por exemplo).
 */

import type { FieldDiaryEntry } from "@/lib/field-diary";
import type { ReadingsChange } from "@/lib/field-parameters-client";
import type { SamplesChange } from "@/lib/field-samples-client";

export const FIELD_OUTBOX_STORAGE_KEY = "yvae:registros-no-aparelho";
export const FIELD_OUTBOX_EVENT = "yvae:registros-no-aparelho-atualizados";

export type FieldOutboxRecord = {
  /** Identificador do registro no aparelho: o mesmo que o formulário usa. */
  id: string;
  entry: FieldDiaryEntry;
  /** "insert" = registro novo (a nuvem ainda não tem); "upsert" = edição de um registro da nuvem. */
  mode: "insert" | "upsert";
  /** O registro já está na nuvem com este id; faltam só as amostras e/ou as medições. */
  savedEntryId?: string;
  samples?: SamplesChange;
  readings?: ReadingsChange;
  queuedAt: string;
  updatedAt: string;
  attempts: number;
  lastAttemptAt?: string;
  /**
   * A nuvem recusou e alguém precisa olhar (código de amostra repetido, dado fora
   * do padrão). Enquanto houver problema, o envio automático pula o item.
   */
  problem?: string;
  /** A sessão expirou: o item volta a ser enviado sozinho depois que a pessoa entrar de novo. */
  waitingLogin?: boolean;
};

/** O que entra na fila; o resto (datas, tentativas) é preenchido aqui. */
export type FieldOutboxInput = Pick<FieldOutboxRecord, "entry" | "mode" | "samples" | "readings"> & {
  savedEntryId?: string;
  problem?: string;
  waitingLogin?: boolean;
};

export type FieldEntryDeviceState = NonNullable<FieldDiaryEntry["deviceState"]>;

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readFieldOutbox(): FieldOutboxRecord[] {
  if (!hasStorage()) {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(FIELD_OUTBOX_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isOutboxRecord) : [];
  } catch {
    return [];
  }
}

/** Grava a fila. Lança erro quando o aparelho não tem espaço (quem chama avisa a pessoa). */
function writeFieldOutbox(records: FieldOutboxRecord[]) {
  if (!hasStorage()) {
    return;
  }

  if (records.length) {
    window.localStorage.setItem(FIELD_OUTBOX_STORAGE_KEY, JSON.stringify(records));
  } else {
    window.localStorage.removeItem(FIELD_OUTBOX_STORAGE_KEY);
  }

  window.dispatchEvent(new Event(FIELD_OUTBOX_EVENT));
}

/** O item de um registro, pelo id do aparelho ou pelo id que a nuvem deu. */
export function findFieldOutboxRecord(entryId: string | null | undefined, records = readFieldOutbox()) {
  if (!entryId) {
    return null;
  }

  return records.find((record) => record.id === entryId || record.savedEntryId === entryId || record.entry.id === entryId) ?? null;
}

/**
 * Junta o que acabou de ser salvo com o que já estava guardado do mesmo registro.
 * Função pura (testada à parte).
 */
export function mergeFieldOutboxRecord(
  previous: FieldOutboxRecord | null,
  input: FieldOutboxInput,
  now = new Date().toISOString(),
): FieldOutboxRecord {
  const id = previous?.id ?? input.entry.id;
  // O registro que ainda não chegou à nuvem continua sendo "novo", mesmo editado.
  const mode = previous && previous.mode === "insert" && !previous.savedEntryId ? "insert" : input.mode;
  // Depois que a nuvem gravou o registro (talvez com outro id), as edições vão para esse id.
  const entryId = input.savedEntryId ?? previous?.savedEntryId ?? input.entry.id;
  const resendEntry = !input.savedEntryId;

  return {
    id,
    entry: { ...input.entry, id: entryId },
    mode: previous?.savedEntryId && resendEntry ? "upsert" : mode,
    ...(resendEntry ? {} : { savedEntryId: input.savedEntryId }),
    samples: mergeSamplesChange(previous?.samples, input.samples),
    readings: mergeReadingsChange(previous?.readings, input.readings),
    queuedAt: previous?.queuedAt ?? now,
    updatedAt: now,
    attempts: 0,
    ...(input.problem ? { problem: input.problem } : {}),
    ...(input.waitingLogin ? { waitingLogin: true } : {}),
  };
}

export function mergeSamplesChange(previous: SamplesChange | undefined, next: SamplesChange | undefined) {
  if (!next) return previous;
  if (!previous) return next;

  return {
    projectCode: next.projectCode,
    samples: next.samples,
    removedIds: removedAfterMerge(previous.samples, previous.removedIds, next.samples, next.removedIds),
  };
}

export function mergeReadingsChange(previous: ReadingsChange | undefined, next: ReadingsChange | undefined) {
  if (!next) return previous;
  if (!previous) return next;

  return {
    readings: next.readings,
    removedIds: removedAfterMerge(previous.readings, previous.removedIds, next.readings, next.removedIds),
  };
}

/** Saem: o que já saía, o que saiu agora e o que estava pendente e a pessoa tirou. */
function removedAfterMerge(
  previousItems: Array<{ id: string }>,
  previousRemoved: string[],
  nextItems: Array<{ id: string }>,
  nextRemoved: string[],
) {
  const kept = new Set(nextItems.map((item) => item.id));
  const removed = new Set([...previousRemoved, ...nextRemoved, ...previousItems.map((item) => item.id)]);

  return [...removed].filter((id) => !kept.has(id));
}

/**
 * Guarda o item no aparelho, no lugar do que havia com o mesmo id. Quem salva monta
 * o item com mergeFieldOutboxRecord antes de tentar enviar; o que não subiu volta
 * para cá. Lança erro quando o aparelho está sem espaço.
 */
export function putFieldOutboxRecord(record: FieldOutboxRecord) {
  const records = readFieldOutbox();

  writeFieldOutbox([record, ...records.filter((item) => item.id !== record.id)]);
}

/**
 * A nuvem confirmou tudo: o item sai do aparelho. Com `updatedAtBefore`, só sai se
 * ninguém salvou o registro de novo durante o envio.
 */
export function removeFieldOutboxRecord(id: string, updatedAtBefore?: string) {
  const records = readFieldOutbox();
  const next = records.filter(
    (record) => record.id !== id || (updatedAtBefore !== undefined && record.updatedAt !== updatedAtBefore),
  );

  if (next.length !== records.length) {
    writeFieldOutbox(next);
  }
}

/** Atualiza um item depois de uma tentativa de envio (sem trocar o que a pessoa salvou depois). */
export function updateFieldOutboxRecord(
  id: string,
  updatedAtBefore: string,
  patch: Partial<Omit<FieldOutboxRecord, "id" | "queuedAt">>,
) {
  const records = readFieldOutbox();
  const index = records.findIndex((record) => record.id === id);

  if (index < 0) {
    return;
  }

  const current = records[index];
  // A pessoa salvou de novo durante o envio: vale o que ela salvou; só a contagem muda.
  const changedMeanwhile = current.updatedAt !== updatedAtBefore;
  const next = changedMeanwhile
    ? { ...current, attempts: patch.attempts ?? current.attempts, lastAttemptAt: patch.lastAttemptAt ?? current.lastAttemptAt }
    : { ...current, ...patch };

  writeFieldOutbox(records.map((record, position) => (position === index ? next : record)));
}

export function fieldOutboxDeviceState(record: FieldOutboxRecord): FieldEntryDeviceState {
  return record.problem ? "attention" : "pending";
}

/**
 * Lista do Diário de campo: os registros da nuvem com os do aparelho por cima
 * (um registro editado sem sinal aparece com a versão do aparelho).
 */
export function mergeEntriesWithOutbox<Entry extends FieldDiaryEntry>(
  entries: Entry[],
  records: FieldOutboxRecord[],
): Entry[] {
  if (!records.length) {
    return entries;
  }

  const byId = new Map<string, FieldOutboxRecord>();

  for (const record of records) {
    byId.set(record.id, record);
    byId.set(record.entry.id, record);
    if (record.savedEntryId) byId.set(record.savedEntryId, record);
  }

  const shown = new Set<FieldOutboxRecord>();
  const merged = entries.map((entry) => {
    const record = byId.get(entry.id);

    if (!record) {
      return entry;
    }

    shown.add(record);
    // Só as amostras ou medições faltam: o registro da nuvem já é o atual.
    const base = record.savedEntryId ? entry : ({ ...entry, ...record.entry, id: entry.id } as Entry);
    return { ...base, deviceState: fieldOutboxDeviceState(record), deviceProblem: record.problem };
  });

  const onlyOnDevice = records
    .filter((record) => !shown.has(record))
    .map((record) => ({
      ...(record.entry as Entry),
      deviceState: fieldOutboxDeviceState(record),
      deviceProblem: record.problem,
    }));

  return [...onlyOnDevice, ...merged].sort(
    (a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function describeFieldOutbox(records: FieldOutboxRecord[]) {
  const attention = records.filter((record) => record.problem).length;
  const waiting = records.length - attention;

  return { total: records.length, waiting, attention };
}

function isOutboxRecord(value: unknown): value is FieldOutboxRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<FieldOutboxRecord>;

  return (
    typeof record.id === "string" &&
    Boolean(record.entry && typeof record.entry === "object" && typeof record.entry.id === "string") &&
    (record.mode === "insert" || record.mode === "upsert") &&
    typeof record.queuedAt === "string" &&
    typeof record.updatedAt === "string"
  );
}
