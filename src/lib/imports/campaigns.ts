import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";

type WorkbookBinary = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

export type Coordinate = {
  lat: number;
  lon: number;
};

export type CampaignMapPoint = {
  id: string;
  code: string;
  point: string;
  day: string;
  campaign: string;
  date: string;
  waterBody: string;
  municipality: string;
  original: Coordinate | null;
  effective: Coordinate | null;
  accessibility: string;
  waterAspect: string;
  weatherConditions: string;
  problems: string;
  samplesReplicasEdna?: string;
  zooplanktonId?: string;
  collectionTime?: string;
  createdByName?: string;
  activities?: string[];
  hasOccurrence?: boolean;
  occurrenceType?: string;
  occurrenceDescription?: string;
  requiresFollowUp?: string;
  followUpNotes?: string;
  dailySummary?: string;
  status?: string;
  driveUrl: string;
  dropboxUrl: string;
  photoUrl: string;
  photos?: Array<{
    id: string;
    url: string;
    caption?: string | null;
    bucket?: string | null;
    path?: string | null;
    fileName?: string | null;
    width?: number | null;
    height?: number | null;
    uploadedAt?: string | null;
  }>;
  photoWarnings?: string[];
};

export type CampaignWorkbookImport = {
  fileName: string;
  rowCount: number;
  points: CampaignMapPoint[];
  originalPointCount: number;
  effectivePointCount: number;
  missingFields: string[];
};

const REQUIRED_FIELD_ALIASES = {
  campaign: ["campanha"],
  code: ["cod sia", "codigo sia", "cód sia", "cód. sia"],
  point: ["ponto"],
  day: ["dia"],
  date: ["data"],
  waterBody: ["manancial corpo hidrico", "manancial corpo hídrico", "manancial"],
  municipality: ["municipio", "município"],
  originalLat: ["latitude original"],
  originalLon: ["longitude original"],
  effectiveLat: ["latitude efetiva"],
  effectiveLon: ["longitude efetiva"],
  accessibility: ["acessibilidade do ponto", "acessibilidade"],
  waterAspect: [
    "condicoes visuais da agua",
    "condições visuais da água",
    "aspecto da agua",
    "aspecto da água",
  ],
  weatherConditions: ["condicoes climaticas", "condições climaticas", "condições climáticas"],
  problems: ["problemas enfrentados", "problemas"],
  samplesReplicasEdna: ["amostras e replicas", "amostras e réplicas", "amostras"],
  zooplanktonId: ["id zooplancton", "id zooplâncton", "id zooplacton"],
  collectionTime: ["hora de coleta", "horario de coleta", "horário de coleta"],
  createdByName: ["responsavel", "responsável"],
  activities: ["atividades realizadas", "atividades"],
  hasOccurrence: ["houve ocorrencia", "houve ocorrência"],
  occurrenceType: ["tipo de ocorrencia", "tipo de ocorrência"],
  occurrenceDescription: ["descricao da ocorrencia", "descrição da ocorrência"],
  requiresFollowUp: ["exige acompanhamento"],
  followUpNotes: ["pendencia encaminhamento", "pendência encaminhamento", "pendencia", "pendência"],
  dailySummary: ["resumo do dia"],
  status: ["status"],
  driveUrl: ["drive", "google drive", "link drive"],
  dropboxUrl: ["dropbox", "link dropbox"],
  photoUrl: [
    "link foto representativa",
    "foto representativa",
    "link foto",
    "link de foto",
    "link fotos",
    "link de fotos",
    "fotos",
  ],
} satisfies Record<string, string[]>;

const FALLBACK_COLUMNS = {
  campaign: 1,
  code: 2,
  point: 3,
  day: 4,
  date: 5,
  waterBody: 6,
  municipality: 7,
  originalLat: 8,
  originalLon: 9,
  effectiveLat: 10,
  effectiveLon: 11,
  accessibility: 12,
  waterAspect: 13,
  weatherConditions: 14,
  problems: 15,
  samplesReplicasEdna: 16,
  zooplanktonId: 17,
  collectionTime: 18,
  createdByName: 19,
  activities: 20,
  hasOccurrence: 21,
  occurrenceType: 22,
  occurrenceDescription: 23,
  requiresFollowUp: 24,
  followUpNotes: 25,
  dailySummary: 26,
  status: 27,
  driveUrl: 28,
  dropboxUrl: 29,
  photoUrl: 29,
} satisfies Record<keyof typeof REQUIRED_FIELD_ALIASES, number>;

