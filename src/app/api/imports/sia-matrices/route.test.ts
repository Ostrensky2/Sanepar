import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), references: vi.fn(), privatePoints: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createOptionalSupabaseClient: () => ({ rpc: mocks.rpc, from: () => { const query = { select: () => query, gt: () => query, order: () => query, returns: () => mocks.references() }; return query; } }) }));
vi.mock("@/lib/private-campaign-points", () => ({ readPrivateCampaignPoints: mocks.privatePoints }));
import { GET, POST } from "./route";
const actor = "11111111-1111-4111-8111-111111111111";
const sheets = [{ campaign: 1, marker: "16S", run: "miseq", rank: "familias", sheet: "matrix", headers: ["Taxon"], rows: [{ sia: "SIA-0011", collection: "diary-real", values: [0] }] }];
const request = (body: unknown) => new Request("http://local/api/imports/sia-matrices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
describe("acervo privado de matrizes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ ok: true, session: { authUserId: actor, userId: "different-profile-id" } });
    mocks.rpc.mockResolvedValue({ data: { planDigest: "a".repeat(64), payloadHash: "b".repeat(64), new: 1, changed: 0, unchanged: 0, details: [] }, error: null });
    mocks.references.mockResolvedValue({ data: [], error: null, count: 0 }); mocks.privatePoints.mockReturnValue([]);
  });
  it("preview usa ator autenticado, exige data.import e ignora ator recebido", async () => {
    expect((await POST(request({ mode: "preview", sheets, actor: "attacker" }))).status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), "data.import");
    expect(mocks.rpc).toHaveBeenCalledWith("sia_matrix_archive", { p_mode: "preview", p_sheets: sheets, p_actor: actor, p_request: null, p_expected: null });
  });
  it("apply exige confirmação e encaminha CAS/request sem regenerar", async () => {
    expect((await POST(request({ mode: "apply", sheets }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    const body = { mode: "apply", sheets, request: actor, expected: "a".repeat(64) };
    expect((await POST(request(body))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("sia_matrix_archive", expect.objectContaining({ p_request: actor, p_expected: body.expected }));
  });
  it.each(["STALE_PLAN", "REQUEST_CONFLICT"])("conflito %s é 409 sem retry automático", async (code) => {
    mocks.rpc.mockResolvedValue({ error: { message: code } });
    expect((await POST(request({ mode: "preview", sheets }))).status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("recusa sem sessão, ator fictício e mais de uma campanha", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await POST(request({ mode: "preview", sheets }))).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ ok: true, session: { authUserId: "00000000-0000-0000-0000-000000000000" } });
    expect((await POST(request({ mode: "preview", sheets }))).status).toBe(403);
    expect((await POST(request({ mode: "preview", sheets: [...sheets, { ...sheets[0], campaign: 2 }] }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("limita bytes UTF8 reais mesmo com Content-Length falso", async () => {
    const req = request({ extra: "á".repeat(2_000_001) }); req.headers.set("content-length", "1");
    expect((await POST(req)).status).toBe(413); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("GET paginado não aplica nada e mantém no-store", async () => {
    mocks.rpc.mockResolvedValue({ data: { rows: [], nextAfter: null, revision: "a".repeat(64) }, error: null });
    const response = await GET(new Request("http://local/api/imports/sia-matrices?campaign=2"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("sia_matrix_archive_page", { p_campaign: 2, p_after: null, p_limit: 20, p_revision: null });
    expect(await response.json()).toEqual({ groups: [], next: null, revision: "a".repeat(64) });
  });
  it("referência de outra campanha não bloqueia fallback da campanha solicitada", async () => {
    mocks.references.mockResolvedValue({ data: [{ id: "other", points: [{ campaign: "2", code: "11" }] }], error: null, count: 1 });
    mocks.privatePoints.mockReturnValue([{ campaign: "1", code: "11", original: { lat: -25, lon: -49 }, effective: null, date: "2026-01-01" }]);
    const response = await GET(new Request("http://local/api/imports/sia-matrices?campaign=1&references=1"));
    const value = await response.json();
    expect(value.status).toBe("historical_fallback"); expect(value.references).toHaveLength(1); expect(value.references[0].campaign).toBe(1);
  });
  it("erro publicado e fonte ausente/hash inválido não viram vazio confirmado", async () => {
    mocks.references.mockResolvedValueOnce({ data: null, error: { message: "failure" }, count: null });
    expect((await GET(new Request("http://local/api/imports/sia-matrices?campaign=1&references=1"))).status).toBe(503);
    expect(mocks.privatePoints).not.toHaveBeenCalled();
    expect((await GET(new Request("http://local/api/imports/sia-matrices?campaign=1&references=1"))).status).toBe(503);
  });
  it("references usa union das fontes de campo sem fonte técnica, RPC ou escrita", async () => {
    mocks.references.mockResolvedValue({ data: [
      { id: "technical", file_name: "__lab_risk_results__", points: [{ campaign: "1", code: "106", date: "01/01/2026" }] },
      { id: "a", file_name: "campo.xlsx", points: [{ campaign: "1", code: "106", date: "07/03/2026" }] },
      { id: "b", file_name: "sintese.xlsx", points: [{ campaign: "1", code: "146", date: "03/03/2026" }] },
    ], error: null, count: 3 });
    const response = await GET(new Request("http://local/api/imports/sia-matrices?campaign=1&references=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    expect(result.references.map((p: { sourceId: string }) => p.sourceId)).toEqual(["a", "b"]);
    expect(mocks.privatePoints).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
