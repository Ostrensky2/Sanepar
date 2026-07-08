import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DOCUMENTS_BUCKET = "documents";
const PHOTOS_BUCKET = "photos";
const DOCUMENT_LIMIT_BYTES = 50 * 1024 * 1024;
const PHOTO_LIMIT_BYTES = 20 * 1024 * 1024;
const REPORT_DIR = "migration-reports";

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);
const PHOTO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

const DOCUMENT_EXTENSIONS = new Map([
  ["application/pdf", "pdf"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.ms-powerpoint", "ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["text/csv", "csv"],
]);
const PHOTO_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
]);

const args = parseArgs(process.argv.slice(2));

if (args.insecureTls) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const env = await loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY
  || env.SUPABASE_SECRET_KEY
  || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no ambiente.");
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
    includeDocuments: args.includeDocuments,
    includePointActions: args.includePointActions,
    limit: args.limit,
    insecureTls: args.insecureTls,
  },
  summary: {
    candidates: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
  },
  items: [],
};

if (!args.execute) {
  console.log("Modo dry-run: nenhum arquivo será enviado e nenhum registro será atualizado.");
}

if (args.includeDocuments) {
  await migrateAppDocuments();
}

if (args.includePointActions) {
  await migratePointActions();
}

report.finishedAt = new Date().toISOString();
await writeReport(report);
printSummary(report);

async function migrateAppDocuments() {
  const { data, error } = await supabase
    .from("app_documents")
    .select("*")
    .not("dropbox_url", "is", null)
    .or("storage_path.is.null,storage_bucket.is.null")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Não foi possível ler app_documents: ${error.message}`);
  }

  for (const row of data ?? []) {
    if (isLimitReached()) {
      break;
    }

    const sourceUrl = firstUrl(row.dropbox_url, row.original_url);
    const item = baseItem("app_document", row.id, sourceUrl, {
      title: row.title,
      table: "app_documents",
    });
    report.items.push(item);

    if (!sourceUrl) {
      skip(item, "Registro sem URL externa.");
      continue;
    }

    await migrateUrlItem(item, {
      bucket: DOCUMENTS_BUCKET,
      allowedMimeTypes: DOCUMENT_MIME_TYPES,
      mimeExtensions: DOCUMENT_EXTENSIONS,
      sizeLimit: DOCUMENT_LIMIT_BYTES,
      pathPrefix: `migrated/documents/${slug(row.type || "documentos")}`,
      fallbackName: row.title || row.id,
      update: async (file) => {
        const { error: updateError } = await supabase
          .from("app_documents")
          .update({
            original_url: row.original_url || sourceUrl,
            original_name: file.name,
            mime_type: file.mimeType,
            size_bytes: file.size,
            storage_bucket: file.bucket,
            storage_path: file.path,
            source: "storage",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        if (updateError) {
          throw new Error(updateError.message);
        }
      },
    });
  }
}

async function migratePointActions() {
  const { data, error } = await supabase
    .from("point_actions")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Não foi possível ler point_actions: ${error.message}`);
  }

  for (const row of data ?? []) {
    let changed = false;
    const nextDocument = row.document ? structuredClone(row.document) : null;
    const nextPoints = Array.isArray(row.points) ? structuredClone(row.points) : [];

    if (nextDocument?.dropboxUrl && !nextDocument.storagePath && !isLimitReached()) {
      const sourceUrl = firstUrl(nextDocument.dropboxUrl, nextDocument.originalUrl);
      const item = baseItem("point_action_document", `${row.id}:document`, sourceUrl, {
        title: nextDocument.title,
        table: "point_actions",
        actionId: row.id,
      });
      report.items.push(item);

      await migrateUrlItem(item, {
        bucket: DOCUMENTS_BUCKET,
        allowedMimeTypes: DOCUMENT_MIME_TYPES,
        mimeExtensions: DOCUMENT_EXTENSIONS,
        sizeLimit: DOCUMENT_LIMIT_BYTES,
        pathPrefix: `migrated/point-actions/${slug(row.id)}/documents`,
        fallbackName: nextDocument.title || row.id,
        update: async (file) => {
          nextDocument.originalUrl = nextDocument.originalUrl || sourceUrl;
          nextDocument.originalName = file.name;
          nextDocument.mimeType = file.mimeType;
          nextDocument.size = file.size;
          nextDocument.storageBucket = file.bucket;
          nextDocument.storagePath = file.path;
          changed = true;
        },
      });
    }

    for (const point of nextPoints) {
      if (!Array.isArray(point.photos)) {
        continue;
      }

      for (const photo of point.photos) {
        if (isLimitReached()) {
          break;
        }

        const sourceUrl = firstUrl(photo.url, photo.originalUrl);

        if (!sourceUrl || photo.storagePath || isInternalStorageUrl(sourceUrl)) {
          continue;
        }

        const item = baseItem("point_action_photo", `${row.id}:${point.id}:${photo.id}`, sourceUrl, {
          table: "point_actions",
          actionId: row.id,
          pointId: point.id,
          photoId: photo.id,
          caption: photo.caption,
        });
        report.items.push(item);

        await migrateUrlItem(item, {
          bucket: PHOTOS_BUCKET,
          allowedMimeTypes: PHOTO_MIME_TYPES,
          mimeExtensions: PHOTO_EXTENSIONS,
          sizeLimit: PHOTO_LIMIT_BYTES,
          pathPrefix: `migrated/point-actions/${slug(row.id)}/photos/${slug(point.id)}`,
          fallbackName: photo.caption || photo.id,
          update: async (file) => {
            photo.originalUrl = photo.originalUrl || sourceUrl;
            photo.originalName = file.name;
            photo.mimeType = file.mimeType;
            photo.size = file.size;
            photo.storageBucket = file.bucket;
            photo.storagePath = file.path;
            photo.url = storageAccessUrl(file.bucket, file.path);
            changed = true;
          },
        });
      }
    }

    if (args.execute && changed) {
      const { error: updateError } = await supabase
        .from("point_actions")
        .update({
          document: nextDocument,
          points: nextPoints,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        const item = baseItem("point_action_update", row.id, "", { table: "point_actions" });
        report.items.push(item);
        fail(item, `Falha ao atualizar ação pontual: ${updateError.message}`);
      }
    }
  }
}

