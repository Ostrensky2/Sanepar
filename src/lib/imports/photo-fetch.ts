import { createHash } from "node:crypto";
import sharp from "sharp";

const PHOTOS_BUCKET = "photos";
const PHOTO_LIMIT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_IMAGE_SIDE = 1600;

type SupabaseStorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        options: { contentType: string; upsert: boolean },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export type StoredImportedPhoto = {
  id: string;
  url: string;
  originalUrl: string;
  bucket: string;
  path: string;
  fileName: string;
  width: number | null;
  height: number | null;
  uploadedAt: string;
};

export type PhotoImportWarning = {
  sourceUrl: string;
  message: string;
};

export type PhotoImportResult = {
  photos: StoredImportedPhoto[];
  warnings: PhotoImportWarning[];
};

export async function fetchAndStorePhotosAsPng(
  sourceUrls: string | string[],
  options: {
    supabase: SupabaseStorageClient;
    storagePathBuilder: (sourceUrl: string, index: number) => string;
    timeoutMs?: number;
  },
): Promise<PhotoImportResult> {
  const urls = Array.isArray(sourceUrls)
    ? sourceUrls.flatMap(splitPhotoLinks)
    : splitPhotoLinks(sourceUrls);
  const photos: StoredImportedPhoto[] = [];
  const warnings: PhotoImportWarning[] = [];

  for (const [index, sourceUrl] of urls.entries()) {
    try {
      const photo = await fetchAndStorePhotoAsPng(sourceUrl, {
        ...options,
        storagePath: options.storagePathBuilder(sourceUrl, index),
      });
      photos.push(photo);
    } catch (error) {
      warnings.push({
        sourceUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { photos, warnings };
}

export async function fetchAndStorePhotoAsPng(
  sourceUrl: string,
  options: {
    supabase: SupabaseStorageClient;
    storagePath: string;
    timeoutMs?: number;
  },
): Promise<StoredImportedPhoto> {
  const downloadUrl = toDownloadUrl(sourceUrl);
  const downloaded = await downloadImage(downloadUrl, options.timeoutMs ?? 60_000);
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

  const { error } = await options.supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(options.storagePath, pngBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: crypto.randomUUID(),
    url: storageAccessUrl(PHOTOS_BUCKET, options.storagePath),
    originalUrl: sourceUrl,
    bucket: PHOTOS_BUCKET,
    path: options.storagePath,
    fileName: options.storagePath.split("/").pop() ?? "foto.png",
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    uploadedAt: new Date().toISOString(),
  };
}

export function splitPhotoLinks(value: string) {
  return String(value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

export function toDownloadUrl(value: string) {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    throw new Error("Link de foto vazio.");
  }

  const url = new URL(trimmed);
  const host = url.hostname.toLowerCase();

  if (host.endsWith("dropbox.com")) {
    url.searchParams.set("dl", "1");
    return url.toString();
  }

  if (host === "drive.google.com" || host.endsWith(".google.com")) {
    const folderMatch = url.pathname.match(/\/drive\/folders\/([^/]+)/);
    if (folderMatch) {
      throw new Error("Link de pasta do Google Drive não suportado; use link de arquivo.");
    }

    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    const id = fileMatch?.[1] ?? url.searchParams.get("id");

    if (id) {
      return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
    }
  }

  return url.toString();
}

export function buildImportedPhotoPath(parts: {
  campaign: string;
  code: string;
  pointId: string;
  sourceUrl: string;
  index: number;
}) {
  return [
    "imports",
    "campaigns",
    slug(parts.campaign || "campanha"),
    `${slug(parts.code || parts.pointId)}-${parts.index + 1}-${shortHash(`${parts.pointId}|${parts.sourceUrl}`)}.png`,
  ].join("/");
}

function storageAccessUrl(bucket: string, storagePath: string) {
  const params = new URLSearchParams({ bucket, path: storagePath });
  return `/api/documents/file?${params.toString()}`;
}

async function downloadImage(sourceUrl: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(sourceUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "YvaeFieldSpreadsheetImport/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Download retornou HTTP ${response.status}.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > PHOTO_LIMIT_BYTES) {
      throw new Error(`Arquivo excede o limite de ${PHOTO_LIMIT_BYTES} bytes.`);
    }

    return { buffer };
  } finally {
    clearTimeout(timeout);
  }
}

function slug(value: string) {
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

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
