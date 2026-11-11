/**
 * Amostras do ponto (fase 2 do padrão de coleta, docs/padrao-coleta-de-campo.md).
 *
 * Regras puras: como as amostras nascem dos padrões da campanha, como o código da
 * etiqueta acompanha a data e o ponto do registro, o que é conferido antes de
 * gravar e como os dois campos de texto antigos são preenchidos sozinhos. Nada
 * aqui fala com banco ou tela.
 */

import {
  COLLECTION_TEXT_MAX_LENGTH,
  FieldStandardError,
  SAMPLE_CODE_MAX_SEQUENCE,
  buildSampleCode,
  conservationTypes,
  getSampleType,
  isSampleTypeId,
  normalizeProjectCode,
  sampleTypes,
  type CollectionDefaults,
  type ConservationType,
  type SampleTypeId,
} from "@/lib/field-standard";

export const MAX_SAMPLES_PER_ENTRY = 60;
export const SAMPLE_POSITION_MAX_LENGTH = 40;
export const MAX_SAMPLE_DEPTH_M = 11000;
export const MAX_SAMPLE_QUANTITY = 999999;
const LEGACY_TEXT_MAX_LENGTH = 120;

/** Amostra como está gravada. */
export type FieldSample = {
  id: string;
  entryId: string;
  code: string;
  projectCode: string;
  sampleType: SampleTypeId;
  sequence: number;
  /** Profundidade em metros; 0 = superfície; null = não se aplica ou não informada. */
  depthM: number | null;
  quantity: number | null;
  quantityUnit: string;
  specification: string;
  conservation: ConservationType;
  packaging: string;
  boxPosition: string;
};

/** Amostra como está no formulário: os números ainda são o texto digitado. */
export type SampleDraft = {
  id: string;
  sampleType: SampleTypeId;
  sequence: number;
  depthM: string;
  quantity: string;
  specification: string;
  conservation: ConservationType;
  packaging: string;
  boxPosition: string;
  /** Código já gravado na nuvem; vazio enquanto a amostra é nova. */
  savedCode: string;
};

/** O que o código da etiqueta leva do registro de campo. */
export type SampleCodeContext = {
  projectCode: string;
  /** Data da coleta, AAAA-MM-DD. */
  date: string;
  /** Ponto de coleta (SIA). */
  point: string;
};

/** Amostra pronta para gravar (o que o aparelho envia para a nuvem). */
export type SampleInput = Omit<FieldSample, "entryId" | "projectCode">;

/** Um código que já pertence a outra amostra, com o próximo número livre. */
export type SampleCodeConflict = {
  sampleId: string;
  code: string;
  suggestedSequence: number;
  suggestedCode: string;
  /** true = a outra amostra é deste mesmo registro (gravada por outro aparelho). */
  sameEntry: boolean;
};

export type LastPackagingByType = Partial<Record<SampleTypeId, string>>;

type DraftFactoryOptions = {
  defaults: CollectionDefaults;
  /** Último acondicionamento usado neste aparelho, por tipo de amostra. */
  lastPackaging?: LastPackagingByType;
  newId: () => string;
};

// ---------------------------------------------------------------------------
// Código da etiqueta
// ---------------------------------------------------------------------------

/**
 * Código da amostra para a data e o ponto do registro. Enquanto faltar o ponto ou
 * a data, devolve o motivo em vez do código.
 */
export function sampleCodeOf(
  sample: Pick<SampleDraft, "sampleType" | "sequence">,
  context: SampleCodeContext,
): { code: string; error: string } {
  try {
    return {
      code: buildSampleCode({
        projectCode: context.projectCode,
        date: context.date,
        point: context.point,
        sampleType: sample.sampleType,
        sequence: sample.sequence,
      }),
      error: "",
    };
  } catch (error) {
    if (error instanceof FieldStandardError) {
      return { code: "", error: error.message };
    }
    throw error;
  }
}

/** Próximo número livre do tipo dentro do registro (1, 2, 3…). */
export function nextDraftSequence(drafts: SampleDraft[], sampleType: SampleTypeId) {
  return drafts.reduce((highest, draft) => (draft.sampleType === sampleType ? Math.max(highest, draft.sequence) : highest), 0) + 1;
}

// ---------------------------------------------------------------------------
// Amostras propostas pelos padrões da campanha
// ---------------------------------------------------------------------------

/** As amostras que a campanha propõe para cada ponto (ex.: 3 de água e 1 de plâncton). */
export function buildDefaultSampleDrafts(options: DraftFactoryOptions): SampleDraft[] {
  const drafts: SampleDraft[] = [];

  for (const type of sampleTypes) {
    const replicas = options.defaults.sampleTypes[type.id]?.replicas ?? 0;

    for (let sequence = 1; sequence <= replicas && drafts.length < MAX_SAMPLES_PER_ENTRY; sequence += 1) {
      drafts.push(draftFromDefaults(type.id, sequence, options));
    }
  }

  return drafts;
}

