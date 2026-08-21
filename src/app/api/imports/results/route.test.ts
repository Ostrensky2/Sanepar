import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESULTS_SCHEMA_VERSION } from "@/lib/imports/results-contract";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  parse: vi.fn(),
  buildRisk: vi.fn(),
  query: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/imports/results", () => ({ parseLaboratoryResultsWorkbook: mocks.parse }));
vi.mock("@/lib/laboratory-risk", () => ({ buildLaboratoryRiskPoints: mocks.buildRisk }));
vi.mock("@/lib/supabase", () => ({
  getLatestPublishedCampaignImport: vi.fn().mockResolvedValue({ points: [] }),
  createOptionalSupabaseClient: () => ({
    from: () => ({
      select: () => ({ order: () => ({ returns: mocks.query }) }),
      insert: mocks.insert,
    }),
  }),
}));

import { GET, POST } from "@/app/api/imports/results/route";

const emptyHeat = { taxa: [], rows: [] };
const viewModel = {
  meta: {
    campanha: 2, amostras: 0, municipios: 0, mananciais: 0, especies: 0, linhas: 0,
    reads_total: 0, reads_ciano: 0, reads_bact: 0, reads_coi: 0, coi_amostras: 0,
    coi_taxa: 0, classes: {}, score_min: null, score_max: null, score_med: null,
  },
  points: [], ptaxa: {}, municipios: [], top_ciano: [], top_bact: [], top_coi: [],
  freq_ciano: [], freq_bact: [], freq_coi: [], tox: [], odor: [], invasores: [],
  heat_ciano: emptyHeat, heat_bact: emptyHeat, heat_coi: emptyHeat,
  coi_all: [], coi_groups: [], alerts: [],
};
const publication = {
  campaignId: "campanha-2",
  campaignNumber: 2,
  campaignTitle: "Campanha 2",
  importedAt: "2026-08-21T12:00:00.000Z",
  schemaVersion: RESULTS_SCHEMA_VERSION,
  fileName: "campanha-2.xlsx",
  methodology: { origin: "Método homologado", version: "1" },
  molecularRows: [],
  rankingRows: [],
  viewModel,
};

describe("/api/imports/results campaign isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({ ok: true });
    mocks.query.mockResolvedValue({
      data: [
        { points: publication },
        { points: { ...publication, campaignId: "campanha-1", campaignNumber: 1, campaignTitle: "Campanha 1" } },
      ],
      error: null,
    });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.buildRisk.mockReturnValue([]);
  });

  it("GET retorna somente a publicação solicitada e expõe alias numérico", async () => {
    const response = await GET(new Request("http://local.test/api/imports/results?campaignNumber=2"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "published",
      publication: { campaignId: "campanha-2", campaignNumber: 2 },
      viewModel,
    });
  });

  it("GET retorna empty sem reaproveitar publicação de outra campanha", async () => {
    const response = await GET(new Request("http://local.test/api/imports/results?campaignId=campanha-3"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "empty", publication: null, viewModel: null });
  });

  it("GET preserva o golden master da Campanha 1 enquanto não há publicação canônica", async () => {
    mocks.query.mockResolvedValue({ data: [], error: null });

    const response = await GET(new Request(
      "http://local.test/api/imports/results?campaignId=campanha-1-verao-2026&campaignNumber=1",
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "published",
      publication: {
        campaignId: "campanha-1-verao-2026",
        campaignNumber: 1,
        rankingRows: { length: 73 },
      },
      viewModel: {
        meta: { amostras: 73, municipios: 60 },
        points: { length: 73 },
      },
    });
  });

  it("draft falha antes do insert e preserva a publicação anterior", async () => {
    mocks.parse.mockResolvedValue(parsedResult("draft"));
    const response = await POST(uploadRequest());
    expect(response.status).toBe(422);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("published insere um envelope autoritativo da campanha", async () => {
    mocks.parse.mockResolvedValue(parsedResult("published"));
    const response = await POST(uploadRequest());
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      points: { campaignId: "campanha-2", campaignNumber: 2, schemaVersion: RESULTS_SCHEMA_VERSION },
    });
  });
});

function uploadRequest() {
  const formData = new FormData();
  formData.set("file", new File(["xlsx"], "campanha-2.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  return new Request("http://local.test/api/imports/results", { method: "POST", body: formData });
}

function parsedResult(publicationStatus: "draft" | "published") {
  return {
    fileName: "campanha-2.xlsx", worksheetName: "Banco_consolidado", rankingWorksheetName: "Ranking_score_pontos",
    rowCount: 1, sheetCount: 5, columnCount: 22, expectedColumnCount: 22, headers: [], matchedHeaders: 22,
    markers: ["16S"], analyzedSets: ["Cianobactérias"], speciesCount: 1, riskRows: [], molecularRows: [], rankingRows: [], viewModel,
    metadata: {
      schemaVersion: RESULTS_SCHEMA_VERSION, campaignId: "campanha-2", campaignNumber: 2,
      campaignTitle: "Campanha 2", publicationStatus, methodology: { origin: "Método homologado", version: "1" },
    },
  };
}
