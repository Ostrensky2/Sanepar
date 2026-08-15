import { describe, expect, it, vi } from "vitest";
import campaignPoints from "@/data/campaign-map-points.json";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import {
  hydrateLaboratoryRiskPointPhotos,
  type LaboratoryRiskPoint,
} from "@/lib/laboratory-risk";
import {
  classifyPhotoAssociation,
  parseInternalStorageUrl,
  sanitizeCampaignMedia,
} from "@/lib/imports/media-policy";
import { getPhotoPreview } from "@/lib/photo-preview";

const migrationReport = {
  items: [
    ["migrated/campaigns/1/sia-0091-5c614a34d766.png", "SIA-0377"],
    ["migrated/campaigns/1/sia-0184-c7f9ec5c9870.png", "SIA-0121"],
    ["migrated/campaigns/1/sia-0244-1f275b98be79.png", "SIA-0435"],
    ["migrated/campaigns/1/sia-0057-ccf0da194736.png", "SIA-0181"],
    ["migrated/campaigns/1/sia-0343-f7871c5adac8.png", "SIA-0431"],
    ["migrated/campaigns/1/sia-0078-87bfd27c51a1.png", "SIA-0780"],
    ["migrated/campaigns/1/sia-0257-198626159e2a.png", null],
  ].map(([storagePath, sourceSia]) => ({
    storagePath,
    sourceUrl: sourceSia
      ? `https://legacy.invalid/${sourceSia}.png`
      : "https://legacy.invalid/photo-without-sia.png",
    status: "migrated",
    storageBucket: "photos",
    mimeType: "image/png",
  })),
};

const createSignedUrl = vi.fn(async () => ({
  data: { signedUrl: "https://storage.invalid/signed-redacted" },
  error: null,
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSession: () => ({ ok: true }),
}));

vi.mock("@/lib/supabase", () => ({
  createOptionalSupabaseClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl,
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  }),
}));

import { GET } from "@/app/api/documents/file/route";

const cycleSamples = [
  "SIA-0377",
  "SIA-0121",
  "SIA-0435",
  "SIA-0181",
  "SIA-0431",
  "SIA-0780",
];

describe("legacy campaign media integrated flow", () => {
  it.each(cycleSamples)(
    "preserva a associação auditada de %s do snapshot até o storage autenticado",
    async (code) => {
      const fieldPoint = (campaignPoints as CampaignMapPoint[]).find(
        (point) => point.code === code,
      );
      expect(fieldPoint).toBeDefined();

      const snapshotPoint = sanitizeCampaignMedia(fieldPoint!);
      const storage = parseInternalStorageUrl(snapshotPoint.photoUrl, "photos");
      expect(storage).not.toBeNull();

      const reportItem = migrationReport.items.find(
        (item) => item.storagePath === storage?.path,
      );
      expect(reportItem).toMatchObject({
        status: "migrated",
        storageBucket: "photos",
        mimeType: "image/png",
      });
      expect(classifyPhotoAssociation(code, reportItem?.sourceUrl).status).toBe("match");

      const riskInput = {
        ...fieldPoint,
        photoUrl: "",
      } as LaboratoryRiskPoint;
      const [hydrated] = hydrateLaboratoryRiskPointPhotos(
        [riskInput],
        [snapshotPoint],
      );
      expect(hydrated.photoUrl).toBe(snapshotPoint.photoUrl);

      const preview = getPhotoPreview(hydrated.photoUrl);
      expect(preview).toMatchObject({
        kind: "image",
        src: snapshotPoint.photoUrl,
      });

      createSignedUrl.mockClear();
      const response = await GET(
        new Request(`http://local.test${preview!.src}`),
      );
      expect(response.status).toBe(307);
      expect(createSignedUrl).toHaveBeenCalledWith(storage!.path, 600, {
        download: false,
      });
    },
  );

  it("mantém SIA-0257 fora das associações inferidas por nome", () => {
    const point = (campaignPoints as CampaignMapPoint[]).find(
      (candidate) => candidate.code === "SIA-0257",
    );
    const storage = parseInternalStorageUrl(point?.photoUrl, "photos");
    const reportItem = migrationReport.items.find(
      (item) => item.storagePath === storage?.path,
    );

    expect(storage).not.toBeNull();
    expect(classifyPhotoAssociation(point?.code, reportItem?.sourceUrl).status).toBe(
      "ambiguous",
    );
  });

  it("não confunde o nome histórico do objeto com a identidade de SIA-0780", () => {
    const point = (campaignPoints as CampaignMapPoint[]).find(
      (candidate) => candidate.code === "SIA-0780",
    );
    const storage = parseInternalStorageUrl(point?.photoUrl, "photos");
    const reportItem = migrationReport.items.find(
      (item) => item.storagePath === storage?.path,
    );

    expect(storage?.path).toMatch(/\/sia-0078-/);
    expect(classifyPhotoAssociation(point?.code, reportItem?.sourceUrl).status).toBe(
      "match",
    );
  });
});
