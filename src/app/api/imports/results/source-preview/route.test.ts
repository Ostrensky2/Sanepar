import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), allowed: vi.fn(), read: vi.fn(), stored:vi.fn(),select:vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/results-source-preview", () => ({ localSourcePreviewAllowed: mocks.allowed, getResultsSourcePreview: mocks.read,selectSourcePreview:mocks.select }));
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:()=>({})}));
vi.mock("@/lib/results-publication-store",async original=>({...await original<typeof import("@/lib/results-publication-store")>(),readPublishedResultsSource:mocks.stored}));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.allowed.mockReturnValue(true); mocks.auth.mockResolvedValue({ ok: true }); mocks.read.mockResolvedValue({ source: { published: false } }); });
it("blocks external request before auth/file read", async () => {
  mocks.allowed.mockReturnValue(false);
  expect((await GET(new Request("https://external.test/x"))).status).toBe(403);
  expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it("requires privilege before reading the source", async () => {
  mocks.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 403 }) });
  expect((await GET(new Request("http://localhost/x"))).status).toBe(403);
  expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), "data.import");
  expect(mocks.read).not.toHaveBeenCalled();
});
it("returns explicit nonpublished preview without cache", async () => {
  const response = await GET(new Request("http://localhost/x"));
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ source: { published: false } });
});
it("uses the head-bound persisted source outside local preview without filesystem fallback",async()=>{
  mocks.allowed.mockReturnValue(false);
  const source={kind:"published",published:true,publicationId:"synthetic",sha256:"abc",fileName:"synthetic.xlsx"};
  mocks.stored.mockResolvedValue({model:{},parsed:{campaigns:[{campaignCode:"C3"}],warnings:[]},source});
  mocks.select.mockReturnValue({rows:[],campaignCode:"C3"});
  const response=await GET(new Request("https://example.test/api/imports/results/source-preview?source=published&campaignCode=C3"));
  expect(response.status).toBe(200);expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request),"data.view");
  expect(mocks.read).not.toHaveBeenCalled();expect((await response.json()).source).toEqual(source);
});
