import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), published: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/private-campaign-points", () => ({ readPrivateCampaignPoints: mocks.read }));
vi.mock("@/lib/supabase", () => ({ getLatestPublishedCampaignImport: mocks.published }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ok:true}); mocks.read.mockReturnValue([]); mocks.published.mockResolvedValue(null); });
it("denies anonymous before private read", async () => {
  mocks.auth.mockResolvedValue({ok:false,response:new Response(null,{status:401})});
  expect((await GET(new Request("http://localhost/x"))).status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.published).not.toHaveBeenCalled();
});
it("deduplicates options without exposing media or coordinates", async () => {
  const point={waterBody:"Synthetic",code:"SIA-0001",municipality:"Test",photoUrl:"private",effective:{lat:1,lon:2}};
  mocks.read.mockReturnValue([point,point]);
  const response=await GET(new Request("http://localhost/x"));
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect((await response.json()).options).toEqual([{id:"sia 0001|synthetic|test",locationName:"Synthetic",sia:"SIA-0001",municipality:"Test"}]);
});
it("uses authoritative publication if private fallback unavailable", async () => {
  mocks.published.mockResolvedValue({points:[{code:"SIA-0002"}]});
  expect((await GET(new Request("http://localhost/x"))).status).toBe(200);
});
it("reports unavailable instead of embedding a source", async () => {
  expect((await GET(new Request("http://localhost/x"))).status).toBe(503);
});
