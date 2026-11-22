import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultsInventoryResponse } from "@/lib/results-publication-contract";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  preview: vi.fn(),
  readRows: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/imports/results", () => ({
  previewResultsWorkbook: mocks.preview,
  resultsCampaignPublicationKey: (campaign: { publicationKey: string }) => campaign.publicationKey,
}));
vi.mock("@/lib/results-v2-persistence", () => ({
  isResultsPublicationV2: () => true,
}));
vi.mock("@/lib/results-publication-store", async original => ({
  ...await original<typeof import("@/lib/results-publication-store")>(),
  readResultsSnapshot: mocks.readRows,
  resultsInventory: (): ResultsInventoryResponse => ({
    campaigns: [{
      campaignCode: "C1",
      canonicalId: "campanha-1-verao-2026",
      canonicalName: "1ª Campanha - Verão 2026",
      publicationId: "current-id",
      publishedAt: "2026-11-22T00:00:00Z",
      format: "v2",
      source: { sha256: "a".repeat(64), fileName: "vigente.xlsx" },
      counts: { total: 1, complete: 1, partialWithTwoSets: 0, partialWithOneSet: 0, unavailable: 0 },
      downloadAvailable: false,
      sourceAvailability: "missing_source_artifact",
    }],
    totalCampaigns: 9,
    publishedCount: 1,
    expectedHeads: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`C${i + 1}`, i === 0 ? "current-id" : null])),
    historicalPublications: [],
  }),
}));
vi.mock("@/lib/supabase", () => ({ createOptionalSupabaseClient: () => ({}) }));

import { POST } from "@/app/api/imports/results/preview/route";

describe("POST /api/imports/results/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ ok: true });
    mocks.preview.mockResolvedValue({
      contractVersion: "yvae-results/2.0",
      fileName: "oficial.xlsx",
      campaigns: [
        { code: "C1", publicationKey: "incoming-c1" },
        { code: "C2", publicationKey: "incoming-c2" },
      ],
    });
    mocks.readRows.mockResolvedValue({
      heads: {C1:"current-id"}, sourceHashes: [], publications: [{id:"current-id", points: {
        contractVersion: "yvae-results/2.0",
        calculationVersion: "calc",
        catalogVersion: "catalog",
        campaigns: [{ campaignCode: "C1", publicationKey: "current-c1" }],
      } }],
    });
  });

  it("exige data.import e devolve prévia read-only sem cache", async () => {
    const formData = new FormData();
    formData.set("file", new File(["xlsx"], "oficial.xlsx"));
    const request = new Request("http://local.test/api/imports/results/preview", { method: "POST", body: formData });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.auth).toHaveBeenCalledWith(request, "data.import");
    expect(mocks.preview).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      contractVersion: "yvae-results/2.0",
      currentCampaigns: [{ campaignCode: "C1", publicationKey: "current-c1" }],
    });
  });

  it("retorna erro validado sem cache e não mascara a mensagem", async () => {
    mocks.preview.mockRejectedValue(new Error("Aba Indices_pontos ausente."));
    const formData = new FormData();
    formData.set("file", new File(["xlsx"], "invalida.xlsx"));
    const response = await POST(new Request("http://local.test/api/imports/results/preview", { method: "POST", body: formData }));

    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Aba Indices_pontos ausente." });
  });
});
