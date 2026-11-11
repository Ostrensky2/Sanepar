/**
 * Planilha de exportação para o Biolog (seção 8 do padrão de coleta, em
 * docs/padrao-coleta-de-campo.md): uma linha por amostra na aba "Amostras" e uma
 * por medição na aba "Parâmetros".
 *
 * Aqui ficam só as regras: que linha sai de cada amostra e o que falta para o
 * Biolog aceitar. Nada fala com banco, tela ou arquivo.
 */

import { coordinateSourceLabels, parseCoordinateSource } from "@/lib/collection-capture";
import { parseCoordinate } from "@/lib/coordinates";
import { effectiveExecutionStatus, type FieldDiaryEntry } from "@/lib/field-diary";
import {
  findParameter,
  readingsForSample,
  sortCatalog,
  type FieldParameter,
  type FieldReading,
} from "@/lib/field-parameters";
import { sortSamples, type FieldSample } from "@/lib/field-samples";
import {
  getSampleType,
  parseSampleCode,
  sampleTypes,
  samplePointToken,
  type CollectionDefaults,
} from "@/lib/field-standard";
import { pointExecutionStatusLabels } from "@/lib/point-execution-status";

/** Cabeçalhos da aba "Amostras", na ordem. São os que o importador do Biolog reconhece. */
export const BIOLOG_SAMPLE_COLUMNS = [
  "Lab Destino",
  "Empresa",
  "Projeto (Short Name)",
  "Nome da Campanha",
  "Coletores",
  "Categoria da Amostra",
  "Origem da Amostra",
  "Objetivo",
  "Tipo de Conservação",
  "Código de Campo",
  "Ponto de Coleta",
  "Data da Coleta",
  "Hora da Coleta",
  "Latitude",
  "Longitude",
  "Profundidade (m)",
  "Volume Filtrado (mL)",
  "Especificação",
  "Temp Ar (°C)",
  "Temp Água (°C)",
  "pH",
  "Salinidade (ups)",
  "Oxigênio Dissolvido",
  "Transparência",
  "Turbidez",
  "Local Armazenamento",
  "Posição",
  "Observações",
] as const;

/** Cabeçalhos da aba "Parâmetros": formato longo, uma linha por medição de cada amostra. */
export const BIOLOG_READING_COLUMNS = [
  "Código de Campo",
  "Parâmetro",
  "Valor",
  "Unidade",
  "Profundidade (m)",
  "Data/Hora da Medição",
  "Equipamento / Método",
] as const;

export const BIOLOG_CATALOG_COLUMNS = [
  "Parâmetro",
  "Unidade",
  "Mínimo esperado",
  "Máximo esperado",
  "Medido em amostras de",
  "Coluna fixa na aba Amostras",
] as const;

export type BiologSampleColumn = (typeof BIOLOG_SAMPLE_COLUMNS)[number];
export type BiologReadingColumn = (typeof BIOLOG_READING_COLUMNS)[number];
export type BiologCell = string | number | null;

export type BiologExportIssueKind =
  | "missing_time"
  | "missing_coordinates"
  | "missing_point"
  | "planned_coordinate"
  | "code_out_of_date"
  | "exported_code_kept"
  | "reading_without_sample";

/** Algo que a pessoa deve conferir num registro antes de mandar a planilha. */
export type BiologExportIssue = {
  kind: BiologExportIssueKind;
  entryId: string;
  /** "SIA-0136 · 07/11/2026": como achar o registro na tela. */
  entryLabel: string;
  message: string;
  /** true = o Biolog recusa as amostras deste registro enquanto isso não for resolvido. */
  blocking: boolean;
};

export type BiologExport = {
  sampleRows: BiologCell[][];
  readingRows: BiologCell[][];
  catalogRows: BiologCell[][];
  issues: BiologExportIssue[];
  /** Amostras que entraram na planilha (para marcar como exportadas). */
  sampleIds: string[];
  counts: {
    /** Registros de campo com amostra, que entraram na planilha. */
    entries: number;
    /** Registros da seleção que não têm amostra e por isso ficaram de fora. */
    entriesWithoutSamples: number;
    samples: number;
    /** Amostras que já tinham saído numa planilha anterior. */
    samplesExportedBefore: number;
    /** Medições que entraram na planilha (cada uma conta uma vez). */
    readings: number;
    /** Linhas da aba "Parâmetros": a medição se repete em cada amostra a que se aplica. */
    readingRows: number;
    /** Amostras em registros com pendência que o Biolog recusa. */
    blockedSamples: number;
  };
};

