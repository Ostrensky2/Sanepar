import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import sharp from "sharp";

const PHOTOS_BUCKET = "photos";
const PHOTO_LIMIT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_IMAGE_SIDE = 1600;
const REPORT_DIR = "migration-reports";
const DEFAULT_WORKBOOK_PATH = String.raw`D:\Dropbox\Sanepar_única\Campo\Campanhas\Campanhas_ Planilha sintese.xlsx`;
const BUNDLED_POINTS_PATH = path.join("src", "data", "campaign-map-points.json");

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
  waterAspect: ["aspecto da agua", "aspecto da água"],
  weatherConditions: ["condicoes climaticas", "condições climaticas", "condições climáticas"],
  problems: ["problemas enfrentados", "problemas"],
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
};

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
  driveUrl: 18,
  dropboxUrl: 19,
  photoUrl: 19,
};

const paranaBounds = {
  minLat: -26.85,
  maxLat: -22.35,
  minLon: -54.9,
  maxLon: -47.95,
};

const args = parseArgs(process.argv.slice(2));

if (args.insecureTls) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const env = await loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SECRET_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e uma chave Supabase no ambiente.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const startedAt = new Date();
const report = {
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  mode: args.execute ? "execute" : "dry-run",
  options: {
    workbook: args.workbook,
    updateBundledJson: args.updateBundledJson,
    publishCampaignImport: args.publishCampaignImport,
    insecureTls: args.insecureTls,
    limit: args.limit,
  },
  summary: {
    points: 0,
    candidates: 0,
    migrated: 0,
    failed: 0,
    publishedImports: 0,
    bundledJsonUpdated: false,
  },
  items: [],
};

if (!args.execute) {
  console.log("Modo dry-run: nenhum upload, importação ou arquivo local será atualizado.");
}

await ensurePhotosBucket();

const campaignImport = await readCampaignWorkbook(args.workbook);
report.summary.points = campaignImport.points.length;

