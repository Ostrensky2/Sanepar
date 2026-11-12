/**
 * Padrão comum de coleta de campo (versão 1).
 *
 * É a regra que o Yva'e segue para identificar amostras e que os outros aplicativos
 * de projeto vão adotar igual: tipos de amostra, código da amostra, catálogo de
 * parâmetros medidos em campo e padrões de coleta do projeto. O texto para pessoas
 * está em docs/padrao-coleta-de-campo.md; este arquivo é a mesma regra em código.
 *
 * Nada aqui fala com banco ou tela: são só as definições e as funções puras.
 */

export const FIELD_STANDARD_VERSION = "1";

// ---------------------------------------------------------------------------
// Projeto
// ---------------------------------------------------------------------------

/** Identificação deste projeto no padrão. O código tem sempre 3 letras. */
export const projectFieldIdentity = {
  projectCode: "YVA",
  projectShortName: "YVAE",
  company: "SANEPAR",
} as const;

// ---------------------------------------------------------------------------
// Tipos de amostra
// ---------------------------------------------------------------------------

export const sampleTypes = [
  { id: "water", label: "Água", code: "AG", exportValue: "AGUA", quantityLabel: "Volume", quantityUnit: "mL", usesDepth: true },
  { id: "soil", label: "Solo", code: "SO", exportValue: "SOLO", quantityLabel: "Massa", quantityUnit: "g", usesDepth: false },
  { id: "air", label: "Ar", code: "AR", exportValue: "AR", quantityLabel: "Volume", quantityUnit: "L", usesDepth: false },
  { id: "tissue", label: "Tecido", code: "TE", exportValue: "TECIDO", quantityLabel: "Massa", quantityUnit: "g", usesDepth: false },
  { id: "plankton", label: "Plâncton", code: "PL", exportValue: "PLANCTON", quantityLabel: "Volume", quantityUnit: "mL", usesDepth: true },
] as const;

export type SampleType = (typeof sampleTypes)[number];
export type SampleTypeId = SampleType["id"];
export type SampleTypeCode = SampleType["code"];

export const sampleTypeIds = sampleTypes.map((type) => type.id) as SampleTypeId[];

export function getSampleType(id: SampleTypeId): SampleType {
  return sampleTypes.find((type) => type.id === id) ?? sampleTypes[0];
}

export function isSampleTypeId(value: unknown): value is SampleTypeId {
  return sampleTypeIds.includes(value as SampleTypeId);
}

// ---------------------------------------------------------------------------
// Código da amostra: {PROJETO}-{PONTO}-{DDMMAA}-{HHMM}-{TIPO}{SEQUÊNCIA}
// Exemplo: YVA-0136-071126-0905-AG1 (24 caracteres). Decisão de 12/11/2026:
// projeto, ponto, dia e hora da coleta, e as réplicas se distinguem pelo número.
//
// Antes (até a versão 2.0.6) era {PROJETO}-{DDMMAA}-{PONTO}-{TIPO}{SEQUÊNCIA},
// ex.: YVA-071126-0136-AG1. Amostras gravadas nesse formato ficam com o código
// que têm: ele pode já estar numa etiqueta.
// ---------------------------------------------------------------------------

export const SAMPLE_CODE_POINT_MAX_LENGTH = 8;
export const SAMPLE_CODE_MAX_SEQUENCE = 999;

const SAMPLE_TYPE_CODES = sampleTypes.map((type) => type.code).join("|");

const SAMPLE_CODE_PATTERN = new RegExp(
  `^([A-Z]{3})-([A-Z0-9]{1,${SAMPLE_CODE_POINT_MAX_LENGTH}})-(\\d{2})(\\d{2})(\\d{2})-(\\d{2})(\\d{2})-(${SAMPLE_TYPE_CODES})(\\d{1,3})$`,
);

const LEGACY_SAMPLE_CODE_PATTERN = new RegExp(
  `^([A-Z]{3})-(\\d{2})(\\d{2})(\\d{2})-([A-Z0-9]{1,${SAMPLE_CODE_POINT_MAX_LENGTH}})-(${SAMPLE_TYPE_CODES})(\\d{1,3})$`,
);

export class FieldStandardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldStandardError";
  }
}