export type BiologExportInput = {
  entries: FieldDiaryEntry[];
  samples: FieldSample[];
  readings: FieldReading[];
  catalog: FieldParameter[];
  /** Padrões de coleta que valem para o registro (os da campanha dele). */
  defaultsFor: (entry: FieldDiaryEntry) => CollectionDefaults;
};

const OBSERVATION_TEXT_MAX_LENGTH = 200;

export function buildBiologExport(input: BiologExportInput): BiologExport {
  const samplesByEntry = groupBy(input.samples, (sample) => sample.entryId);
  const readingsByEntry = groupBy(input.readings, (reading) => reading.entryId);
  const entries = [...input.entries].sort(compareEntries);
  const withSamples = entries.filter((entry) => samplesByEntry.has(entry.id));

  const sampleRows: BiologCell[][] = [];
  const readingRows: BiologCell[][] = [];
  const issues: BiologExportIssue[] = [];
  const sampleIds: string[] = [];
  const usedParameterIds = new Set<string>();
  const usedReadingIds = new Set<string>();
  let blockedSamples = 0;
  let samplesExportedBefore = 0;

  for (const entry of withSamples) {
    const defaults = input.defaultsFor(entry);
    const samples = sortSamples(samplesByEntry.get(entry.id) ?? []);
    const readings = readingsByEntry.get(entry.id) ?? [];
    const entryIssues = findEntryIssues(entry, samples, defaults);
    const entryReadingIds = new Set<string>();

    if (entryIssues.some((issue) => issue.blocking)) {
      blockedSamples += samples.length;
    }

    for (const sample of samples) {
      const sampleReadings = readingsForSample(readings, input.catalog, sample);

      for (const reading of sampleReadings) {
        entryReadingIds.add(reading.id);
        usedReadingIds.add(reading.id);
      }

      sampleRows.push(buildSampleRow(entry, sample, sampleReadings, input.catalog, defaults));
      sampleIds.push(sample.id);
      samplesExportedBefore += sample.exportedAt ? 1 : 0;

      for (const reading of sampleReadings) {
        usedParameterIds.add(reading.parameterId);
        readingRows.push([
          sample.code,
          findParameter(input.catalog, reading.parameterId)?.label ?? reading.parameterId,
          reading.value,
          reading.unit,
          reading.depthM,
          [formatDate(entry.entryDate), reading.measuredTime].filter(Boolean).join(" "),
          reading.equipment,
        ]);
      }
    }

    // Medição que não vale para nenhuma amostra do registro (outra profundidade, ou
    // parâmetro de outro tipo de amostra) não tem linha para ir.
    const left = readings.length - entryReadingIds.size;

    if (left > 0) {
      entryIssues.push({
        kind: "reading_without_sample",
        entryId: entry.id,
        entryLabel: entryLabelOf(entry),
        message:
          left === 1
            ? "1 medição fica de fora, porque nenhuma amostra do registro é do tipo e da profundidade dela."
            : `${left} medições ficam de fora, porque nenhuma amostra do registro é do tipo e da profundidade delas.`,
        blocking: false,
      });
    }

    issues.push(...entryIssues);
  }

  return {
    sampleRows,
    readingRows,
    catalogRows: buildCatalogRows(input.catalog, usedParameterIds),
    issues,
    sampleIds,
    counts: {
      entries: withSamples.length,
      entriesWithoutSamples: entries.length - withSamples.length,
      samples: sampleRows.length,
      samplesExportedBefore,
      readings: usedReadingIds.size,
      readingRows: readingRows.length,
      blockedSamples,
    },
  };
}

/** Valor de uma coluna numa linha da aba "Amostras" (para conferir e testar). */
export function sampleCell(row: BiologCell[], column: BiologSampleColumn): BiologCell {
  return row[BIOLOG_SAMPLE_COLUMNS.indexOf(column)] ?? null;
}