async function migrateUrlItem(item, options) {
  report.summary.candidates += 1;

  try {
    const preparedUrl = toDownloadUrl(item.sourceUrl);
    item.preparedUrl = preparedUrl;

    if (!args.execute) {
      item.status = "candidate";
      return;
    }

    const file = await downloadFile(preparedUrl, options);
    const objectPath = buildObjectPath(options.pathPrefix, item.id, file.name, file.mimeType, options.mimeExtensions);
    const { error: uploadError } = await supabase.storage
      .from(options.bucket)
      .upload(objectPath, file.buffer, {
        contentType: file.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload falhou: ${uploadError.message}`);
    }

    const storedFile = {
      bucket: options.bucket,
      path: objectPath,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
    };

    await options.update(storedFile);
    item.status = "migrated";
    item.storageBucket = storedFile.bucket;
    item.storagePath = storedFile.path;
    item.mimeType = storedFile.mimeType;
    item.size = storedFile.size;
    report.summary.migrated += 1;
  } catch (error) {
    fail(item, error instanceof Error ? error.message : String(error));
  }
}

async function downloadFile(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "YvaeStorageMigration/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Download retornou HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") || "0");

    if (contentLength > options.sizeLimit) {
      throw new Error(`Arquivo excede o limite (${contentLength} bytes).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.byteLength > options.sizeLimit) {
      throw new Error(`Arquivo excede o limite (${buffer.byteLength} bytes).`);
    }

    const mimeType = normalizeMimeType(response.headers.get("content-type") || "", url, options.allowedMimeTypes);

    if (!options.allowedMimeTypes.has(mimeType)) {
      throw new Error(`Tipo de arquivo não permitido: ${mimeType || "desconhecido"}.`);
    }

    return {
      buffer,
      size: buffer.byteLength,
      mimeType,
      name: inferFileName(response.url || url, options.fallbackName, mimeType, options.mimeExtensions),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildObjectPath(prefix, id, fileName, mimeType, mimeExtensions) {
  const extension = extensionFromFileName(fileName)
    || mimeExtensions.get(mimeType)
    || "bin";
  const baseName = slug(fileName.replace(/\.[^.]+$/, "") || id);
  return `${prefix}/${shortHash(id)}-${baseName}.${extension}`;
}

function inferFileName(url, fallbackName, mimeType, mimeExtensions) {
  try {
    const parsed = new URL(url);
    const lastSegment = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");

    if (lastSegment && lastSegment.includes(".")) {
      return sanitizeFileName(lastSegment);
    }
  } catch {
    // Usa fallback abaixo.
  }

  const extension = mimeExtensions.get(mimeType) || "bin";
  return `${slug(fallbackName || "arquivo")}.${extension}`;
}

function normalizeMimeType(header, url, allowedMimeTypes) {
  const mimeType = header.split(";")[0].trim().toLowerCase();

  if (allowedMimeTypes.has(mimeType)) {
    return mimeType;
  }

  const extension = extensionFromFileName(url);
  const fromExtension = extension ? mimeFromExtension(extension) : "";

  return fromExtension || mimeType;
}

function mimeFromExtension(extension) {
  const normalized = extension.toLowerCase();
  const entries = [
    ...DOCUMENT_EXTENSIONS.entries(),
    ...PHOTO_EXTENSIONS.entries(),
  ];
  return entries.find(([, ext]) => ext === normalized)?.[0] || "";
}

function extensionFromFileName(value) {
  const clean = value.split(/[?#]/)[0];
  const match = clean.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() || "";
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

function baseItem(kind, id, sourceUrl, details = {}) {
  return {
    kind,
    id,
    sourceUrl,
    status: "pending",
    ...details,
  };
}

function skip(item, reason) {
  item.status = "skipped";
  item.reason = reason;
  report.summary.skipped += 1;
}

function fail(item, reason) {
  item.status = "failed";
  item.reason = reason;
  report.summary.failed += 1;
}

function isLimitReached() {
  return Number.isFinite(args.limit) && report.summary.candidates >= args.limit;
}

async function writeReport(result) {
  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(REPORT_DIR, `storage-migration-${stamp}.json`);
  const csvPath = path.join(REPORT_DIR, `storage-migration-${stamp}.csv`);
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(csvPath, toCsv(result.items), "utf8");
  result.reportJson = jsonPath;
  result.reportCsv = csvPath;
}

function toCsv(items) {
  const headers = ["status", "kind", "id", "sourceUrl", "storageBucket", "storagePath", "mimeType", "size", "reason"];
  const rows = items.map((item) => headers.map((header) => csvCell(item[header])).join(","));
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function printSummary(result) {
  console.log(JSON.stringify({
    mode: result.mode,
    summary: result.summary,
    reportJson: result.reportJson,
    reportCsv: result.reportCsv,
  }, null, 2));
}

function sanitizeFileName(value) {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, " ").trim() || "arquivo";
}

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96) || "item";
}

function shortHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

async function loadEnv() {
  const env = { ...process.env };

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
        const value = trimmed.slice(index + 1).replace(/^["']|["']$/g, "").replace(/\\r\\n|\\n|\\r/g, "");

        if (!env[key]) {
          env[key] = value;
        }
      }
    } catch {
      // Arquivo de ambiente opcional.
    }
  }

  return env;
}

function parseArgs(argv) {
  const parsed = {
    execute: false,
    includeDocuments: true,
    includePointActions: true,
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
    } else if (arg === "--documents-only") {
      parsed.includeDocuments = true;
      parsed.includePointActions = false;
    } else if (arg === "--point-actions-only") {
      parsed.includeDocuments = false;
      parsed.includePointActions = true;
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

  if (!parsed.includeDocuments && !parsed.includePointActions) {
    throw new Error("Selecione ao menos um escopo de migração.");
  }

  return parsed;
}
