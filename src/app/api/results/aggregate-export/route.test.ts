import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ ok: true }); });
it("requires existing read permission and exports per-campaign statistics only", async () => {
  const req = new Request("https://example.test/api/results/aggregate-export"), response = await GET(req);
  expect(mocks.auth).toHaveBeenCalledWith(req, "data.view"); expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-disposition")).toContain("resultados-metodo-3.0-por-campanha-C1-C2-C3.csv");
  expect(response.headers.get("x-export-scope")).toBe("per-campaign");
  expect((await response.text()).split("\r\n")).toHaveLength(14);
});
it("denies anonymous and cannot request nominal data or comparators", async () => {
  mocks.auth.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });
  expect((await GET(new Request("https://example.test/api/results/aggregate-export"))).status).toBe(401);
  for (const query of ["sia=1", "format=audit", "group=C4", "group=total", "group=C1&group=C2", "source=historico07", "format=json&format=csv"]) expect((await GET(new Request(`https://example.test/api/results/aggregate-export?${query}`))).status).toBe(422);
});
it("JSON projection contains only allowed group and four aggregate series", async () => {
  const response = await GET(new Request("https://example.test/api/results/aggregate-export?format=json&group=C2"));
  const dto = await response.json(); expect(Object.keys(dto.grupos)).toEqual(["C2"]);
  expect(Object.keys(dto.grupos.C2)).toEqual(["geral08", "ambiental", "operacional", "saude"]);
  expect(dto.grupos.C2.geral08).toMatchObject({ observados: 76, numericos: 75, nulos: 1 });
  expect(dto.sourceSha256).toBe("5667da69789821f2744812e516282e54fdb73008e8cdb80051801931af455308");
  expect(dto.politica).toBe("sinal-documentado/1");
});