/**
 * Mais uma amostra do tipo. Repete a última amostra desse tipo no registro (é o
 * caso comum: mais uma réplica igual); sem nenhuma, vale o padrão da campanha.
 */
export function addSampleDraft(
  drafts: SampleDraft[],
  sampleType: SampleTypeId,
  options: DraftFactoryOptions,
): SampleDraft[] {
  if (drafts.length >= MAX_SAMPLES_PER_ENTRY) {
    return drafts;
  }

  const sequence = nextDraftSequence(drafts, sampleType);
  const sibling = [...drafts].reverse().find((draft) => draft.sampleType === sampleType);
  const draft: SampleDraft = sibling
    ? { ...sibling, id: options.newId(), sequence, boxPosition: "", savedCode: "" }
    : draftFromDefaults(sampleType, sequence, options);

  return [...drafts, draft];
}

function draftFromDefaults(sampleType: SampleTypeId, sequence: number, options: DraftFactoryOptions): SampleDraft {
  const type = getSampleType(sampleType);
  const typeDefaults = options.defaults.sampleTypes[sampleType];
  const rememberedPackaging = cleanText(options.lastPackaging?.[sampleType], COLLECTION_TEXT_MAX_LENGTH);

  return {
    id: options.newId(),
    sampleType,
    sequence,
    depthM: type.usesDepth ? numberToInput(typeDefaults?.depthM ?? null) : "",
    quantity: numberToInput(typeDefaults?.quantity ?? null),
    specification: typeDefaults?.specification ?? "",
    conservation: typeDefaults?.conservation ?? "OUTRO",
    packaging: rememberedPackaging || typeDefaults?.packaging || "",
    boxPosition: "",
    savedCode: "",
  };
}

/** "3 de Água e 1 de Plâncton", para dizer o que a campanha propõe. */
export function describeDefaultSamples(defaults: CollectionDefaults) {
  return describeCounts(
    sampleTypes.map((type) => ({ label: type.label, count: defaults.sampleTypes[type.id]?.replicas ?? 0 })),
  );
}

/** "3 de Água e 1 de Plâncton", para as amostras que estão no registro. */
export function describeSampleCounts(samples: Array<Pick<SampleDraft, "sampleType">>) {
  return describeCounts(
    sampleTypes.map((type) => ({
      label: type.label,
      count: samples.filter((sample) => sample.sampleType === type.id).length,
    })),
  );
}