export type SampleCodeInput = {
  /** Código do projeto, 3 letras (ex.: YVA). */
  projectCode: string;
  /** Data da coleta em AAAA-MM-DD. */
  date: string;
  /** Hora da coleta no ponto, "HH:MM" (a do registro de campo). */
  time: string;
  /** Ponto de coleta (ex.: SIA "0136", "SIA-136", "P01"). */
  point: string;
  sampleType: SampleTypeId;
  /** Número da amostra daquele tipo, naquele ponto, dia e hora (1, 2, 3…). */
  sequence: number;
};

export type SampleCodeParts = {
  projectCode: string;
  /** AAAA-MM-DD (o século é sempre 20xx). */
  date: string;
  /** "HH:MM"; null nos códigos do formato anterior, que não tinham hora. */
  time: string | null;
  point: string;
  sampleType: SampleTypeId;
  sequence: number;
};

export function buildSampleCode(input: SampleCodeInput): string {
  const projectCode = normalizeProjectCode(input.projectCode);
  const point = samplePointToken(input.point);
  const date = sampleCodeDate(input.date);
  const time = sampleCodeTime(input.time);
  const type = sampleTypes.find((item) => item.id === input.sampleType);

  if (!type) {
    throw new FieldStandardError("Tipo de amostra desconhecido.");
  }

  if (!Number.isInteger(input.sequence) || input.sequence < 1 || input.sequence > SAMPLE_CODE_MAX_SEQUENCE) {
    throw new FieldStandardError(
      `A sequência da amostra deve ser um número inteiro de 1 a ${SAMPLE_CODE_MAX_SEQUENCE}.`,
    );
  }

  return `${projectCode}-${point}-${date}-${time}-${type.code}${input.sequence}`;
}

/**
 * Lê um código no padrão (o atual ou o anterior, sem hora). Devolve null quando o
 * texto não segue nenhum dos dois.
 */
export function parseSampleCode(code: unknown): SampleCodeParts | null {
  const text = String(code ?? "").trim().toUpperCase();
  const current = SAMPLE_CODE_PATTERN.exec(text);
  const legacy = current ? null : LEGACY_SAMPLE_CODE_PATTERN.exec(text);

  if (!current && !legacy) {
    return null;
  }

  const [projectCode, point, day, month, year, hour, minute, typeCode, sequence] = current
    ? current.slice(1)
    : [legacy![1], legacy![5], legacy![2], legacy![3], legacy![4], null, null, legacy![6], legacy![7]];
  const date = `20${year}-${month}-${day}`;
  const type = sampleTypes.find((item) => item.code === typeCode);
  const time = hour === null || minute === null ? null : `${hour}:${minute}`;

  if (!type || !isRealDate(date) || Number(sequence) < 1 || (time !== null && !isRealTime(time))) {
    return null;
  }

  return { projectCode, date, time, point, sampleType: type.id, sequence: Number(sequence) };
}

/** Código no formato anterior (sem hora), que fica como foi gravado. */
export function isLegacySampleCode(code: unknown) {
  const parts = parseSampleCode(code);
  return Boolean(parts && parts.time === null);
}

/**
 * Próxima sequência livre para o mesmo projeto, data, ponto e tipo, olhando os
 * códigos que já existem. Códigos fora do padrão ou de outro ponto são ignorados.
 */
export function nextSampleSequence(
  existingCodes: Iterable<unknown>,
  target: Omit<SampleCodeInput, "sequence">,
): number {
  const projectCode = normalizeProjectCode(target.projectCode);
  const point = samplePointToken(target.point);
  const time = sampleCodeTime(target.time);
  let highest = 0;

  for (const code of existingCodes) {
    const parts = parseSampleCode(code);

    if (
      parts &&
      parts.projectCode === projectCode &&
      parts.date === target.date &&
      parts.time?.replace(":", "") === time &&
      parts.point === point &&
      parts.sampleType === target.sampleType
    ) {
      highest = Math.max(highest, parts.sequence);
    }
  }

  return highest + 1;
}

export function normalizeProjectCode(value: unknown): string {
  const code = stripAccents(String(value ?? "")).trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(code)) {
    throw new FieldStandardError("O código do projeto deve ter exatamente 3 letras (ex.: YVA).");
  }

  return code;
}

/**
 * Ponto de coleta como aparece no código. Um SIA numérico fica com 4 dígitos
 * ("136", "SIA 136" e "SIA-0136" viram "0136"); outros pontos ficam só com letras
 * e números, em maiúsculas ("P-01" vira "P01").
 */