/** "yvae-biolog-4a-campanha-2026-11-11.xlsx". */
export function biologExportFileName(campaignLabel: string, today: Date) {
  const slug = campaignLabel
    // NFKD também desfaz o "ª" e o "º" ("4ª" vira "4a").
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");

  return `yvae-biolog-${slug || "campanha"}-${date}.xlsx`;
}

// ---------------------------------------------------------------------------

function buildSampleRow(
  entry: FieldDiaryEntry,
  sample: FieldSample,
  sampleReadings: FieldReading[],
  catalog: FieldParameter[],
  defaults: CollectionDefaults,
): BiologCell[] {
  const type = getSampleType(sample.sampleType);
  const latitude = parseCoordinate(entry.latitude, "latitude");
  const longitude = parseCoordinate(entry.longitude, "longitude");
  const hasCoordinates = latitude.status === "valid" && longitude.status === "valid";
  const isMillilitres = sample.quantityUnit === "mL";
  // Quantidade que não é em mL (massa de solo, litros de ar) vai junto da especificação.
  const quantityText =
    sample.quantity !== null && !isMillilitres ? `${decimal(sample.quantity)} ${sample.quantityUnit}`.trim() : "";

  const cells: Record<BiologSampleColumn, BiologCell> = {
    "Lab Destino": defaults.destinationLab,
    Empresa: defaults.company,
    "Projeto (Short Name)": defaults.projectShortName,
    "Nome da Campanha": entry.campaignName,
    Coletores: collectorsOf(entry),
    "Categoria da Amostra": type.exportValue,
    // Para água, a matriz da campanha; para os outros tipos, o próprio tipo.
    "Origem da Amostra": sample.sampleType === "water" ? defaults.waterMatrix : type.exportValue,
    Objetivo: defaults.objective,
    "Tipo de Conservação": sample.conservation,
    "Código de Campo": sample.code,
    "Ponto de Coleta": pointOf(entry, sample),
    "Data da Coleta": formatDate(entry.entryDate),
    "Hora da Coleta": formatTime(entry.collectionTime),
    Latitude: hasCoordinates ? latitude.value : null,
    Longitude: hasCoordinates ? longitude.value : null,
    "Profundidade (m)": type.usesDepth ? sample.depthM : null,
    "Volume Filtrado (mL)": isMillilitres ? sample.quantity : null,
    Especificação: [quantityText, sample.specification].filter(Boolean).join("; "),
    "Temp Ar (°C)": null,
    "Temp Água (°C)": null,
    pH: null,
    "Salinidade (ups)": null,
    "Oxigênio Dissolvido": null,
    Transparência: null,
    Turbidez: null,
    "Local Armazenamento": sample.packaging,
    Posição: sample.boxPosition,
    Observações: observationsOf(entry),
  };

  // Os parâmetros que o Biolog já conhece também vão nas colunas fixas. Havendo mais
  // de uma medição que vale para a amostra, fica a mais rasa (a lista vem ordenada).
  for (const reading of sampleReadings) {
    const column = findParameter(catalog, reading.parameterId)?.biologColumn as BiologSampleColumn | null | undefined;

    if (column && BIOLOG_SAMPLE_COLUMNS.includes(column) && cells[column] === null) {
      cells[column] = reading.value;
    }
  }

  return BIOLOG_SAMPLE_COLUMNS.map((column) => cells[column]);
}

