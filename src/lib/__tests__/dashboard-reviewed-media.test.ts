import { describe, expect, it, vi } from "vitest";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";

vi.mock("@/lib/private-campaign-points", () => ({ readPrivateCampaignPoints: () => [] }));
vi.mock("@/lib/supabase", () => ({
  getFieldDiaryCampaignMediaCandidates: vi.fn(),
  getLatestPublishedCampaignImport: vi.fn(),
  getLatestPublishedLaboratoryRiskPoints: vi.fn(),
  createOptionalSupabaseClient: () => null,
}));

import { overlayBundledCampaignMedia } from "@/lib/dashboard-data";

const internal = (path: string) => `/api/documents/file?bucket=photos&path=${encodeURIComponent(path)}`;
function point(overrides: Partial<CampaignMapPoint>): CampaignMapPoint {
  return {
    id: "1-770-1", code: "SIA-0770", point: "1", day: "", campaign: "1", date: "", waterBody: "", municipality: "",
    original: null, effective: { lat: -25, lon: -49 }, accessibility: "", waterAspect: "", weatherConditions: "",
    problems: "", driveUrl: "", dropboxUrl: "https://www.dropbox.com/x.JPG", photoUrl: "https://www.dropbox.com/x.JPG",
    ...overrides,
  } as CampaignMapPoint;
}

describe("fotos revisadas da C1 sem a cópia privada local (app publicado)", () => {
  const reviewed = new Map([
    ["campaign:1|sia:770", internal("migrated/campaigns/1/sia-0770-eff20ba68598.png")],
    ["campaign:1|sia:257", internal("migrated/campaigns/1/sia-0257-198626159e2a.png")],
  ]);

  it("troca o link externo pela foto revisada do mesmo SIA e campanha", () => {
    const [c1, c2] = overlayBundledCampaignMedia([point({}), point({ id: "2-770-1", campaign: "2" })], reviewed);
    expect(c1.photoUrl).toBe(reviewed.get("campaign:1|sia:770"));
    expect(c1.dropboxUrl).toBe("");
    expect(c2.photoUrl).toBe("");
  });

  it("mantém a regra auditada do SIA 257: só o ponto 14 da C1 recebe a foto", () => {
    const [ok, wrong] = overlayBundledCampaignMedia([
      point({ id: "1-257-15", code: "SIA-0257", point: "14" }),
      point({ id: "1-257-outro", code: "SIA-0257", point: "99" }),
    ], reviewed);
    expect(ok.photoUrl).toBe(reviewed.get("campaign:1|sia:257"));
    expect(wrong.photoUrl).toBe("");
  });

  it("sem acervo revisado continua sem foto (nunca adivinha pelo nome do arquivo)", () => {
    expect(overlayBundledCampaignMedia([point({})])[0].photoUrl).toBe("");
  });
});