export function samplePointToken(value: unknown): string {
  const text = stripAccents(String(value ?? "")).toUpperCase();
  const withoutSiaPrefix = text.replace(/^\s*SIA(?![A-Z])/, "");
  const token = withoutSiaPrefix.replace(/[^A-Z0-9]/g, "");

  if (!token) {
    throw new FieldStandardError("Informe o ponto de coleta (SIA) para gerar o código da amostra.");
  }

  const normalized = /^\d+$/.test(token) ? token.replace(/^0+(?=\d)/, "").padStart(4, "0") : token;

  if (normalized.length > SAMPLE_CODE_POINT_MAX_LENGTH) {
    throw new FieldStandardError(
      `O ponto de coleta deve caber em ${SAMPLE_CODE_POINT_MAX_LENGTH} letras ou números no código da amostra.`,
    );
  }

  return normalized;
}

function sampleCodeDate(value: unknown): string {
  const text = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match || !isRealDate(text)) {
    throw new FieldStandardError("Informe a data da coleta para gerar o código da amostra.");
  }

  const [, year, month, day] = match;

  if (year.slice(0, 2) !== "20") {
    throw new FieldStandardError("A data da coleta deve estar entre 2000 e 2099.");
  }

  return `${day}${month}${year.slice(2)}`;
}

/** "09:05" (ou "09:05:00") vira "0905". */
function sampleCodeTime(value: unknown): string {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? "").trim());

  if (!match || !isRealTime(`${match[1]}:${match[2]}`)) {
    throw new FieldStandardError("Informe a hora da coleta para gerar o código da amostra.");
  }

  return `${match[1]}${match[2]}`;
}

function isRealTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isRealDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ---------------------------------------------------------------------------
// Catálogo inicial de parâmetros de campo
// ---------------------------------------------------------------------------

export type FieldParameterDefinition = {
  id: string;
  label: string;
  unit: string;
  /** Faixa plausível: fora dela o app avisa, sem impedir o registro. */
  min: number | null;
  max: number | null;
  /** Tipos de amostra em que o parâmetro costuma ser medido. */
  appliesTo: SampleTypeId[];
  /** false = não é medido numa profundidade (ex.: temperatura do ar, disco de Secchi). */
  usesDepth: boolean;
  /** Coluna fixa que o Biolog já importa, quando existe. */
  biologColumn: string | null;
};

/** Identificador de um parâmetro no catálogo: minúsculas, números e sublinhado. */
export const FIELD_PARAMETER_ID_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
export const FIELD_PARAMETER_LABEL_MAX_LENGTH = 60;
export const FIELD_PARAMETER_UNIT_MAX_LENGTH = 20;

export const baseFieldParameters: FieldParameterDefinition[] = [
  { id: "air_temperature", label: "Temperatura do ar", unit: "°C", min: -20, max: 60, appliesTo: sampleTypeIds, usesDepth: false, biologColumn: "Temp Ar (°C)" },
  { id: "water_temperature", label: "Temperatura da água", unit: "°C", min: -2, max: 40, appliesTo: ["water", "plankton"], usesDepth: true, biologColumn: "Temp Água (°C)" },
  { id: "ph", label: "pH", unit: "", min: 0, max: 14, appliesTo: ["water", "plankton", "soil"], usesDepth: true, biologColumn: "pH" },
  { id: "conductivity", label: "Condutividade", unit: "µS/cm", min: 0, max: 100000, appliesTo: ["water", "plankton"], usesDepth: true, biologColumn: null },
  { id: "salinity", label: "Salinidade", unit: "ups", min: 0, max: 50, appliesTo: ["water", "plankton"], usesDepth: true, biologColumn: "Salinidade (ups)" },
  { id: "dissolved_oxygen", label: "Oxigênio dissolvido", unit: "mg/L", min: 0, max: 20, appliesTo: ["water", "plankton"], usesDepth: true, biologColumn: "Oxigênio Dissolvido" },
  { id: "secchi_transparency", label: "Transparência (Secchi)", unit: "m", min: 0, max: 50, appliesTo: ["water", "plankton"], usesDepth: false, biologColumn: "Transparência" },
  { id: "turbidity", label: "Turbidez", unit: "NTU", min: 0, max: 4000, appliesTo: ["water", "plankton"], usesDepth: true, biologColumn: "Turbidez" },
];

