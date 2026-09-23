import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),local:vi.fn()}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:m.auth}));
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:()=>({rpc:m.rpc})}));
vi.mock("@/lib/results-source-preview",()=>({localSourcePreviewAllowed:()=>false,getAuditedSource:m.local,getResultsSourcePreview:m.local,readExactPreviewDownload:m.local,selectSourcePreview:m.local,tableRows:m.local}));
import { GET as preview } from "./source-preview/route";
import { GET as analytics } from "./source-analytics/route";
import { GET as template } from "./template/route";
import { GET as research } from "./research/route";
const query="source=published&campaignCode=C1&publicationId=11111111-1111-4111-8111-111111111111";
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true});m.rpc.mockResolvedValue({data:{availability:"missing_source_artifact",sourceSha256:null}});});
it.each([preview,analytics,template,research])("reports missing source without an alternative local file or false empty",async get=>{
 const response=await get(new Request(`http://localhost/api/imports/results?${query}`));
 expect(response.status).toBe(409);
 expect(await response.json()).toMatchObject({code:"missing_source_artifact"});
 expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.local).not.toHaveBeenCalled();
});
it.each([preview,analytics,template,research])("keeps authorization before the source lookup",async get=>{
 m.auth.mockResolvedValue({ok:false,response:new Response(null,{status:401})});
 expect((await get(new Request(`http://localhost/api/imports/results?${query}`))).status).toBe(401);
 expect(m.rpc).not.toHaveBeenCalled();expect(m.local).not.toHaveBeenCalled();
});