function describeCounts(counts: Array<{ label: string; count: number }>) {
  const parts = counts.filter((item) => item.count > 0).map((item) => `${item.count} de ${item.label}`);

  if (parts.length <= 1) {
    return parts[0] ?? "";
  }

  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Conferência antes de gravar
// ---------------------------------------------------------------------------

/** Texto digitado (aceita vírgula) como número não negativo. Vazio vale null. */
export function parseSampleNumber(text: unknown, max: number): { value: number | null; valid: boolean } {
  const trimmed = typeof text === "number" ? String(text) : String(text ?? "").trim();

  if (!trimmed) {
    return { value: null, valid: true };
  }

  if (!/^\d+([.,]\d+)?$/.test(trimmed)) {
    return { value: null, valid: false };
  }

  const value = Number(trimmed.replace(",", "."));

  return Number.isFinite(value) && value <= max ? { value, valid: true } : { value: null, valid: false };
}

/** Problemas que impedem gravar as amostras. Lista vazia = pode gravar. */
export function validateSampleDrafts(drafts: SampleDraft[], context: SampleCodeContext): string[] {
  if (!drafts.length) {
    return [];
  }

  const errors: string[] = [];

  if (drafts.length > MAX_SAMPLES_PER_ENTRY) {
    errors.push(`Um registro de campo aceita até ${MAX_SAMPLES_PER_ENTRY} amostras.`);
  }

  const codeProblem = sampleCodeOf(drafts[0], context).error;

  if (codeProblem) {
    errors.push(`${codeProblem} Sem isso as amostras não têm código de etiqueta.`);
  }

  const seen = new Set<string>();

  for (const draft of drafts) {
    const type = getSampleType(draft.sampleType);
    const name = `${type.label} ${draft.sequence}`;
    const key = `${draft.sampleType}:${draft.sequence}`;

    if (seen.has(key)) {
      errors.push(`Há duas amostras com o número ${type.code}${draft.sequence}. Remova uma delas.`);
    }
    seen.add(key);

    if (!Number.isInteger(draft.sequence) || draft.sequence < 1 || draft.sequence > SAMPLE_CODE_MAX_SEQUENCE) {
      errors.push(`${name}: o número da amostra deve ficar entre 1 e ${SAMPLE_CODE_MAX_SEQUENCE}.`);
    }

    if (type.usesDepth && !parseSampleNumber(draft.depthM, MAX_SAMPLE_DEPTH_M).valid) {
      errors.push(`${name}: a profundidade deve ser um número em metros (0 = superfície).`);
    }

    if (!parseSampleNumber(draft.quantity, MAX_SAMPLE_QUANTITY).valid) {
      errors.push(`${name}: ${type.quantityLabel.toLowerCase()} deve ser um número em ${type.quantityUnit}.`);
    }
  }

  return errors;
}

/** Amostras do formulário no formato gravado. Chamar depois de validateSampleDrafts. */
export function sampleDraftsToInputs(drafts: SampleDraft[], context: SampleCodeContext): SampleInput[] {
  return drafts.map((draft) => {
    const type = getSampleType(draft.sampleType);

    return {
      id: draft.id,
      code: sampleCodeOf(draft, context).code,
      sampleType: draft.sampleType,
      sequence: draft.sequence,
      depthM: type.usesDepth ? parseSampleNumber(draft.depthM, MAX_SAMPLE_DEPTH_M).value : null,
      quantity: parseSampleNumber(draft.quantity, MAX_SAMPLE_QUANTITY).value,
      quantityUnit: type.quantityUnit,
      specification: cleanText(draft.specification, COLLECTION_TEXT_MAX_LENGTH),
      conservation: draft.conservation,
      packaging: cleanText(draft.packaging, COLLECTION_TEXT_MAX_LENGTH),
      boxPosition: cleanText(draft.boxPosition, SAMPLE_POSITION_MAX_LENGTH),
    };
  });
}

export function samplesToDrafts(samples: FieldSample[]): SampleDraft[] {
  return sortSamples(samples).map((sample) => ({
    id: sample.id,
    sampleType: sample.sampleType,
    sequence: sample.sequence,
    depthM: numberToInput(sample.depthM),
    quantity: numberToInput(sample.quantity),
    specification: sample.specification,
    conservation: sample.conservation,
    packaging: sample.packaging,
    boxPosition: sample.boxPosition,
    savedCode: sample.code,
  }));
}

/** Ordem de exibição: por tipo (na ordem do padrão) e depois pelo número. */
export function sortSamples<Sample extends Pick<SampleDraft, "sampleType" | "sequence">>(samples: Sample[]): Sample[] {
  const typeOrder = new Map(sampleTypes.map((type, index) => [type.id as SampleTypeId, index]));

  return [...samples].sort(
    (a, b) =>
      (typeOrder.get(a.sampleType) ?? 0) - (typeOrder.get(b.sampleType) ?? 0) || a.sequence - b.sequence,
  );
}

/** Leitura de uma amostra vinda de fora (corpo da requisição). null = inválida. */
export function normalizeSampleInput(value: unknown): SampleInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
  const sequence = Number(raw.sequence);

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ||
    !isSampleTypeId(raw.sampleType) ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > SAMPLE_CODE_MAX_SEQUENCE
  ) {
    return null;
  }

  const type = getSampleType(raw.sampleType);
  const depth = parseSampleNumber(raw.depthM, MAX_SAMPLE_DEPTH_M);
  const quantity = parseSampleNumber(raw.quantity, MAX_SAMPLE_QUANTITY);
  const conservation = conservationTypes.find((item) => item.value === raw.conservation)?.value;

  if (!depth.valid || !quantity.valid || !conservation) {
    return null;
  }

  return {
    id,
    code: typeof raw.code === "string" ? raw.code.trim().toUpperCase() : "",
    sampleType: type.id,
    sequence,
    depthM: type.usesDepth ? depth.value : null,
    quantity: quantity.value,
    quantityUnit: type.quantityUnit,
    specification: cleanText(raw.specification, COLLECTION_TEXT_MAX_LENGTH),
    conservation,
    packaging: cleanText(raw.packaging, COLLECTION_TEXT_MAX_LENGTH),
    boxPosition: cleanText(raw.boxPosition, SAMPLE_POSITION_MAX_LENGTH),
  };
}

