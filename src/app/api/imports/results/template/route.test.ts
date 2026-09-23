import { beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),local:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:()=>({rpc:async()=>({data:null,error:null})})}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:m.auth}));
vi.mock("@/lib/results-source-preview",()=>({localSourcePreviewAllowed:m.local,readExactPreviewDownload:m.read}));
import {GET} from "./route";
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true});m.local.mockReturnValue(true);m.read.mockResolvedValue({bytes:Buffer.from("exact"),fileName:"source.xlsx",sha256:"hash"});});
it("denies anonymous before filesystem",async()=>{m.auth.mockResolvedValue({ok:false,response:Response.json({}, {status:401})});expect((await GET(new Request("http://localhost/x"))).status).toBe(401);expect(m.read).not.toHaveBeenCalled();});
it("does not substitute preview for unrecoverable published source",async()=>{expect((await GET(new Request("http://localhost/x?source=published&campaignCode=C1&publicationId=11111111-1111-4111-8111-111111111111&sourceHash="+"a".repeat(64)))).status).toBe(409);expect(m.read).not.toHaveBeenCalled();});
it("downloads exact bytes only for explicit source/hash with permission",async()=>{
 const r=await GET(new Request("http://localhost/x?source=local-corrected-preview&sourceHash=hash&campaignCode=C3"));
 expect(m.auth).toHaveBeenCalledWith(expect.any(Request),"data.import");
 expect(m.read).toHaveBeenCalledWith("hash","C3");expect(await r.text()).toBe("exact");
 expect(r.headers.get("X-Export-Scope")).toBe("complete-source-workbook");
});
