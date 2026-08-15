import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import bundledCampaignMapPoints from "@/data/campaign-map-points.json";
import { HomeRiskMapSection } from "@/components/home-risk-map-section";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import type { LaboratoryRiskPoint } from "@/lib/laboratory-risk";

const {
  getLatestPublishedCampaignImport,
  getLatestPublishedLaboratoryRiskPoints,
} = vi.hoisted(() => ({
  getLatestPublishedCampaignImport: vi.fn(),
  getLatestPublishedLaboratoryRiskPoints: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getLatestPublishedCampaignImport,
  getLatestPublishedLaboratoryRiskPoints,
}));

import { loadDashboardData, overlayBundledCampaignMedia } from "@/lib/dashboard-data";

const bundledPoints = bundledCampaignMapPoints as CampaignMapPoint[];
const legacyUrl = "https://legacy.invalid/photo.png";
const mediaFields = new Set(["driveUrl", "dropboxUrl", "photoUrl", "photos"]);
const reassociatedCodes = [
  "SIA-0377",
  "SIA-0091",
  "SIA-0121",
  "SIA-0184",
  "SIA-0040",
  "SIA-0435",
  "SIA-0244",
  "SIA-0181",
  "SIA-0057",
  "SIA-0431",
  "SIA-0406",
  "SIA-0343",
  "SIA-0342",
  "SIA-0078",
  "SIA-0780",
];

