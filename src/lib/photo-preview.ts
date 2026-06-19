export type PhotoPreview =
  | {
      kind: "image";
      src: string;
      candidates: string[];
      originalUrl: string;
      driveUrl?: string;
    }
  | {
      kind: "folder";
      src: string;
      candidates: string[];
      originalUrl: string;
      driveUrl?: string;
    };

export function getPhotoPreview(url?: string): PhotoPreview | null {
  const normalizedUrl = url?.trim();

  if (!normalizedUrl) {
    return null;
  }

  const dropboxPreview = getDropboxPreview(normalizedUrl);

  if (dropboxPreview) {
    return dropboxPreview;
  }

  const drivePreview = getDrivePreview(normalizedUrl);

  if (drivePreview) {
    return drivePreview;
  }

  return {
    kind: "image",
    src: normalizedUrl,
    candidates: [normalizedUrl],
    originalUrl: normalizedUrl,
  };
}

function getDrivePreview(url: string): PhotoPreview | null {
  const folderId = extractDriveFolderId(url);

  if (folderId) {
    const src = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#grid`;

    return {
      kind: "folder",
      src,
      candidates: [src],
      originalUrl: url,
      driveUrl: buildDriveOpenUrl(folderId),
    };
  }

  const fileId = extractDriveFileId(url);

  if (!fileId) {
    return null;
  }

  const encodedId = encodeURIComponent(fileId);
  const candidates = [
    `https://drive.google.com/thumbnail?id=${encodedId}&sz=w1600`,
    `https://lh3.googleusercontent.com/d/${encodedId}=w1600`,
    `https://drive.google.com/uc?export=view&id=${encodedId}`,
  ];

  return {
    kind: "image",
    src: candidates[0],
    candidates,
    originalUrl: url,
    driveUrl: buildDriveOpenUrl(fileId),
  };
}

function extractDriveFileId(url: string) {
  const parsed = parseUrl(url);
  const idFromQuery = parsed?.searchParams.get("id")?.trim();

  if (idFromQuery) {
    return idFromQuery;
  }

  const pathname = parsed?.pathname ?? url;
  const pathMatch =
    pathname.match(/\/file\/d\/([^/?#]+)/) ??
    pathname.match(/\/d\/([^/?#]+)/) ??
    url.match(/\/file\/d\/([^/?#]+)/) ??
    url.match(/[?&]id=([^&#]+)/) ??
    url.match(/\/uc\?id=([^&#]+)/) ??
    url.match(/\/thumbnail\?[^#]*id=([^&#]+)/);

  return pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : "";
}

function extractDriveFolderId(url: string) {
  const parsed = parseUrl(url);
  const pathname = parsed?.pathname ?? url;
  const folderMatch = pathname.match(/\/folders\/([^/?#]+)/) ?? url.match(/\/folders\/([^/?#]+)/);

  return folderMatch?.[1] ? decodeURIComponent(folderMatch[1]) : "";
}

function getDropboxPreview(url: string): PhotoPreview | null {
  const parsed = parseUrl(url);

  if (!parsed || !parsed.hostname.endsWith("dropbox.com")) {
    return null;
  }

  parsed.searchParams.delete("dl");
  parsed.searchParams.set("raw", "1");

  const src = parsed.toString();

  return {
    kind: "image",
    src,
    candidates: [src],
    originalUrl: url,
  };
}

function buildDriveOpenUrl(id: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

function parseUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
