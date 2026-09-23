import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),stored:vi.fn(),query:vi.fn(),preparation:vi.fn(),model:vi.fn()}));
vi.mock("@/lib/results-preparation",()=>({readResultsPreparation:mocks.preparation,bibliographyPreparationModel:mocks.model}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:mocks.auth}));
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:()=>({})}));
vi.mock("@/lib/results-research",()=>({queryResultsResearch:mocks.query}));
vi.mock("@/lib/results-publication-store",async original=>({...await original<typeof import("@/lib/results-publication-store")>(),readPublishedResultsSource:mocks.stored}));
import { GET } from "./route";
import { ResultsStoreError } from "@/lib/results-publication-store";
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({ok:true});mocks.stored.mockResolvedValue({model:{},parsed:{},source:{published:true}});mocks.query.mockReturnValue({rows:[]});});
it("requires data.view before any private source read",async()=>{
  mocks.auth.mockResolvedValue({ok:false,response:Response.json({}, {status:401})});
  expect((await GET(new Request("http://localhost/api"))).status).toBe(401);expect(mocks.stored).not.toHaveBeenCalled();
});
it("reads existing head-bound artifact only and prohibits caching",async()=>{
  const r=await GET(new Request("http://localhost/api"));expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request),"data.view");expect(mocks.stored).toHaveBeenCalledTimes(1);
});
it("stale source is 409 with no local fallback",async()=>{
  mocks.stored.mockRejectedValue(new ResultsStoreError("stale_scope",409,"stale"));expect((await GET(new Request("http://localhost/api"))).status).toBe(409);expect(mocks.query).not.toHaveBeenCalled();
});
it("independent revision never reads or fabricates a campaign publication",async()=>{
  const hash="d".repeat(64);mocks.preparation.mockResolvedValue({revisionHash:hash,packageKey:"test",manifest:{files:[]}});mocks.model.mockReturnValue({});
  const r=await GET(new Request(`http://localhost/api?source=preparation&revisionHash=${hash}`));
  expect(r.status).toBe(200);expect(mocks.stored).not.toHaveBeenCalled();expect(mocks.query).toHaveBeenCalledWith({},null,expect.objectContaining({published:false,publicationId:null,revisionHash:hash}),expect.any(URLSearchParams));
});
it("missing preparation schema is honestly 503, not a published fallback",async()=>{
  mocks.preparation.mockRejectedValue(new ResultsStoreError("preparation_unavailable",503,"schema absent"));
  expect((await GET(new Request(`http://localhost/api?source=preparation&revisionHash=${"a".repeat(64)}`))).status).toBe(503);expect(mocks.stored).not.toHaveBeenCalled();
});
