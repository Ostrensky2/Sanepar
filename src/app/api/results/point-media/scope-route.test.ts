import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),photos:vi.fn(),byId:vi.fn(),bytes:vi.fn()}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:m.auth}));
vi.mock("@/lib/results/point-media-scope",()=>({authorizedDiaryPointExists:m.scope}));
vi.mock("@/lib/results/point-media",()=>({pointMedia:m.photos,mediaById:m.byId,imageBytes:m.bytes,mediaId:()=>"a".repeat(64)}));
import { GET } from "./route";
const request=(q="campaign=2&sia=123")=>new Request(`http://localhost/api/results/point-media?${q}`);
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true});m.scope.mockResolvedValue(true);m.photos.mockResolvedValue({installed:true,items:[],conflict:false});});
it("checks both permissions before consulting diary or media",async()=>{
  m.auth.mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({ok:false,response:new Response(null,{status:403})});
  expect((await GET(request())).status).toBe(403);
  expect(m.auth.mock.calls.map(c=>c[1])).toEqual(["data.view","campaigns.view"]);
  expect(m.scope).not.toHaveBeenCalled();expect(m.photos).not.toHaveBeenCalled();
});
it("reads photos independently of any historical index",async()=>{
  expect((await GET(request())).status).toBe(200);
  expect(m.scope).toHaveBeenCalledWith(2,123);expect(m.photos).toHaveBeenCalledWith(2,123);
});
it("denies missing registration and rechecks opaque ID scope before bytes",async()=>{
  m.scope.mockResolvedValue(false);
  expect((await GET(request())).status).toBe(404);expect(m.photos).not.toHaveBeenCalled();
  m.byId.mockResolvedValue({campaign:1,sia:456,item:{}});
  expect((await GET(request(`id=${"a".repeat(64)}`))).status).toBe(404);
  expect(m.scope).toHaveBeenLastCalledWith(1,456);expect(m.bytes).not.toHaveBeenCalled();
});
it("fails closed on unavailable diary, without image access",async()=>{
  m.scope.mockRejectedValue(Error("private detail"));
  const response=await GET(request());expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private");expect(m.photos).not.toHaveBeenCalled();
});