const paranaBounds = {
  minLat: -26.85,
  maxLat: -22.35,
  minLon: -54.9,
  maxLon: -47.95,
};

export async function parseCampaignWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<CampaignWorkbookImport> {
  const extension = fileName.toLowerCase().split(".").pop();

  if (extension !== "xlsx" && extension !== "xlsm") {
    throw new Error("A planilha Campanhas_ Planilha síntese.xlsx deve ser enviada em formato .xlsx.");
  }

  const workbook = new ExcelJS.Workbook();
  const binary = Buffer.from(buffer) as unknown as WorkbookBinary;
  await workbook.xlsx.load(binary);

  const worksheet = workbook.getWorksheet("Campanhas");

  if (!worksheet) {
    throw new Error("A planilha precisa conter a aba Campanhas.");
  }

  return parseCampaignWorksheet(worksheet, fileName);
}

export async function readCampaignWorkbookFromPath(filePath: string, fileName: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("Campanhas");

  if (!worksheet) {
    return null;
  }

  return parseCampaignWorksheet(worksheet, fileName);
}

function parseCampaignWorksheet(
  worksheet: ExcelJS.Worksheet,
  fileName: string,
): CampaignWorkbookImport {
  const columns = buildColumnMap(worksheet);
  const missingFields = Object.entries(columns)
    .filter(([, column]) => column === null)
    .map(([field]) => field);
  const points: CampaignMapPoint[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const code = readMappedCell(row, columns.code, FALLBACK_COLUMNS.code);

    if (!code) {
      continue;
    }

    const original = coordinateFromCells(
      row.getCell(columns.originalLat ?? FALLBACK_COLUMNS.originalLat).value,
      row.getCell(columns.originalLon ?? FALLBACK_COLUMNS.originalLon).value,
    );
    const effective = coordinateFromCells(
      row.getCell(columns.effectiveLat ?? FALLBACK_COLUMNS.effectiveLat).value,
      row.getCell(columns.effectiveLon ?? FALLBACK_COLUMNS.effectiveLon).value,
    );

    if (!original && !effective) {
      continue;
    }

    const campaign = readMappedCell(row, columns.campaign, FALLBACK_COLUMNS.campaign);
    const driveUrl = readMappedCell(row, columns.driveUrl, FALLBACK_COLUMNS.driveUrl);
    const dropboxUrl = readMappedCell(row, columns.dropboxUrl, FALLBACK_COLUMNS.dropboxUrl);
    const fieldPhotoUrl = readMappedCell(row, columns.photoUrl, FALLBACK_COLUMNS.photoUrl);
    const photoUrl = fieldPhotoUrl || dropboxUrl || driveUrl;
    const occurrenceText = readMappedCell(row, columns.hasOccurrence, FALLBACK_COLUMNS.hasOccurrence);

    points.push({
      id: `${campaign || "campanha"}-${code}-${rowNumber}`,
      code: `SIA-${code.padStart(4, "0")}`,
      point: readMappedCell(row, columns.point, FALLBACK_COLUMNS.point),
      day: readMappedCell(row, columns.day, FALLBACK_COLUMNS.day),
      campaign: campaign || "Campanha",
      date: formatDateCell(row.getCell(columns.date ?? FALLBACK_COLUMNS.date).value),
      waterBody:
        readMappedCell(row, columns.waterBody, FALLBACK_COLUMNS.waterBody) ||
        "Ponto de campanha",
      municipality:
        readMappedCell(row, columns.municipality, FALLBACK_COLUMNS.municipality) ||
        "Paraná",
      original,
      effective,
      accessibility:
        readMappedCell(row, columns.accessibility, FALLBACK_COLUMNS.accessibility) ||
        "Não informado",
      waterAspect:
        readMappedCell(row, columns.waterAspect, FALLBACK_COLUMNS.waterAspect) ||
        "Não informado",
      weatherConditions:
        readMappedCell(
          row,
          columns.weatherConditions,
          FALLBACK_COLUMNS.weatherConditions,
        ) || "Não informado",
      problems:
        readMappedCell(row, columns.problems, FALLBACK_COLUMNS.problems) ||
        "Não informado",
      samplesReplicasEdna: readMappedCell(
        row,
        columns.samplesReplicasEdna,
        FALLBACK_COLUMNS.samplesReplicasEdna,
      ),
      zooplanktonId: readMappedCell(row, columns.zooplanktonId, FALLBACK_COLUMNS.zooplanktonId),
      collectionTime: readMappedCell(row, columns.collectionTime, FALLBACK_COLUMNS.collectionTime),
      createdByName: readMappedCell(row, columns.createdByName, FALLBACK_COLUMNS.createdByName),
      activities: splitList(readMappedCell(row, columns.activities, FALLBACK_COLUMNS.activities)),
      hasOccurrence: /^sim$/i.test(occurrenceText.trim()),
      occurrenceType: readMappedCell(row, columns.occurrenceType, FALLBACK_COLUMNS.occurrenceType),
      occurrenceDescription: readMappedCell(
        row,
        columns.occurrenceDescription,
        FALLBACK_COLUMNS.occurrenceDescription,
      ),
      requiresFollowUp:
        readMappedCell(row, columns.requiresFollowUp, FALLBACK_COLUMNS.requiresFollowUp) || "Não",
      followUpNotes: readMappedCell(row, columns.followUpNotes, FALLBACK_COLUMNS.followUpNotes),
      dailySummary: readMappedCell(row, columns.dailySummary, FALLBACK_COLUMNS.dailySummary),
      status: readMappedCell(row, columns.status, FALLBACK_COLUMNS.status) || "Rascunho",
      driveUrl,
      dropboxUrl,
      photoUrl,
    });
  }

  return {
    fileName,
    rowCount: Math.max(worksheet.actualRowCount - 1, 0),
    points,
    originalPointCount: points.filter((point) => point.original).length,
    effectivePointCount: points.filter((point) => point.effective).length,
    missingFields,
  };
}