describe("loadDashboardData canonical private-media overlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("overlays audited internal media without changing cloud operational fields", async () => {
    const cloudPoints: CampaignMapPoint[] = bundledPoints.map((point) => ({
      ...point,
      waterBody: `${point.waterBody} CLOUD`,
      driveUrl: legacyUrl,
      dropboxUrl: "",
      photoUrl: legacyUrl,
      photos: [],
    }));
    const preservedInternal =
      "/api/documents/file?bucket=photos&path=imports%2Fcampaigns%2F1%2Fsia-0770-cloud.png";
    cloudPoints[0] = {
      ...cloudPoints[0],
      photoUrl: preservedInternal,
      photos: [{ id: "cloud-photo", url: preservedInternal }],
    };
    const publishedRiskPoints = [
      ...cloudPoints.slice(0, 68),
      cloudPoints.find((point) => point.code === "SIA-0780")!,
    ].map(toRiskPoint);

    getLatestPublishedCampaignImport.mockResolvedValue({
      points: cloudPoints,
      row_count: cloudPoints.length,
      file_name: "cloud-snapshot.xlsx",
    });
    getLatestPublishedLaboratoryRiskPoints.mockResolvedValue(publishedRiskPoints);

    const dashboard = await loadDashboardData();
    const sia0780 = dashboard.campaignPoints.find((point) => point.code === "SIA-0780");
    const sia0257 = dashboard.campaignPoints.find((point) => point.code === "SIA-0257");
    const mappedRiskPoints = dashboard.laboratoryRiskPoints;

    expect(sia0780).toMatchObject({
      waterBody: expect.stringContaining("CLOUD"),
      driveUrl: "",
      dropboxUrl: "",
    });
    expect(sia0780?.photoUrl).toMatch(
      /^\/api\/documents\/file\?bucket=photos&path=migrated%2Fcampaigns%2F1%2Fsia-0078-/,
    );
    expect(sia0257).toMatchObject({
      photoUrl: bundledPoints.find((point) => point.code === "SIA-0257")?.photoUrl,
      photos: [],
      driveUrl: "",
      dropboxUrl: "",
    });
    expect(dashboard.campaignPoints[0]).toMatchObject({
      photoUrl: preservedInternal,
      photos: [{ id: "cloud-photo", url: preservedInternal }],
    });
    expect(dashboard.campaignPoints.filter((point) => point.photoUrl)).toHaveLength(76);
    expect(
      dashboard.campaignPoints.every(
        (point) =>
          !point.photoUrl || point.photoUrl.startsWith("/api/documents/file?"),
      ),
    ).toBe(true);
    expect(
      dashboard.campaignPoints.every(
        (point) => !point.driveUrl && !point.dropboxUrl,
      ),
    ).toBe(true);
    for (const code of reassociatedCodes) {
      expect(dashboard.campaignPoints.find((point) => point.code === code)?.photoUrl).toBe(
        bundledPoints.find((point) => point.code === code)?.photoUrl,
      );
    }
    dashboard.campaignPoints.forEach((point, index) => {
      expect(withoutMedia(point)).toEqual(withoutMedia(cloudPoints[index]));
    });
    expect(mappedRiskPoints).toHaveLength(publishedRiskPoints.length);
    expect(mappedRiskPoints.every((point) => point.photoUrl.startsWith("/api/documents/file?"))).toBe(true);
    expect(dashboard.laboratoryRiskPoints.find((point) => point.code === "SIA-0257")?.photoUrl).toBe(
      sia0257?.photoUrl,
    );

    const risk0780 = dashboard.laboratoryRiskPoints.find(
      (point) => point.code === "SIA-0780",
    );
    const risk0257 = dashboard.laboratoryRiskPoints.find(
      (point) => point.code === "SIA-0257",
    );
    expect(risk0780?.photoUrl).toBe(sia0780?.photoUrl);
    const mobileMarkup = renderToStaticMarkup(
      createElement(HomeRiskMapSection, {
        campaignPoints: [sia0780!],
        points: [risk0780!],
      }),
    );
    expect(mobileMarkup).toContain('<img alt="Foto representativa do ponto SIA-0780"');
    expect(mobileMarkup).toContain('src="/api/documents/file?bucket=photos&amp;path=');

    const sia0257Markup = renderToStaticMarkup(
      createElement(HomeRiskMapSection, {
        campaignPoints: [sia0257!],
        points: [risk0257!],
      }),
    );
    expect(sia0257Markup).toContain('<img alt="Foto representativa do ponto SIA-0257"');
    expect(sia0257Markup).toContain(
      "migrated%2Fcampaigns%2F1%2Fsia-0257-198626159e2a.png",
    );
  });

  it("libera somente a identidade auditada de SIA-0257/C1", () => {
    const canonical = bundledPoints.find((point) => point.code === "SIA-0257")!;
    const wrongInternal =
      "/api/documents/file?bucket=photos&path=migrated%2Fcampaigns%2F2%2Fsia-0257-incorreta.jpg";
    const audited = overlayBundledCampaignMedia([
      { ...canonical, photoUrl: wrongInternal, photos: [] },
    ])[0];
    const wrongPoint = overlayBundledCampaignMedia([
      { ...canonical, id: "1-257-outro", point: "99", photoUrl: "", photos: [] },
    ])[0];
    const otherCampaign = overlayBundledCampaignMedia([
      { ...canonical, id: "2-257-15", campaign: "2", photoUrl: "", photos: [] },
    ])[0];
    const sia0174NotCollected = overlayBundledCampaignMedia([
      {
        ...canonical,
        id: "2-174-27",
        code: "SIA-0174",
        point: "27",
        campaign: "2",
        photoUrl: "",
        photos: [],
      },
    ])[0];

    expect(audited.photoUrl).toBe(canonical.photoUrl);
    expect(audited.photoUrl).not.toBe(wrongInternal);
    expect(wrongPoint.photoUrl).toBe("");
    expect(otherCampaign.photoUrl).toBe("");
    expect(sia0174NotCollected.photoUrl).toBe("");
  });
});

function withoutMedia(point: CampaignMapPoint) {
  return Object.fromEntries(
    Object.entries(point).filter(([field]) => !mediaFields.has(field)),
  );
}

function toRiskPoint(point: CampaignMapPoint): LaboratoryRiskPoint {
  return {
    ...point,
    riskLevel: "baixo",
    riskLabel: "Risco baixo",
    riskClassification: "Baixo",
    environmentalRisk: "Baixo",
    operationalRisk: "Baixo",
    sanitaryRisk: "Baixo",
    environmentalRiskLevel: "baixo",
    operationalRiskLevel: "baixo",
    sanitaryRiskLevel: "baixo",
    eta: point.waterBody,
    detectedMarkers: [],
    ednaSignal: "Baixo",
    laboratoryStatus: "homologado",
    resultSummary: "Fixture cloud legada",
    score: 0,
    confidence: "Alta",
    recommendations: "",
    rankingPosition: 1,
    sampleId: point.code,
  };
}
