import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESULTS_SCHEMA_VERSION } from "@/lib/imports/results-contract";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  parse: vi.fn(),
  buildRisk: vi.fn(),
  query: vi.fn(),
  preselect: vi.fn(),
  deleteEq: vi.fn(),
  deletedRows: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/imports/results", () => ({ parseLaboratoryResultsWorkbook: mocks.parse }));
vi.mock("@/lib/laboratory-risk", () => ({ buildLaboratoryRiskPoints: mocks.buildRisk }));
vi.mock("@/lib/supabase", () => ({
  getLatestPublishedCampaignImport: vi.fn().mockResolvedValue({ points: [] }),
  createOptionalSupabaseClient: () => ({
    from: () => ({
      select: (columns: string) => {
        mocks.preselect(columns);
        return { order: () => ({ returns: mocks.query }) };
      },
      delete: () => ({
        eq: function eq(column: string, value: string) {
          mocks.deleteEq(column, value);
          return this;
        },
        select: () => ({ returns: mocks.deletedRows }),
      }),
      insert: mocks.insert,
    }),
  }),
}));

import { DELETE, GET, POST } from "@/app/api/imports/results/route";

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
    mocks.deletedRows.mockResolvedValue({
      data: [{ id: "result-c2", points: { ...publication, campaignId: "campanha-2-outono-2026" } }],
      error: null,
    });
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
    const payload = await response.json();
    expect(payload).toMatchObject({
      fileName: "campanha-2.xlsx",
      rowCount: 1,
      riskRows: [],
      riskPoints: [],
      matchedRiskPointCount: 0,
      fallbackSampleIdCount: 0,
      discardedOriginalCoordinateCount: 0,
      warnings: [],
    });
    expect(payload).not.toHaveProperty("molecularRows");
    expect(payload).not.toHaveProperty("publication");
    expect(payload).not.toHaveProperty("viewModel");
  });

  it("POST exige campanha selecionada e rejeita divergência antes do insert", async () => {
    expect((await POST(uploadRequest(""))).status).toBe(400);
    expect(mocks.parse).not.toHaveBeenCalled();

    mocks.parse.mockResolvedValueOnce(parsedResult("published"));
    expect((await POST(uploadRequest("campanha-1-verao-2026"))).status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("DELETE exige privilégio antes de consultar ou excluir", async () => {
    mocks.requireApiSession.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: "Sem permissão." }, { status: 403 }),
    });

    const response = await DELETE(deleteRequest("campanha-2-outono-2026", "campanha-2-outono-2026"));

    expect(response.status).toBe(403);
    expect(mocks.requireApiSession).toHaveBeenCalledWith(expect.any(Request), "data.delete");
    expect(mocks.deletedRows).not.toHaveBeenCalled();
  });

  it("DELETE não consulta nem exclui sem seletor e confirmação canônicos", async () => {
    expect((await DELETE(deleteRequest(undefined, undefined))).status).toBe(400);
    expect((await DELETE(deleteRequest("campanha-2-outono-2026", undefined))).status).toBe(409);
    expect((await DELETE(deleteRequest("campanha-2-outono-2026", "campanha-1-verao-2026"))).status).toBe(409);
    expect(mocks.deletedRows).not.toHaveBeenCalled();
  });

  it("DELETE remove somente envelopes publicados da campanha confirmada", async () => {
    const response = await DELETE(deleteRequest("Campanha 2", "campanha-2-outono-2026"));
    const payload = await response.json();
    expect({ status: response.status, payload }).toEqual({
      status: 200,
      payload: { campaignId: "campanha-2-outono-2026", deletedCount: 1 },
    });
    expect(mocks.deleteEq.mock.calls).toEqual([
      ["points->>campaignId", "campanha-2-outono-2026"],
      ["points->>campaignNumber", "2"],
      ["points->>schemaVersion", RESULTS_SCHEMA_VERSION],
    ]);
    expect(mocks.preselect).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("DELETE é idempotente e falha fechado quando não há publicação", async () => {
    mocks.deletedRows.mockResolvedValueOnce({ data: [], error: null });

    const response = await DELETE(deleteRequest("campanha-2-outono-2026", "campanha-2-outono-2026"));

    expect(response.status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("DELETE retorna 503 quando a instrução atômica falha", async () => {
    mocks.deletedRows.mockResolvedValueOnce({ data: null, error: { message: "offline" } });

    const response = await DELETE(deleteRequest("campanha-2-outono-2026", "campanha-2-outono-2026"));

    expect(response.status).toBe(503);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("DELETE falha fechado se o retorno não validar como envelope da campanha", async () => {
    mocks.deletedRows.mockResolvedValueOnce({
      data: [{ id: "unexpected", points: { ...publication, campaignId: "campanha-1", campaignNumber: 1 } }],
      error: null,
    });

    const response = await DELETE(deleteRequest("campanha-2-outono-2026", "campanha-2-outono-2026"));

    expect(response.status).toBe(503);
  });
});

function uploadRequest(selectedCampaign: string | undefined = "campanha-2-outono-2026") {
  const formData = new FormData();
  formData.set("file", new File(["xlsx"], "campanha-2.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  if (selectedCampaign) formData.set("selectedCampaign", selectedCampaign);
  return new Request("http://local.test/api/imports/results", { method: "POST", body: formData });
}

function deleteRequest(campaignId: string | undefined, confirmation: string | undefined) {
  return new Request("http://local.test/api/imports/results", {
    method: "DELETE",
    headers: { "content-type": "application/json", origin: "http://local.test" },
    body: JSON.stringify({ campaignId, confirmation }),
  });
}

function parsedResult(publicationStatus: "draft" | "published") {
  return {
    fileName: "campanha-2.xlsx", worksheetName: "Banco_consolidado", rankingWorksheetName: "Ranking_score_pontos",
    rowCount: 1, sheetCount: 5, columnCount: 22, expectedColumnCount: 22, headers: [], matchedHeaders: 22,
    markers: ["16S"], analyzedSets: ["Cianobactérias"], speciesCount: 1, fallbackSampleIdCount: 0, discardedOriginalCoordinateCount: 0, warnings: [], riskRows: [], molecularRows: [], rankingRows: [], viewModel,
    metadata: {
      schemaVersion: RESULTS_SCHEMA_VERSION, campaignId: "campanha-2", campaignNumber: 2,
      campaignTitle: "Campanha 2", publicationStatus, methodology: { origin: "Método homologado", version: "1" },
    },
  };
}
