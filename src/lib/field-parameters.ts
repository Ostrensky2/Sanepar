/**
 * Parâmetros medidos em campo (fase 3 do padrão de coleta,
 * docs/padrao-coleta-de-campo.md, seção 5).
 *
 * Regras puras: o catálogo de parâmetros (os oito do padrão mais os que a equipe
 * criar), a medição como número com unidade, profundidade, hora e equipamento, a
 * faixa esperada (que avisa, sem impedir) e a ligação entre medição e amostra.
 * Nada aqui fala com banco ou tela.
 */

import { MAX_SAMPLE_DEPTH_M, numberToInput, parseSampleNumber } from "@/lib/field-samples";
import {
  COLLECTION_TEXT_MAX_LENGTH,
  FIELD_PARAMETER_ID_PATTERN,
  FIELD_PARAMETER_LABEL_MAX_LENGTH,
  FIELD_PARAMETER_UNIT_MAX_LENGTH,
  baseFieldParameters,
  getSampleType,
  isSampleTypeId,
  sampleTypeIds,
  type FieldParameterDefinition,
  type SampleTypeId,
} from "@/lib/field-standard";

export const MAX_READINGS_PER_ENTRY = 100;
export const MAX_FIELD_PARAMETERS = 200;
/** Maior valor absoluto aceito numa medição (acima disso é erro de digitação). */
export const MAX_READING_ABS_VALUE = 1_000_000_000;
export const READING_EQUIPMENT_MAX_LENGTH = COLLECTION_TEXT_MAX_LENGTH;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Parâmetro do catálogo, como está gravado. */
export type FieldParameter = FieldParameterDefinition & {
  /** true = um dos oito do padrão; só pode ser desativado, não alterado. */
  isBase: boolean;
  /** false = não é mais oferecido em registros novos; as medições antigas continuam. */
  active: boolean;
  sortOrder: number;
};

/** O que a pessoa informa para criar ou alterar um parâmetro. */
export type FieldParameterInput = Pick<
  FieldParameterDefinition,
  "label" | "unit" | "min" | "max" | "appliesTo" | "usesDepth"
>;

/** Medição como está gravada. */
export type FieldReading = {
  id: string;
  entryId: string;
  parameterId: string;
  value: number;
  /** Unidade do parâmetro no momento da medição. */
  unit: string;
  /** Profundidade em metros (0 = superfície); null quando o parâmetro não tem profundidade. */
  depthM: number | null;
  /** Hora da medição, "HH:MM", no relógio de quem mediu. Vazio = não informada. */
  measuredTime: string;
  equipment: string;
};

/** Medição no formulário: os números ficam como a pessoa digitou. */
export type ReadingDraft = {
  id: string;
  parameterId: string;
  value: string;
  depthM: string;
  measuredTime: string;
  equipment: string;
  /** true = já está gravada na nuvem. */
  saved: boolean;
};

/** Medição pronta para gravar. A unidade é o servidor que copia do catálogo. */
export type ReadingInput = Omit<FieldReading, "entryId" | "unit">;

/** Último equipamento usado neste aparelho, por parâmetro. */
export type LastEquipmentByParameter = Record<string, string>;

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/** Os oito parâmetros do padrão, usados enquanto a nuvem não respondeu. */
export function baseParameterCatalog(): FieldParameter[] {
  return baseFieldParameters.map((parameter, index) => ({
    ...parameter,
    appliesTo: [...parameter.appliesTo],
    isBase: true,
    active: true,
    sortOrder: (index + 1) * 10,
  }));
}

/** Ordem do catálogo: a do padrão primeiro, depois os criados, por nome. */
export function sortCatalog<Parameter extends Pick<FieldParameter, "sortOrder" | "label">>(
  catalog: Parameter[],
): Parameter[] {
  return [...catalog].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
  );
}

export function findParameter(catalog: FieldParameter[], parameterId: string) {
  return catalog.find((parameter) => parameter.id === parameterId) ?? null;
}