function findEntryIssues(
  entry: FieldDiaryEntry,
  samples: FieldSample[],
  defaults: CollectionDefaults,
): BiologExportIssue[] {
  const issues: BiologExportIssue[] = [];
  const entryLabel = entryLabelOf(entry);
  const add = (kind: BiologExportIssueKind, message: string, blocking: boolean) =>
    issues.push({ kind, entryId: entry.id, entryLabel, message, blocking });

  if (!pointOf(entry, samples[0])) {
    add("missing_point", "Sem ponto de coleta (SIA).", true);
  }

  if (!formatTime(entry.collectionTime)) {
    add("missing_time", "Sem hora da coleta.", true);
  }

  const latitude = parseCoordinate(entry.latitude, "latitude");
  const longitude = parseCoordinate(entry.longitude, "longitude");

  if (latitude.status !== "valid" || longitude.status !== "valid") {
    add("missing_coordinates", "Sem latitude e longitude.", true);
  } else if (parseCoordinateSource(entry.coordinateSource) === "planned") {
    add("planned_coordinate", "A coordenada é a planejada do ponto, e não a medida no local.", false);
  }

  // O código gravado segue a data e o ponto do registro. Se o registro mudou depois
  // e as amostras não foram salvas de novo, a etiqueta ficou com o código antigo.
  const expectedPoint = entry.sia ? safePointToken(entry.sia) : "";
  const differing = samples.filter((sample) => {
    const parts = parseSampleCode(sample.code);

    return (
      !parts ||
      parts.date !== String(entry.entryDate ?? "").slice(0, 10) ||
      (expectedPoint !== "" && parts.point !== expectedPoint) ||
      parts.projectCode !== defaults.projectCode
    );
  });
  const outdated = differing.filter((sample) => !sample.exportedAt);
  const kept = differing.filter((sample) => sample.exportedAt);

  if (outdated.length) {
    add(
      "code_out_of_date",
      outdated.length === 1
        ? `O código ${outdated[0].code} não confere com a data e o ponto do registro. Abra o registro e salve de novo.`
        : `${outdated.length} códigos de amostra não conferem com a data e o ponto do registro. Abra o registro e salve de novo.`,
      false,
    );
  }

  // Amostra já exportada fica com o código que foi para o Biolog, mesmo que a data
  // ou o ponto do registro tenham sido corrigidos depois.
  if (kept.length) {
    add(
      "exported_code_kept",
      kept.length === 1
        ? `O código ${kept[0].code} já tinha sido exportado e continua o mesmo, embora a data ou o ponto do registro tenham mudado.`
        : `${kept.length} códigos já tinham sido exportados e continuam os mesmos, embora a data ou o ponto do registro tenham mudado.`,
      false,
    );
  }

  return issues;
}

/** "SIA-0136 · 07/11/2026": como a pessoa acha o registro na tela. */
function entryLabelOf(entry: FieldDiaryEntry) {
  return [entry.sia || entry.locationName || "Registro sem ponto", formatDate(entry.entryDate)].filter(Boolean).join(" · ");
}

function buildCatalogRows(catalog: FieldParameter[], usedParameterIds: Set<string>): BiologCell[][] {
  // Os ativos, mais os desativados que têm medição nesta planilha.
  return sortCatalog(catalog)
    .filter((parameter) => parameter.active || usedParameterIds.has(parameter.id))
    .map((parameter) => [
      parameter.label,
      parameter.unit,
      parameter.min,
      parameter.max,
      sampleTypes
        .filter((type) => parameter.appliesTo.includes(type.id))
        .map((type) => type.label)
        .join(", "),
      parameter.biologColumn ?? "",
    ]);
}

/** Ponto como está no código da etiqueta ("0136"); sem SIA no registro, o do código gravado. */
function pointOf(entry: FieldDiaryEntry, sample: FieldSample | undefined) {
  return (entry.sia ? safePointToken(entry.sia) : "") || parseSampleCode(sample?.code)?.point || "";
}

function safePointToken(point: string) {
  try {
    return samplePointToken(point);
  } catch {
    return "";
  }
}

function collectorsOf(entry: FieldDiaryEntry) {
  const members = (entry.fieldTeamMembers ?? []).map((member) => member.trim()).filter(Boolean);

  return members.length ? members.join("; ") : (entry.fieldTeamName || entry.createdByName || "").trim();
}

