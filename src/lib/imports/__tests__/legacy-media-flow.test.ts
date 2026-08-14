import { describe, expect, it, vi } from "vitest";
import campaignPoints from "@/data/campaign-map-points.json";
import migrationReport from "../../../../migration-reports/campaign-photo-migration-2026-07-07T09-49-18-345Z.json";
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
