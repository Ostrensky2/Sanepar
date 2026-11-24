import { beforeEach, expect, it, vi } from "vitest";
const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({ requireApiSession: access }));
import { DELETE, GET, POST } from "./route";

const request = (query: string, init?: RequestInit) => new Request("http://localhost/api/imports/results" + query, init);
beforeEach(() => { access.mockReset(); access.mockResolvedValue({ ok: true }); });

it("exige sessão antes de responder", async () => {
  access.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
  expect((await GET(request("?inventory=1"))).status).toBe(401);
  expect((await POST(request("", { method: "POST" }))).status).toBe(401);
});

it("não lê a planilha antiga: inventário vazio e campanha sem publicação", async () => {
  const inventory = await (await GET(request("?inventory=1"))).json();
  expect(inventory).toMatchObject({ campaigns: [], publishedCount: 0, totalCampaigns: 9, historicalPublications: [] });
  expect(Object.values(inventory.expectedHeads)).toEqual(Array(9).fill(null));
  for (const query of ["?campaignId=campanha-1&campaignNumber=1", "?campaignNumber=2"])
    expect(await (await GET(request(query))).json()).toEqual({ status: "empty", publication: null, campaign: null, viewModel: null });
  expect((await GET(request(""))).status).toBe(400);
});

it("não aceita publicar, preparar nem excluir pelo fluxo antigo", async () => {
  for (const response of [await POST(request("", { method: "POST" })), await DELETE(request("", { method: "DELETE" })), await GET(request("?source=preparation"))]) {
    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe("legacy_results_retired");
  }
  expect(access).toHaveBeenCalledWith(expect.anything(), "data.import");
  expect(access).toHaveBeenCalledWith(expect.anything(), "data.delete");
});