for (const point of campaignImport.points) {
  if (isLimitReached()) {
    break;
  }

  const sourceUrl = firstUrl(point.dropboxUrl, point.photoUrl, point.driveUrl);
  const item = {
    id: point.id,
    code: point.code,
    campaign: point.campaign,
    sourceUrl,
    status: "pending",
  };
  report.items.push(item);

  if (!sourceUrl || isInternalStorageUrl(sourceUrl)) {
    item.status = "skipped";
    item.reason = sourceUrl ? "Foto já aponta para Storage interno." : "Ponto sem URL de foto.";
    continue;
  }

  report.summary.candidates += 1;

  if (!args.execute) {
    item.status = "candidate";
    item.storageBucket = PHOTOS_BUCKET;
    item.storagePath = buildPhotoPath(point);
    continue;
  }

  try {
    const downloaded = await downloadImage(sourceUrl);
    const image = sharp(downloaded.buffer);
    const metadata = await image.metadata();

    if (!metadata.format) {
      throw new Error("Arquivo baixado não foi reconhecido como imagem.");
    }

    const pngBuffer = await image
      .rotate()
      .resize({
        width: MAX_OUTPUT_IMAGE_SIDE,
        height: MAX_OUTPUT_IMAGE_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    if (pngBuffer.byteLength > PHOTO_LIMIT_BYTES) {
      throw new Error(`PNG excede o limite de ${PHOTO_LIMIT_BYTES} bytes.`);
    }

    const storagePath = buildPhotoPath(point);
    const { error: uploadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(storagePath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const storageUrl = storageAccessUrl(PHOTOS_BUCKET, storagePath);
    point.originalPhotoUrl = sourceUrl;
    point.photoUrl = storageUrl;
    point.dropboxUrl = "";
    point.driveUrl = "";

    item.status = "migrated";
    item.storageBucket = PHOTOS_BUCKET;
    item.storagePath = storagePath;
    item.mimeType = "image/png";
    item.size = pngBuffer.byteLength;
    item.originalMimeType = downloaded.mimeType;
    item.originalFormat = metadata.format;
    report.summary.migrated += 1;
    console.log(`Foto migrada ${report.summary.migrated}/${report.summary.candidates}: ${point.code}`);
  } catch (error) {
    item.status = "failed";
    item.reason = error instanceof Error ? error.message : String(error);
    report.summary.failed += 1;
  }
}

if (args.execute && report.summary.failed === 0) {
  if (args.publishCampaignImport) {
    await publishCampaignImport(campaignImport);
    report.summary.publishedImports += 1;
  }

  if (args.updateBundledJson) {
    await writeFile(BUNDLED_POINTS_PATH, `${JSON.stringify(campaignImport.points, null, 2)}\n`, "utf8");
    report.summary.bundledJsonUpdated = true;
  }
}

report.finishedAt = new Date().toISOString();
await writeReport(report);
printSummary(report);

async function ensurePhotosBucket() {
  if (!args.execute) {
    return;
  }

  const { error } = await supabase.storage.createBucket(PHOTOS_BUCKET, {
    public: false,
    fileSizeLimit: PHOTO_LIMIT_BYTES,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg"],
  });

  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Não foi possível garantir o bucket photos: ${error.message}`);
  }
}

async function readCampaignWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("Campanhas");

  if (!worksheet) {
    throw new Error("A planilha precisa conter a aba Campanhas.");
  }

  const columns = buildColumnMap(worksheet);
  const missingFields = Object.entries(columns)
    .filter(([, column]) => column === null)
    .map(([field]) => field);
  const points = [];

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

    const campaign = readMappedCell(row, columns.campaign, FALLBACK_COLUMNS.campaign) || "Campanha";
    const driveUrl = readMappedCell(row, columns.driveUrl, FALLBACK_COLUMNS.driveUrl);
    const dropboxUrl = readMappedCell(row, columns.dropboxUrl, FALLBACK_COLUMNS.dropboxUrl);
    const fieldPhotoUrl = readMappedCell(row, columns.photoUrl, FALLBACK_COLUMNS.photoUrl);

    points.push({
      id: `${campaign}-${code}-${rowNumber}`,
      code: `SIA-${code.padStart(4, "0")}`,
      point: readMappedCell(row, columns.point, FALLBACK_COLUMNS.point),
      day: readMappedCell(row, columns.day, FALLBACK_COLUMNS.day),
      campaign,
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
        readMappedCell(row, columns.weatherConditions, FALLBACK_COLUMNS.weatherConditions) ||
        "Não informado",
      problems:
        readMappedCell(row, columns.problems, FALLBACK_COLUMNS.problems) ||
        "Não informado",
      driveUrl,
      dropboxUrl,
      photoUrl: fieldPhotoUrl || dropboxUrl || driveUrl,
    });
  }

  return {
    fileName: path.basename(filePath),
    rowCount: Math.max(worksheet.actualRowCount - 1, 0),
    points,
    originalPointCount: points.filter((point) => point.original).length,
    effectivePointCount: points.filter((point) => point.effective).length,
    missingFields,
  };
}

async function publishCampaignImport(campaignImport) {
  const campaignKey =
    campaignImport.points[0]?.campaign?.trim().toLowerCase() ||
    campaignImport.fileName.trim().toLowerCase();

  const { error } = await supabase.from("campaign_imports").insert({
    file_name: `${campaignImport.fileName} - fotos no Supabase Storage`,
    row_count: campaignImport.rowCount,
    point_count: campaignImport.points.length,
    original_point_count: campaignImport.originalPointCount,
    effective_point_count: campaignImport.effectivePointCount,
    missing_fields: campaignImport.missingFields,
    points: campaignImport.points,
    campaign_key: campaignKey,
  });

  if (error) {
    throw new Error(`Fotos migradas, mas a publicação da campanha falhou: ${error.message}`);
  }
}

async function downloadImage(sourceUrl) {
  const url = toDownloadUrl(sourceUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "YvaeCampaignPhotoMigration/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Download retornou HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";

    return { buffer, mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPhotoPath(point) {
  const campaign = slug(point.campaign || "campanha");
  const code = slug(point.code || point.id);
  return `migrated/campaigns/${campaign}/${code}-${shortHash(point.id)}.png`;
}

function storageAccessUrl(bucket, storagePath) {
  const params = new URLSearchParams({ bucket, path: storagePath });
  return `/api/documents/file?${params.toString()}`;
}

function isInternalStorageUrl(value) {
  return String(value || "").startsWith("/api/documents/file?");
}

function firstUrl(...values) {
  return values.map((value) => String(value || "").trim()).find((value) => /^https?:\/\//i.test(value)) || "";
}

function toDownloadUrl(value) {
  const trimmed = String(value || "").trim();

  try {
    const url = new URL(trimmed);

    if (url.hostname.endsWith("dropbox.com")) {
      url.searchParams.set("dl", "1");
    }

    return url.toString();
  } catch {
    return trimmed;
  }
}

function buildColumnMap(worksheet) {
  const headers = new Map();
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
  );
}

function readMappedCell(row, column, fallbackColumn) {
  return normalizeCell(row.getCell(column ?? fallbackColumn).value);
}

function normalizeHeader(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCell(value) {
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
  }

  return String(value).trim();
}

function formatDateCell(value) {
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

function coordinateFromCells(latitudeCell, longitudeCell) {
  const lat = parseCoordinate(latitudeCell, "lat");
  const lon = parseCoordinate(longitudeCell, "lon");

  if (lat === null || lon === null) {
    return null;
  }

  return { lat, lon };
}

function parseCoordinate(value, kind) {
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

async function writeReport(result) {
  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(REPORT_DIR, `campaign-photo-migration-${stamp}.json`);
  const csvPath = path.join(REPORT_DIR, `campaign-photo-migration-${stamp}.csv`);
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(csvPath, toCsv(result.items), "utf8");
  result.reportJson = jsonPath;
  result.reportCsv = csvPath;
}

function toCsv(items) {
  const headers = ["status", "id", "code", "campaign", "sourceUrl", "storageBucket", "storagePath", "mimeType", "size", "reason"];
  const rows = items.map((item) => headers.map((header) => csvCell(item[header])).join(","));
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function printSummary(result) {
  console.log(
    JSON.stringify(
      {
        mode: result.mode,
        summary: result.summary,
        reportJson: result.reportJson,
        reportCsv: result.reportCsv,
      },
      null,
      2,
    ),
  );
}

function isLimitReached() {
  return Number.isFinite(args.limit) && report.summary.candidates >= args.limit;
}

function slug(value) {
  return (
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 96) || "item"
  );
}

function shortHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

async function loadEnv() {
  const loadedEnv = { ...process.env };

  for (const fileName of [".env.local", ".env.production"]) {
    try {
      const raw = await readFile(fileName, "utf8");

      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        const index = trimmed.indexOf("=");

        if (index === -1) {
          continue;
        }

        const key = trimmed.slice(0, index);
        const value = trimmed
          .slice(index + 1)
          .replace(/^["']|["']$/g, "")
          .replace(/\\r\\n|\\n|\\r/g, "");

        if (!loadedEnv[key]) {
          loadedEnv[key] = value;
        }
      }
    } catch {
      // Arquivo de ambiente opcional.
    }
  }

  return loadedEnv;
}

function parseArgs(argv) {
  const parsed = {
    execute: false,
    workbook: DEFAULT_WORKBOOK_PATH,
    updateBundledJson: false,
    publishCampaignImport: true,
    insecureTls: false,
    limit: Number.POSITIVE_INFINITY,
    timeoutMs: 60_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--execute") {
      parsed.execute = true;
    } else if (arg === "--dry-run") {
      parsed.execute = false;
    } else if (arg === "--workbook") {
      parsed.workbook = argv[index + 1] || parsed.workbook;
      index += 1;
    } else if (arg === "--update-bundled-json") {
      parsed.updateBundledJson = true;
    } else if (arg === "--no-publish-campaign-import") {
      parsed.publishCampaignImport = false;
    } else if (arg === "--insecure-tls") {
      parsed.insecureTls = true;
    } else if (arg === "--limit") {
      parsed.limit = Number(argv[index + 1] || "0");
      index += 1;
    } else if (arg === "--timeout-ms") {
      parsed.timeoutMs = Number(argv[index + 1] || "60000");
      index += 1;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  return parsed;
}