// ---------------------------------------------------------------------------
// Padrões de coleta (o que não precisa ser digitado em cada ponto)
// ---------------------------------------------------------------------------

export const destinationLabs = ["GA", "LAPOA", "LHM"] as const;
export type DestinationLab = (typeof destinationLabs)[number];

export const sampleObjectives = [
  { value: "MONITORAMENTO", label: "Monitoramento" },
  { value: "EXPERIMENTO_CAMPO", label: "Experimento de campo" },
  { value: "EXPERIMENTO_LAB", label: "Experimento de laboratório" },
  { value: "CAMPANHA_AMOSTRAL", label: "Campanha amostral" },
  { value: "SERVICO_ANALISE", label: "Serviço de análise" },
  { value: "CONTROLE", label: "Controle" },
  { value: "OUTRO", label: "Outro" },
] as const;
export type SampleObjective = (typeof sampleObjectives)[number]["value"];

export const waterMatrices = [
  { value: "AGUA_DOCE", label: "Água doce" },
  { value: "AGUA_ESTUARINA", label: "Água estuarina" },
  { value: "AGUA_MARINHA", label: "Água marinha" },
  { value: "AGUA_CLORADA", label: "Água clorada" },
  { value: "AGUA_ULTRAPURA", label: "Água ultrapura" },
] as const;
export type WaterMatrix = (typeof waterMatrices)[number]["value"];

export const conservationTypes = [
  { value: "FILTRO_CONGELADO", label: "Filtro congelado" },
  { value: "FILTRO_EM_ALCOOL_COM_REFRIGERACAO", label: "Filtro em álcool, com refrigeração" },
  { value: "FILTRO_EM_ALCOOL_SEM_REFRIGERACAO", label: "Filtro em álcool, sem refrigeração" },
  { value: "AMOSTRA_BRUTA_RESFRIADA", label: "Amostra bruta resfriada" },
  { value: "AMOSTRA_BRUTA_CONGELADA", label: "Amostra bruta congelada" },
  { value: "OUTRO", label: "Outro" },
] as const;
export type ConservationType = (typeof conservationTypes)[number]["value"];

/**
 * Sugestões do campo "Preservante" de cada amostra. A equipe pode escrever outro:
 * o campo aceita qualquer preservante (retorno de campo de 12/11/2026).
 */
export const preservativeSuggestions = ["Longmire", "Álcool", "Sílica", "RNAlater", "Sem preservante"] as const;

export const MAX_DEFAULT_REPLICAS = 20;
export const COLLECTION_TEXT_MAX_LENGTH = 120;
/** Quantos parâmetros o padrão da campanha pode propor em cada ponto. */
export const MAX_DEFAULT_FIELD_PARAMETERS = 30;

export type SampleTypeDefaults = {
  /** Quantas amostras deste tipo o app propõe em cada ponto (0 = não propõe). */
  replicas: number;
  conservation: ConservationType;
  /** Acondicionamento (ex.: Isopor com gelo). */
  packaging: string;
  /** Preservante (ex.: Longmire, álcool, sílica). Texto livre; vazio = não informado. */
  preservative: string;
  /** Volume ou massa padrão, na unidade do tipo. */
  quantity: number | null;
  /** Profundidade padrão em metros (0 = superfície). */
  depthM: number | null;
  /** Especificação padrão (ex.: filtro 0,45 µm). */
  specification: string;
};

export type CollectionDefaults = {
  projectCode: string;
  projectShortName: string;
  company: string;
  destinationLab: DestinationLab;
  objective: SampleObjective;
  waterMatrix: WaterMatrix;
  sampleTypes: Record<SampleTypeId, SampleTypeDefaults>;
  /**
   * Parâmetros medidos em todo ponto (identificadores do catálogo), na ordem em que
   * aparecem no registro. O app abre uma linha para cada um ao iniciar a coleta.
   */
  fieldParameterIds: string[];
};