/** Nome sem acento, caixa ou espaço sobrando: "  Clorofila-A " e "clorofila a" são o mesmo. */
export function parameterLabelKey(label: string) {
  return stripAccents(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findParameterByLabel(catalog: FieldParameter[], label: string) {
  const key = parameterLabelKey(label);

  return key ? catalog.find((parameter) => parameterLabelKey(parameter.label) === key) ?? null : null;
}

/** Identificador de um parâmetro novo, a partir do nome: "Clorofila a" vira `clorofila_a`. */
export function buildParameterId(label: string, takenIds: Iterable<string>) {
  const taken = new Set(takenIds);
  let base = parameterLabelKey(label).replace(/ /g, "_");

  if (!/^[a-z]/.test(base)) {
    base = `p_${base}`;
  }

  base = base.slice(0, 36).replace(/_+$/, "");

  if (base.length < 2) {
    base = "parametro";
  }

  if (!taken.has(base)) {
    return base;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * Confere o que a pessoa informou para um parâmetro (novo ou alterado). Aceita
 * número digitado com vírgula.
 */
export function normalizeParameterInput(
  raw: unknown,
): { ok: true; parameter: FieldParameterInput } | { ok: false; error: string } {
  const value = isRecord(raw) ? raw : {};
  const label = typeof value.label === "string" ? value.label.trim().replace(/\s+/g, " ") : "";

  if (!label) {
    return { ok: false, error: "Informe o nome do parâmetro." };
  }

  if (label.length > FIELD_PARAMETER_LABEL_MAX_LENGTH) {
    return { ok: false, error: `O nome do parâmetro aceita até ${FIELD_PARAMETER_LABEL_MAX_LENGTH} caracteres.` };
  }

  if (!parameterLabelKey(label)) {
    return { ok: false, error: "O nome do parâmetro precisa ter letras ou números." };
  }

  const unit = typeof value.unit === "string" ? value.unit.trim() : "";

  if (unit.length > FIELD_PARAMETER_UNIT_MAX_LENGTH) {
    return { ok: false, error: `A unidade aceita até ${FIELD_PARAMETER_UNIT_MAX_LENGTH} caracteres.` };
  }

  const min = parseReadingNumber(value.min);
  const max = parseReadingNumber(value.max);

  if (!min.valid || !max.valid) {
    return { ok: false, error: "A faixa esperada deve ter números (ex.: 0 e 14) ou ficar vazia." };
  }

  if (min.value !== null && max.value !== null && max.value <= min.value) {
    return { ok: false, error: "Na faixa esperada, o máximo deve ser maior que o mínimo." };
  }

  const appliesTo = Array.isArray(value.appliesTo)
    ? sampleTypeIds.filter((type) => (value.appliesTo as unknown[]).includes(type))
    : [...sampleTypeIds];

  if (!appliesTo.length) {
    return { ok: false, error: "Marque pelo menos um tipo de amostra em que o parâmetro é medido." };
  }

  return {
    ok: true,
    parameter: {
      label,
      unit,
      min: min.value,
      max: max.value,
      appliesTo,
      usesDepth: value.usesDepth !== false,
    },
  };
}

// ---------------------------------------------------------------------------
// Números, hora e faixa esperada
// ---------------------------------------------------------------------------

/** Valor digitado (aceita vírgula e sinal) como número. Vazio vale null. */
export function parseReadingNumber(text: unknown): { value: number | null; valid: boolean } {
  if (text === null || text === undefined) {
    return { value: null, valid: true };
  }

  const trimmed = typeof text === "number" ? String(text) : String(text).trim();

  if (!trimmed) {
    return { value: null, valid: true };
  }

  if (!/^[+-]?\d+([.,]\d+)?$/.test(trimmed)) {
    return { value: null, valid: false };
  }

  const value = Number(trimmed.replace(",", "."));

  return Number.isFinite(value) && Math.abs(value) <= MAX_READING_ABS_VALUE
    ? { value, valid: true }
    : { value: null, valid: false };
}

export function isValidMeasuredTime(text: string) {
  return !text || TIME_PATTERN.test(text);
}

/** "HH:MM" do relógio do aparelho. */
export function timeOfDay(now: Date) {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** "0 a 14", "a partir de 0", "até 40" ou "" quando o parâmetro não tem faixa. */
export function describeParameterRange(parameter: Pick<FieldParameter, "min" | "max">) {
  if (parameter.min !== null && parameter.max !== null) {
    return `${numberToInput(parameter.min)} a ${numberToInput(parameter.max)}`;
  }

  if (parameter.min !== null) {
    return `a partir de ${numberToInput(parameter.min)}`;
  }

  return parameter.max !== null ? `até ${numberToInput(parameter.max)}` : "";
}

/**
 * Aviso quando o valor está fora da faixa esperada do parâmetro. Só avisa: a
 * medição pode ser gravada assim mesmo.
 */
export function rangeWarning(parameter: Pick<FieldParameter, "min" | "max" | "unit">, value: number | null) {
  if (value === null) {
    return "";
  }

  const below = parameter.min !== null && value < parameter.min;
  const above = parameter.max !== null && value > parameter.max;

  if (!below && !above) {
    return "";
  }

  const unit = parameter.unit ? ` ${parameter.unit}` : "";

  return `Fora da faixa esperada (${describeParameterRange(parameter)}${unit}). Confira o valor; dá para salvar assim mesmo.`;
}

// ---------------------------------------------------------------------------
// Medições no formulário
// ---------------------------------------------------------------------------

type DraftFactoryOptions = {
  /** Profundidade das medições novas, como texto ("0" = superfície). */
  defaultDepthM: string;
  lastEquipment: LastEquipmentByParameter;
  newId: () => string;
};

function newDraft(parameter: FieldParameter, depthM: string, options: DraftFactoryOptions): ReadingDraft {
  return {
    id: options.newId(),
    parameterId: parameter.id,
    value: "",
    depthM: parameter.usesDepth ? depthM : "",
    measuredTime: "",
    equipment: (options.lastEquipment[parameter.id] ?? "").slice(0, READING_EQUIPMENT_MAX_LENGTH),
    saved: false,
  };
}

/**
 * Uma linha em branco para cada parâmetro que a campanha mede em todo ponto. A
 * pessoa só digita os valores; linha sem valor não é gravada.
 */
export function buildDefaultReadingDrafts(
  parameterIds: string[],
  catalog: FieldParameter[],
  options: DraftFactoryOptions,
): ReadingDraft[] {
  const drafts: ReadingDraft[] = [];

  for (const parameter of sortCatalog(catalog)) {
    if (parameter.active && parameterIds.includes(parameter.id)) {
      drafts.push(newDraft(parameter, options.defaultDepthM, options));
    }
  }

  return drafts;
}

/**
 * Acrescenta uma medição do parâmetro. Se já existe uma na profundidade padrão, a
 * nova nasce sem profundidade, para a pessoa informar outra.
 */
export function addReadingDraft(
  drafts: ReadingDraft[],
  parameter: FieldParameter,
  options: DraftFactoryOptions,
): ReadingDraft[] {
  if (drafts.length >= MAX_READINGS_PER_ENTRY) {
    return drafts;
  }

  const draft = newDraft(parameter, options.defaultDepthM, options);
  const sameDepthTaken = drafts.some(
    (existing) => existing.parameterId === parameter.id && readingKey(existing, parameter) === readingKey(draft, parameter),
  );

  return [...drafts, sameDepthTaken ? { ...draft, depthM: "" } : draft];
}

/** Medição com valor digitado (as linhas em branco não contam nem são gravadas). */
export function isFilledReading(draft: Pick<ReadingDraft, "value">) {
  return draft.value.trim() !== "";
}

/**
 * Medições na ordem do catálogo e, dentro do parâmetro, da superfície para o fundo.
 * A que ainda está sem profundidade fica por último, logo abaixo das que já têm.
 */
export function sortReadings<Reading extends { parameterId: string; depthM: number | string | null }>(
  readings: Reading[],
  catalog: FieldParameter[],
): Reading[] {
  const order = new Map(sortCatalog(catalog).map((parameter, index) => [parameter.id, index]));
  const depthOf = (reading: Reading) => {
    const depth = typeof reading.depthM === "number" ? reading.depthM : parseSampleNumber(reading.depthM, MAX_SAMPLE_DEPTH_M).value;
    return depth ?? Number.MAX_SAFE_INTEGER;
  };

  return [...readings].sort(
    (a, b) =>
      (order.get(a.parameterId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.parameterId) ?? Number.MAX_SAFE_INTEGER) ||
      a.parameterId.localeCompare(b.parameterId) ||
      depthOf(a) - depthOf(b),
  );
}

export function readingsToDrafts(readings: FieldReading[]): ReadingDraft[] {
  return readings.map((reading) => ({
    id: reading.id,
    parameterId: reading.parameterId,
    value: numberToInput(reading.value),
    depthM: numberToInput(reading.depthM),
    measuredTime: reading.measuredTime,
    equipment: reading.equipment,
    saved: true,
  }));
}

/** Medições que ficaram guardadas no aparelho (sem sinal) de volta ao formulário. */
export function readingInputsToDrafts(inputs: ReadingInput[]): ReadingDraft[] {
  return readingsToDrafts(inputs.map((input) => ({ ...input, entryId: "", unit: "" }))).map((draft) => ({
    ...draft,
    saved: false,
  }));
}

/** Parâmetro + profundidade: o que não pode se repetir num mesmo registro. */
function readingKey(draft: Pick<ReadingDraft, "parameterId" | "depthM">, parameter: FieldParameter | null) {
  const depth = parameter?.usesDepth === false ? null : parseSampleNumber(draft.depthM, MAX_SAMPLE_DEPTH_M).value;

  return `${draft.parameterId}@${depth === null ? "" : depth}`;
}

/** Problemas que impedem gravar as medições. Lista vazia = pode gravar. */
export function validateReadingDrafts(drafts: ReadingDraft[], catalog: FieldParameter[]): string[] {
  const filled = drafts.filter(isFilledReading);
  const errors: string[] = [];

  if (filled.length > MAX_READINGS_PER_ENTRY) {
    errors.push(`Um registro de campo aceita até ${MAX_READINGS_PER_ENTRY} medições.`);
  }

  const seen = new Set<string>();

  for (const draft of filled) {
    const parameter = findParameter(catalog, draft.parameterId);
    const name = parameter?.label ?? "Parâmetro fora do catálogo";

    if (!parameter) {
      errors.push("Há uma medição de um parâmetro que não está no catálogo. Remova a medição.");
      continue;
    }

    if (!parseReadingNumber(draft.value).valid) {
      errors.push(`${name}: o valor deve ser um número (ex.: 7,2).`);
    }

    if (parameter.usesDepth && !parseSampleNumber(draft.depthM, MAX_SAMPLE_DEPTH_M).valid) {
      errors.push(`${name}: a profundidade deve ser um número em metros (0 = superfície).`);
    }

    if (!isValidMeasuredTime(draft.measuredTime)) {
      errors.push(`${name}: a hora da medição deve ser como 09:30.`);
    }

    const key = readingKey(draft, parameter);

    if (seen.has(key)) {
      errors.push(
        parameter.usesDepth
          ? `${name}: há duas medições na mesma profundidade. Mude a profundidade de uma ou remova a repetida.`
          : `${name}: há duas medições. Remova a repetida.`,
      );
    }
    seen.add(key);
  }

  return errors;
}

/** Medições preenchidas, prontas para gravar. Só chamar depois de validateReadingDrafts. */
export function readingDraftsToInputs(drafts: ReadingDraft[], catalog: FieldParameter[]): ReadingInput[] {
  return drafts.filter(isFilledReading).map((draft) => {
    const parameter = findParameter(catalog, draft.parameterId);

    return {
      id: draft.id,
      parameterId: draft.parameterId,
      value: parseReadingNumber(draft.value).value ?? 0,
      depthM: parameter?.usesDepth === false ? null : parseSampleNumber(draft.depthM, MAX_SAMPLE_DEPTH_M).value,
      measuredTime: draft.measuredTime,
      equipment: draft.equipment.trim().slice(0, READING_EQUIPMENT_MAX_LENGTH),
    };
  });
}

/** Medição que chegou ao servidor: devolve limpa, ou null se algo estiver fora do padrão. */
export function normalizeReadingInput(raw: unknown): ReadingInput | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = typeof raw.id === "string" ? raw.id.toLowerCase() : "";
  const parameterId = typeof raw.parameterId === "string" ? raw.parameterId : "";
  const value = raw.value;
  const depthM = raw.depthM ?? null;
  const measuredTime = typeof raw.measuredTime === "string" ? raw.measuredTime : "";
  const equipment = typeof raw.equipment === "string" ? raw.equipment.trim() : "";

  if (
    !UUID_PATTERN.test(id) ||
    !FIELD_PARAMETER_ID_PATTERN.test(parameterId) ||
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_READING_ABS_VALUE ||
    (depthM !== null &&
      (typeof depthM !== "number" || !Number.isFinite(depthM) || depthM < 0 || depthM > MAX_SAMPLE_DEPTH_M)) ||
    !isValidMeasuredTime(measuredTime) ||
    equipment.length > READING_EQUIPMENT_MAX_LENGTH
  ) {
    return null;
  }

  return { id, parameterId, value, depthM, measuredTime, equipment };
}

// ---------------------------------------------------------------------------
// Resumos e ligação com as amostras
// ---------------------------------------------------------------------------

/** "7,2" ou "120 µS/cm". */
export function formatReadingValue(value: number, unit: string) {
  return unit ? `${numberToInput(value)} ${unit}` : numberToInput(value);
}

/** "Superfície", "2 m de profundidade" ou "" quando não há profundidade. */
export function describeReadingDepth(depthM: number | null) {
  if (depthM === null) {
    return "";
  }

  return depthM === 0 ? "Superfície" : `${numberToInput(depthM)} m de profundidade`;
}

/** "Superfície · 09:30 · Sonda multiparâmetro". */
export function describeReadingDetails(reading: Pick<FieldReading, "depthM" | "measuredTime" | "equipment">) {
  return [describeReadingDepth(reading.depthM), reading.measuredTime, reading.equipment].filter(Boolean).join(" · ");
}

/** Linha do histórico: "pH 7,2; Condutividade 120 µS/cm (2 m)". */
export function describeReadingsForLog(readings: FieldReading[], catalog: FieldParameter[]) {
  return sortReadings(readings, catalog)
    .map((reading) => {
      const label = findParameter(catalog, reading.parameterId)?.label ?? reading.parameterId;
      const depth = reading.depthM ? ` (${numberToInput(reading.depthM)} m)` : "";

      return `${label} ${formatReadingValue(reading.value, reading.unit)}${depth}`;
    })
    .join("; ");
}

/**
 * Medições que valem para uma amostra (é assim que elas vão para a planilha): o
 * parâmetro se aplica ao tipo da amostra e, quando os dois têm profundidade, ela é
 * a mesma. Medição sem profundidade (temperatura do ar) vale para todas.
 */
export function readingsForSample(
  readings: FieldReading[],
  catalog: FieldParameter[],
  sample: { sampleType: SampleTypeId; depthM: number | null },
): FieldReading[] {
  const sampleDepth = getSampleType(sample.sampleType).usesDepth ? sample.depthM : null;

  return sortReadings(
    readings.filter((reading) => {
      const parameter = findParameter(catalog, reading.parameterId);

      if (!parameter || !parameter.appliesTo.includes(sample.sampleType)) {
        return false;
      }

      return reading.depthM === null || sampleDepth === null || reading.depthM === sampleDepth;
    }),
    catalog,
  );
}

/** Equipamento de cada parâmetro nas medições dadas (para o aparelho lembrar). */
export function equipmentByParameter(
  readings: Array<Pick<ReadingInput, "parameterId" | "equipment">>,
): LastEquipmentByParameter {
  const result: LastEquipmentByParameter = {};

  for (const reading of readings) {
    if (reading.equipment.trim()) {
      result[reading.parameterId] = reading.equipment.trim();
    }
  }

  return result;
}

/** Parâmetro que chegou da nuvem ou do aparelho: devolve limpo, ou null. */
export function readFieldParameter(raw: unknown): FieldParameter | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !FIELD_PARAMETER_ID_PATTERN.test(raw.id)) {
    return null;
  }

  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const appliesTo = Array.isArray(raw.appliesTo) ? raw.appliesTo.filter(isSampleTypeId) : [];

  if (!label || !appliesTo.length) {
    return null;
  }

  return {
    id: raw.id,
    label,
    unit: typeof raw.unit === "string" ? raw.unit : "",
    min: typeof raw.min === "number" && Number.isFinite(raw.min) ? raw.min : null,
    max: typeof raw.max === "number" && Number.isFinite(raw.max) ? raw.max : null,
    appliesTo,
    usesDepth: raw.usesDepth !== false,
    biologColumn: typeof raw.biologColumn === "string" && raw.biologColumn ? raw.biologColumn : null,
    isBase: raw.isBase === true,
    active: raw.active !== false,
    sortOrder: typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder) ? raw.sortOrder : 1000,
  };
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