function splitList(value: string) {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildColumnMap(worksheet: ExcelJS.Worksheet) {
  const headers = new Map<string, number>();
  const values = worksheet.getRow(1).values;
  const cells = Array.isArray(values) ? values.slice(1) : [];

  cells.forEach((value, index) => {
    const normalized = normalizeHeader(normalizeCell(value));

    if (normalized) {
      headers.set(normalized, index + 1);
    }
  });

  return Object.fromEntries(
    Object.entries(REQUIRED_FIELD_ALIASES).map(([field, aliases]) => {
      const column =
        aliases
          .map((alias) => headers.get(normalizeHeader(alias)))
          .find((candidate) => candidate !== undefined) ?? null;

      return [field, column];
    }),
  ) as Record<keyof typeof REQUIRED_FIELD_ALIASES, number | null>;
}

function readMappedCell(
  row: ExcelJS.Row,
  column: number | null,
  fallbackColumn: number,
) {
  return normalizeCell(row.getCell(column ?? fallbackColumn).value);
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCell(value: ExcelJS.CellValue | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if ("hyperlink" in value && typeof value.hyperlink === "string") {
      return value.hyperlink.trim();
    }

    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((fragment) => fragment.text).join("").trim();
    }

    if ("result" in value && value.result !== undefined && value.result !== null) {
      return String(value.result).trim();
    }

    if ("formula" in value && typeof value.formula === "string") {
      return value.formula.trim();
    }
  }

  return String(value).trim();
}

function formatDateCell(value: ExcelJS.CellValue | undefined) {
  const normalized = normalizeCell(value);

  if (!normalized) {
    return "Data não informada";
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return normalized;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function coordinateFromCells(
  latitudeCell: ExcelJS.CellValue | undefined,
  longitudeCell: ExcelJS.CellValue | undefined,
) {
  const lat = parseCoordinate(latitudeCell, "lat");
  const lon = parseCoordinate(longitudeCell, "lon");

  if (lat === null || lon === null) {
    return null;
  }

  return { lat, lon };
}

function parseCoordinate(value: ExcelJS.CellValue | undefined, kind: "lat" | "lon") {
  const normalized = normalizeCell(value).replace(",", ".");
  let coordinate = Number(normalized);

  if (!Number.isFinite(coordinate)) {
    return null;
  }

  if (kind === "lat" && coordinate > 0 && coordinate >= 20 && coordinate <= 30) {
    coordinate *= -1;
  }

  if (kind === "lon" && coordinate > 0 && coordinate >= 40 && coordinate <= 60) {
    coordinate *= -1;
  }

  const isInsideParana =
    kind === "lat"
      ? coordinate >= paranaBounds.minLat && coordinate <= paranaBounds.maxLat
      : coordinate >= paranaBounds.minLon && coordinate <= paranaBounds.maxLon;

  return isInsideParana ? coordinate : null;
}