export function buildProjectCollectionDefaults(): CollectionDefaults {
  const empty: SampleTypeDefaults = {
    replicas: 0,
    conservation: "OUTRO",
    packaging: "",
    preservative: "",
    quantity: null,
    depthM: null,
    specification: "",
  };

  return {
    ...projectFieldIdentity,
    destinationLab: "GA",
    objective: "MONITORAMENTO",
    waterMatrix: "AGUA_DOCE",
    sampleTypes: {
      // Sanepar: 5 réplicas de água e 1 de plâncton por ponto (retorno de campo de 12/11/2026).
      // É só a sugestão: a equipe muda a quantidade em cada ponto e no padrão da campanha.
      water: {
        replicas: 5,
        conservation: "FILTRO_CONGELADO",
        packaging: "Isopor com gelo",
        preservative: "",
        quantity: 1000,
        depthM: 0,
        specification: "eDNA",
      },
      soil: { ...empty },
      air: { ...empty },
      tissue: { ...empty },
      plankton: {
        replicas: 1,
        conservation: "OUTRO",
        packaging: "Isopor com gelo",
        preservative: "",
        quantity: null,
        depthM: 0,
        specification: "",
      },
    },
    fieldParameterIds: [],
  };
}

/**
 * Lê padrões gravados (JSON da campanha) e devolve um objeto completo e válido.
 * O que faltar ou estiver fora da lista volta ao padrão do projeto.
 */
export function normalizeCollectionDefaults(value: unknown): CollectionDefaults {
  const fallback = buildProjectCollectionDefaults();

  if (!isRecord(value)) {
    return fallback;
  }

  const savedTypes = isRecord(value.sampleTypes) ? value.sampleTypes : {};

  return {
    projectCode: safeProjectCode(value.projectCode, fallback.projectCode),
    projectShortName: cleanText(value.projectShortName, 20).toUpperCase() || fallback.projectShortName,
    company: cleanText(value.company, COLLECTION_TEXT_MAX_LENGTH) || fallback.company,
    destinationLab: pickOption(destinationLabs, value.destinationLab, fallback.destinationLab),
    objective: pickOption(sampleObjectives.map((item) => item.value), value.objective, fallback.objective),
    waterMatrix: pickOption(waterMatrices.map((item) => item.value), value.waterMatrix, fallback.waterMatrix),
    sampleTypes: Object.fromEntries(
      sampleTypeIds.map((id) => [id, normalizeSampleTypeDefaults(savedTypes[id], fallback.sampleTypes[id])]),
    ) as Record<SampleTypeId, SampleTypeDefaults>,
    fieldParameterIds:
      "fieldParameterIds" in value
        ? normalizeFieldParameterIds(value.fieldParameterIds)
        : [...fallback.fieldParameterIds],
  };
}

/** Lista de identificadores de parâmetro sem repetição, sem lixo e com tamanho limitado. */
export function normalizeFieldParameterIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids: string[] = [];

  for (const item of value) {
    if (typeof item === "string" && FIELD_PARAMETER_ID_PATTERN.test(item) && !ids.includes(item)) {
      ids.push(item);
    }
  }

  return ids.slice(0, MAX_DEFAULT_FIELD_PARAMETERS);
}

function normalizeSampleTypeDefaults(value: unknown, fallback: SampleTypeDefaults): SampleTypeDefaults {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  const replicas = Number(value.replicas);

  return {
    replicas:
      Number.isInteger(replicas) && replicas >= 0 && replicas <= MAX_DEFAULT_REPLICAS
        ? replicas
        : fallback.replicas,
    conservation: pickOption(conservationTypes.map((item) => item.value), value.conservation, fallback.conservation),
    packaging: "packaging" in value ? cleanText(value.packaging, COLLECTION_TEXT_MAX_LENGTH) : fallback.packaging,
    preservative:
      "preservative" in value ? cleanText(value.preservative, COLLECTION_TEXT_MAX_LENGTH) : fallback.preservative,
    quantity: "quantity" in value ? nonNegativeNumber(value.quantity) : fallback.quantity,
    depthM: "depthM" in value ? nonNegativeNumber(value.depthM) : fallback.depthM,
    specification:
      "specification" in value ? cleanText(value.specification, COLLECTION_TEXT_MAX_LENGTH) : fallback.specification,
  };
}

/** Número digitado (aceita vírgula) como número não negativo, ou null se vazio/inválido. */
export function nonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeProjectCode(value: unknown, fallback: string) {
  try {
    return normalizeProjectCode(value);
  } catch {
    return fallback;
  }
}

function pickOption<Option extends string>(options: readonly Option[], value: unknown, fallback: Option): Option {
  return options.includes(value as Option) ? (value as Option) : fallback;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
