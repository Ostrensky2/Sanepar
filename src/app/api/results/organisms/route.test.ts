import { beforeEach, expect, it, vi } from "vitest";
import type { OrganismDocument } from "@/lib/results-organisms";

const access = vi.hoisted(() => vi.fn());
const load = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({ requireApiSession: access }));
vi.mock("@/lib/results-organisms", async original => ({ ...(await original<typeof import("@/lib/results-organisms")>()), organismDocument: load }));
import { GET } from "./route";

// Documento sintético (nenhum dado real): dois pontos, um gênero com ficha no índice e uma exótica.
const point = (sia: string, total: number) => ({ sia, corrida: "MiSeq", total, inconclusiva: false });
const document: OrganismDocument = { campaign: 2, fonte: { id: "a".repeat(64), arquivo: "sintetica.xlsx" }, marcadores: {
  "16S": { pontos: [point("1", 100), point("2", 200)], niveis: { risco: [{ nome: "Toxinas", ocorrencias: [[0, 10]] }], genero: [{ nome: "Microcystis", ocorrencias: [[0, 10], [1, 40]] }, { nome: "Cedecea", ocorrencias: [[1, 5]] }], familia: [] } },
  COI: { pontos: [point("1", 50)], niveis: { exoticas: [{ nome: "Limnoperna fortunei", categoria: "confirmada", ocorrencias: [[0, 5]] }], genero: [{ nome: "Limnoperna", ocorrencias: [[0, 5]] }], familia: [] } },
} };
const request = (query: string) => new Request("http://localhost/api/results/organisms?" + query);
beforeEach(() => { access.mockReset(); access.mockResolvedValue({ ok: true }); load.mockReset(); load.mockImplementation(async (campaign: number) => campaign === 2 ? document : null); });

it("exige leitura autorizada antes de abrir a planilha", async () => {
  access.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
  const r = request("campaign=2");
  expect((await GET(r)).status).toBe(403);
  expect(access).toHaveBeenCalledWith(r, "data.view");
  expect(load).not.toHaveBeenCalled();
});

it("recusa opções inválidas, campanha sem planilha e acervo indisponível", async () => {
  for (const query of ["", "campaign=0", "campaign=2&campaign=3", "campaign=2&marker=18S", "campaign=2&marker=16S&level=exoticas", "campaign=2&marker=COI&level=risco", "campaign=2&especie=1", "campaign=2&taxon="])
    expect((await GET(request(query))).status).toBe(422);
  expect(load).not.toHaveBeenCalled();
  const missing = await GET(request("campaign=4"));
  expect(missing.status).toBe(404);
  expect((await missing.json()).error).toContain("Planilhas de resultados");
  expect((await GET(request("campaign=2&marker=COI&level=genero&taxon=Dalbulus"))).status).toBe(404);
  load.mockRejectedValue(new Error("PRIVATE_STORE_UNAVAILABLE"));
  expect((await GET(request("campaign=2"))).status).toBe(503);
});

it("lista um nível por consulta e marca só os organismos com ficha que pontua", async () => {
  const response = await GET(request("campaign=2&marker=16S&level=genero")), data = await response.json();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(data).toMatchObject({ campaign: 2, marker: "16S", level: "genero", source: "sintetica.xlsx" });
  expect(data.summary["16S"]).toMatchObject({ points: 2, usablePoints: 2 });
  expect(data.rows.map((row: { name: string }) => row.name)).toEqual(["Microcystis", "Cedecea"]);
  expect(data.rows[0]).toMatchObject({ points: 2, reads: 50, sias: ["1", "2"], maxShare: 0.2, maxShareSia: "2", effects: [{ id: "CUR-Microcystis-S", domain: "Saúde humana" }] });
  expect(data.rows[1].effects).toEqual([]);                  // Cedecea: ficha contestada, não pontua
  const exotics = await (await GET(request("campaign=2&marker=COI&level=exoticas"))).json();
  expect(exotics.rows[0]).toMatchObject({ name: "Limnoperna fortunei", category: "confirmada", effects: [{ id: "CUR-Limnoperna-O", domain: "Operacional" }] });
  const where = await (await GET(request("campaign=2&marker=16S&level=genero&taxon=Microcystis"))).json();
  expect(where.rows).toEqual([{ sia: "2", reads: 40, total: 200, share: 0.2, run: "MiSeq", inconclusive: false }, { sia: "1", reads: 10, total: 100, share: 0.1, run: "MiSeq", inconclusive: false }]);
});
