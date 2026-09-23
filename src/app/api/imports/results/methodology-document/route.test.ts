import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:mocks.auth}));
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:()=>({})}));
vi.mock("@/lib/results-methodology-document",()=>({readMethodologyDocument:mocks.read}));
import * as route from "./route";
import {ResultsStoreError} from "@/lib/results-publication-store";
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({ok:true});});
it("exports no POST or mutation and requires authorization before reading",async()=>{
  expect(route).not.toHaveProperty("POST");mocks.auth.mockResolvedValue({ok:false,response:Response.json({}, {status:401})});
  expect((await route.GET(new Request("http://localhost/api"))).status).toBe(401);expect(mocks.read).not.toHaveBeenCalled();
});
it("returns missing only from authoritative reader, with private no-store",async()=>{
  mocks.read.mockResolvedValue({status:"missing",document:null});const response=await route.GET(new Request("http://localhost/api"));
  expect(response.headers.get("cache-control")).toBe("private, no-store");expect(await response.json()).toEqual({status:"missing",document:null});expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request),"data.view");
});
it("reports persistence pending explicitly rather than claiming missing or saved",async()=>{
  mocks.read.mockRejectedValue(new ResultsStoreError("methodology_persistence_pending",503,"Pending"));
  const response=await route.GET(new Request("http://localhost/api"));expect(response.status).toBe(503);expect(await response.json()).toMatchObject({status:"persistence_pending",persistencePending:true});
});