function observationsOf(entry: FieldDiaryEntry) {
  const status = effectiveExecutionStatus(entry);
  const source = parseCoordinateSource(entry.coordinateSource);
  const occurrence = entry.hasOccurrence
    ? [entry.occurrenceType, entry.occurrenceDescription].map((text) => (text ?? "").trim()).filter(Boolean).join(" - ")
    : "";

  return [
    entry.municipality ? `Município: ${entry.municipality}` : "",
    entry.locationName ? `Local: ${entry.locationName}` : "",
    `Situação: ${pointExecutionStatusLabels[status]}`,
    status === "relocated" && entry.relocationReason ? `Motivo da realocação: ${shorten(entry.relocationReason)}` : "",
    source ? `Coordenada: ${coordinateSourceLabels[source]}` : "",
    entry.hasOccurrence ? `Ocorrência: ${shorten(occurrence) || "sim"}` : "",
    `Yva'e: ${entry.id}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function shorten(text: string) {
  const clean = text.trim().replace(/\s+/g, " ");

  return clean.length > OBSERVATION_TEXT_MAX_LENGTH ? `${clean.slice(0, OBSERVATION_TEXT_MAX_LENGTH - 1)}…` : clean;
}

/** AAAA-MM-DD vira DD/MM/AAAA. */
function formatDate(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));

  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** "9:05", "09:05:00" e "09:05" viram "09:05". O que não é hora vira vazio. */
function formatTime(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());

  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return "";
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function decimal(value: number) {
  return String(value).replace(".", ",");
}

function compareEntries(a: FieldDiaryEntry, b: FieldDiaryEntry) {
  return (
    a.campaignName.localeCompare(b.campaignName, "pt-BR", { numeric: true }) ||
    String(a.entryDate).localeCompare(String(b.entryDate)) ||
    String(a.collectionTime ?? "").localeCompare(String(b.collectionTime ?? "")) ||
    String(a.sia ?? "").localeCompare(String(b.sia ?? ""), "pt-BR", { numeric: true }) ||
    a.id.localeCompare(b.id)
  );
}

function groupBy<Item>(items: Item[], keyOf: (item: Item) => string) {
  const groups = new Map<string, Item[]>();

  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Resumo para a pessoa conferir antes de gerar o arquivo
// ---------------------------------------------------------------------------

/** O que vai na planilha, em frases curtas ("36 amostras de 12 registros de campo…"). */
export function describeBiologExport(counts: BiologExport["counts"]): string[] {
  if (!counts.samples) {
    return [];
  }

  const lines = [
    `${plural(counts.samples, "amostra", "amostras")} de ${plural(counts.entries, "registro de campo", "registros de campo")}, ` +
      (counts.readings
        ? `com ${plural(counts.readings, "medição de parâmetro", "medições de parâmetros")}.`
        : "sem medições de parâmetros."),
  ];

  if (counts.entriesWithoutSamples) {
    lines.push(
      counts.entriesWithoutSamples === 1
        ? "1 registro de campo sem amostra fica de fora."
        : `${counts.entriesWithoutSamples} registros de campo sem amostra ficam de fora.`,
    );
  }

  if (counts.samplesExportedBefore) {
    const before = counts.samplesExportedBefore;
    const all = before === counts.samples;
    const which = before === 1 ? (all ? "Ela já tinha saído" : "1 já tinha saído") : `${all ? "Todas" : before} já tinham saído`;

    lines.push(
      `${which} numa planilha anterior e ${before === 1 ? "vai" : "vão"} de novo nesta: o Biolog ignora a amostra que já importou.`,
    );
  }

  return lines;
}

export type BiologExportIssueGroup = {
  entryId: string;
  entryLabel: string;
  messages: string[];
};

/** Pendências juntadas por registro, separando as que o Biolog recusa das que são só para conferir. */
export function groupBiologExportIssues(issues: BiologExportIssue[]): {
  blocking: BiologExportIssueGroup[];
  toCheck: BiologExportIssueGroup[];
} {
  const collect = (list: BiologExportIssue[]) => {
    const groups = new Map<string, BiologExportIssueGroup>();

    for (const issue of list) {
      const group = groups.get(issue.entryId) ?? { entryId: issue.entryId, entryLabel: issue.entryLabel, messages: [] };

      group.messages.push(issue.message);
      groups.set(issue.entryId, group);
    }

    return [...groups.values()];
  };

  return {
    blocking: collect(issues.filter((issue) => issue.blocking)),
    toCheck: collect(issues.filter((issue) => !issue.blocking)),
  };
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? one : many}`;
}
