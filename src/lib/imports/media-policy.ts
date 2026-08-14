const INTERNAL_FILE_ROUTE = "/api/documents/file";

type CampaignMedia = {
  driveUrl?: string;
  dropboxUrl?: string;
  photoUrl?: string;
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
};

type PointActionMedia = {
  points: Array<{
    photos: Array<{
      url: string;
      originalUrl?: string;
    }>;
  }>;
};

export function parseInternalStorageUrl(value: unknown, expectedBucket?: string) {
  const raw = String(value ?? "").trim();

  if (!raw.startsWith(`${INTERNAL_FILE_ROUTE}?`)) {
    return null;
  }

  const url = new URL(raw, "http://internal");
  const bucket = url.searchParams.get("bucket")?.trim() ?? "";
  const path = url.searchParams.get("path")?.trim() ?? "";

  if (
    url.pathname !== INTERNAL_FILE_ROUTE ||
    !bucket ||
    !path ||
    (expectedBucket && bucket !== expectedBucket) ||
    path.startsWith("/") ||
    path.split("/").includes("..")
  ) {
    return null;
  }

  return { bucket, path };
}

export function sanitizeCampaignMedia<T extends CampaignMedia>(point: T): T {
  const photos = (point.photos ?? []).filter((photo, index, items) => {
    const storage = parseInternalStorageUrl(photo.url, "photos");

    return Boolean(
      storage &&
        items.findIndex((candidate) => candidate.url === photo.url) === index,
    );
  });
  const photoUrl =
    photos[0]?.url ??
    (parseInternalStorageUrl(point.photoUrl, "photos") ? String(point.photoUrl) : "");

  return {
    ...point,
    driveUrl: "",
    dropboxUrl: "",
    photoUrl,
    photos,
  };
}

export function sanitizePointActionMedia<T extends PointActionMedia>(action: T): T {
  return {
    ...action,
    points: action.points.map((point) => ({
      ...point,
      photos: point.photos
        .filter((photo) => Boolean(parseInternalStorageUrl(photo.url, "photos")))
        .map((photo) => {
          const privatePhoto = { ...photo };
          delete privatePhoto.originalUrl;
          return privatePhoto;
        }),
    })),
  };
}

export function classifyPhotoAssociation(pointCode: unknown, sourceUrl: unknown) {
  const pointSias = normalizePointSias(pointCode);
  const inferredSias = inferSourceSias(sourceUrl);

  if (pointSias.length === 0 || inferredSias.length !== 1) {
    return { status: "ambiguous" as const, pointSias, inferredSias };
  }

  return {
    status: pointSias.includes(inferredSias[0]) ? ("match" as const) : ("mismatch" as const),
    pointSias,
    inferredSias,
  };
}

function normalizePointSias(value: unknown) {
  const normalized = String(value ?? "").toUpperCase();

  if (!normalized.includes("SIA")) {
    return [];
  }

  return uniqueSias(normalized.match(/\d{1,4}/g) ?? []);
}

function inferSourceSias(value: unknown) {
  try {
    const fileName = decodeURIComponent(new URL(String(value ?? "")).pathname.split("/").pop() ?? "");
    return uniqueSias([...fileName.matchAll(/SIA[^0-9]*(\d{1,4})/gi)].map((match) => match[1]));
  } catch {
    return [];
  }
}

function uniqueSias(values: string[]) {
  return [...new Set(values.map((value) => `SIA-${Number(value).toString().padStart(4, "0")}`))];
}