export function safeProjectCode(value: unknown): string | null {
  try {
    return normalizeProjectCode(value);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Código repetido
// ---------------------------------------------------------------------------

/** Troca o número das amostras em conflito pelo próximo livre que a nuvem propôs. */
export function applySuggestedSequences(drafts: SampleDraft[], conflicts: SampleCodeConflict[]): SampleDraft[] {
  const suggestions = new Map(conflicts.map((conflict) => [conflict.sampleId, conflict.suggestedSequence]));

  return drafts.map((draft) => {
    const suggested = suggestions.get(draft.id);

    return suggested ? { ...draft, sequence: suggested } : draft;
  });
}

// ---------------------------------------------------------------------------
// Campos de texto antigos do registro
// ---------------------------------------------------------------------------

export type LegacySampleFields = {
  samplesReplicasEdna: string;
  zooplanktonId: string;
};

/**
 * O que as amostras dizem nos dois campos de texto que já existiam no registro:
 * "Amostras e Réplicas (eDNA)" (quantas amostras de água) e "ID Zooplâncton" (os
 * códigos das amostras de plâncton).
 */
export function legacyFieldsFromCodes(
  samples: Array<Pick<SampleDraft, "sampleType" | "sequence"> & { code: string }>,
): LegacySampleFields {
  const water = samples.filter((sample) => sample.sampleType === "water").length;
  const planktonCodes: string[] = [];

  for (const sample of sortSamples(samples)) {
    if (
      sample.sampleType === "plankton" &&
      sample.code &&
      [...planktonCodes, sample.code].join(", ").length <= LEGACY_TEXT_MAX_LENGTH
    ) {
      planktonCodes.push(sample.code);
    }
  }

  return {
    samplesReplicasEdna: water === 0 ? "" : water === 1 ? "1 réplica" : `${water} réplicas`,
    zooplanktonId: planktonCodes.join(", "),
  };
}

/** O mesmo, para as amostras do formulário, com o código da data e do ponto de agora. */
export function legacyFieldsFromSamples(
  samples: Array<Pick<SampleDraft, "sampleType" | "sequence">>,
  context: SampleCodeContext,
): LegacySampleFields {
  return legacyFieldsFromCodes(
    samples.map((sample) => ({
      sampleType: sample.sampleType,
      sequence: sample.sequence,
      code: sampleCodeOf(sample, context).code,
    })),
  );
}

/**
 * O que mudar nos campos antigos quando as amostras mudam. Um campo só é trocado
 * se estiver vazio ou ainda com o texto que o próprio app tinha escrito: o que a
 * pessoa digitou à mão (ou veio da planilha) fica como está.
 */
export function legacyFieldsPatch(
  current: { samplesReplicasEdna?: string | null; zooplanktonId?: string | null },
  previousAuto: LegacySampleFields,
  nextAuto: LegacySampleFields,
): Partial<LegacySampleFields> {
  const patch: Partial<LegacySampleFields> = {};

  for (const field of ["samplesReplicasEdna", "zooplanktonId"] as const) {
    const value = String(current[field] ?? "").trim();
    const isOurs = !value || value === previousAuto[field];

    if (isOurs && value !== nextAuto[field]) {
      patch[field] = nextAuto[field];
    }
  }

  return patch;
}

// ---------------------------------------------------------------------------
// Resumo de uma amostra em uma linha
// ---------------------------------------------------------------------------

type SampleDetails = Pick<
  FieldSample,
  "sampleType" | "depthM" | "quantity" | "conservation" | "packaging" | "specification" | "boxPosition"
>;

/** "Superfície · 1000 mL · Filtro congelado · Isopor com gelo · eDNA". */
export function describeSampleDetails(sample: SampleDetails) {
  const type = getSampleType(sample.sampleType);
  const conservation = conservationTypes.find((item) => item.value === sample.conservation);

  return [
    type.usesDepth && sample.depthM !== null
      ? sample.depthM === 0
        ? "Superfície"
        : `${numberToInput(sample.depthM)} m de profundidade`
      : "",
    sample.quantity !== null ? `${numberToInput(sample.quantity)} ${type.quantityUnit}` : "",
    conservation && conservation.value !== "OUTRO" ? conservation.label : "",
    sample.packaging,
    sample.specification,
    sample.boxPosition ? `Posição ${sample.boxPosition}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** O mesmo resumo para uma amostra do formulário (números ainda em texto). */
export function describeSampleDraft(draft: SampleDraft) {
  return describeSampleDetails({
    sampleType: draft.sampleType,
    depthM: parseSampleNumber(draft.depthM, MAX_SAMPLE_DEPTH_M).value,
    quantity: parseSampleNumber(draft.quantity, MAX_SAMPLE_QUANTITY).value,
    conservation: draft.conservation,
    packaging: draft.packaging.trim(),
    specification: draft.specification.trim(),
    boxPosition: draft.boxPosition.trim(),
  });
}

/** Rótulo curto da amostra: "AG1", "PL2". */
export function sampleShortLabel(sample: Pick<SampleDraft, "sampleType" | "sequence">) {
  return `${getSampleType(sample.sampleType).code}${sample.sequence}`;
}

// ---------------------------------------------------------------------------

/** Número no campo do formulário, com vírgula decimal. */
export function numberToInput(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value).replace(".", ",") : "";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
