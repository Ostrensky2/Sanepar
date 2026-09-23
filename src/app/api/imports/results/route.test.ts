import { beforeEach, expect, it, vi } from "vitest";
import type { ResultsWorkbookImport } from "@/modules/results";
import { buildResultsPublicationV2,isResultsPublicationV2 } from "@/lib/results-v2-persistence";
import { legacyPublication } from "@/lib/__tests__/fixtures/results-legacy";
const m=vi.hoisted(()=>({auth:vi.fn(),parse:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:m.auth}));
vi.mock("@/modules/results",async original=>({...await original<typeof import("@/modules/results")>(),parseResultsWorkbookWithModelV2:m.parse}));
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:()=>({rpc:m.rpc,from:m.from})}));
import {GET,POST,DELETE} from "./route";
const id="11111111-1111-4111-8111-111111111111", hash="a".repeat(64);
const counts={total:1,complete:1,partialWithTwoSets:0,partialWithOneSet:0,unavailable:0};
const parsed={contractVersion:"yvae-results/2.0",calculationVersion:"SANEPAR-INDICE-0.3",catalogVersion:"SANEPAR-RISCOS-0.3",source:{sha256:hash,fileName:"synthetic.xlsx",namespaceRepairApplied:false},campaigns:["C1","C2","C3"].map(campaignCode=>({campaignCode,points:[],counts})),warnings:[],molecularRecordCount:3,componentRecordCount:3,parameters:{severityExponent:1,alpha:100,requiredSetCount:3,domainCount:3}} satisfies ResultsWorkbookImport;
function request(codes=["C1","C2"],heads:unknown={C1:null,C2:null,C3:null},sha=hash){
 const body=new FormData(); body.set("file",new File(["synthetic"],"synthetic.xlsx"));body.set("requestId",id);body.set("sourceSha256",sha);body.set("expectedHeads",JSON.stringify(heads));codes.forEach(c=>body.append("selectedCampaigns",c));return new Request("http://localhost/api/imports/results",{method:"POST",body});
}
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true});m.parse.mockResolvedValue({parsed,model:{sheets:[]}});m.rpc.mockResolvedValue({data:{state:"published",publicationId:id,heads:{}},error:null});});
it("uses only the transaction RPC and scopes C3 without merging old points",async()=>{
 const response=await POST(request(["C3"]));expect(response.status).toBe(200);expect(m.from).not.toHaveBeenCalled();
 expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.rpc.mock.calls[0][0]).toBe("publish_results_snapshot");
 const args=m.rpc.mock.calls[0][1];expect(args.p_publication.campaigns.map((c:{campaignCode:string})=>c.campaignCode)).toEqual(["C3"]);
 expect(args.p_parsed.campaigns).toHaveLength(3);expect(args.p_expected_heads).toEqual({C3:null});
});
it("submits selected campaigns in a single atomic call",async()=>{
 expect((await POST(request(["C1","C2","C3"]))).status).toBe(200);expect(m.rpc).toHaveBeenCalledTimes(1);
 expect(m.rpc.mock.calls[0][1].p_publication.scope.campaignCodes).toEqual(["C1","C2","C3"]);
});
it.each([{codes:[]},{codes:["C9"]}])("rejects empty or absent selected scope $codes before write",async ({codes})=>{expect((await POST(request(codes))).status).toBe(422);expect(m.rpc).not.toHaveBeenCalled();});
it.each([null,{}, {C1:"bad",C2:null}])("rejects missing or malformed expected heads %j",async heads=>{expect((await POST(request(undefined,heads))).status).toBe(422);expect(m.rpc).not.toHaveBeenCalled();});
it("rejects changed source and invalid file with zero writes",async()=>{
 expect((await POST(request(undefined,undefined,"b".repeat(64)))).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled();
 m.parse.mockRejectedValue(new Error("Invalid workbook"));expect((await POST(request())).status).toBe(422);expect(m.rpc).not.toHaveBeenCalled();
});
it("maps transactional stale conflict and never retries blind",async()=>{m.rpc.mockResolvedValue({error:{code:"40001"}});expect((await POST(request())).status).toBe(409);expect(m.rpc).toHaveBeenCalledTimes(1);});
it("rejects a reused idempotency key with another payload",async()=>{m.rpc.mockResolvedValue({error:{code:"22023",message:"IDEMPOTENCY_KEY_REUSED"}});expect((await POST(request())).status).toBe(409);expect(m.rpc).toHaveBeenCalledTimes(1);});
it("returns unknown failures without claiming rollback",async()=>{m.rpc.mockResolvedValue({error:{code:"57014"}});expect((await POST(request())).status).toBe(503);});
it("requires authorization before decode or write; deletion is fail-closed",async()=>{
 m.auth.mockResolvedValue({ok:false,response:new Response(null,{status:401})});expect((await POST(request())).status).toBe(401);expect(m.parse).not.toHaveBeenCalled();
 m.auth.mockResolvedValue({ok:true});expect((await DELETE(new Request("http://localhost/x",{method:"DELETE"}))).status).toBe(405);expect(m.rpc).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();
});
it("reads authoritative inventory, not browser state",async()=>{
 m.rpc.mockResolvedValue({data:{heads:{},publications:[],sourceHashes:[]},error:null});
 const response=await GET(new Request("http://localhost/api/imports/results?inventory=1"));
 expect(await response.json()).toMatchObject({publishedCount:0,totalCampaigns:9,campaigns:[]});expect(m.rpc).toHaveBeenCalledWith("read_results_inventory");
});
it("returns a consistent single-campaign publication DTO for the authoritative head",async()=>{
 const publication=buildResultsPublicationV2(parsed); publication.publicationId=id;
 m.rpc.mockResolvedValue({data:{heads:{C1:id},publications:[{id,points:publication,created_at:publication.publishedAt}],sourceHashes:[]},error:null});
 const response=await GET(new Request("http://localhost/api/imports/results?campaignNumber=1"));
 const dto=await response.json();expect(response.status).toBe(200);expect(dto.publication.campaigns).toHaveLength(1);
 expect(dto.publication.scope.campaignCodes).toEqual(["C1"]);expect(isResultsPublicationV2(dto.publication)).toBe(true);
});
it("returns the original legacy publication and view model, never a fabricated V2",async()=>{
 const publication=legacyPublication();
 m.rpc.mockResolvedValue({data:{heads:{C1:id},publications:[{id,points:publication,created_at:publication.importedAt}],sourceHashes:[]}});
 const response=await GET(new Request("http://localhost/api/imports/results?campaignNumber=1"));
 const dto=await response.json();
 expect(response.status).toBe(200);expect(dto).toMatchObject({status:"published",format:"legacy-v1",publicationId:id,campaign:null,downloadAvailable:false,sourceAvailability:"missing_source_artifact"});
 expect(dto.publication).toEqual(publication);expect(dto.viewModel).toEqual(publication.viewModel);expect(isResultsPublicationV2(dto.publication)).toBe(false);
});
it("does not hide a legacy publication whose authoritative head has not been installed",async()=>{
 m.rpc.mockResolvedValue({data:{heads:{},publications:[{id,points:legacyPublication(),created_at:"2026-08-21"}],sourceHashes:[]}});
 for(const query of ["campaignNumber=1","inventory=1"]) {
  const response=await GET(new Request(`http://localhost/api/imports/results?${query}`));
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:"legacy_head_unavailable"});
 }
});
it("uses the same authoritative legacy head for explicit V1, with no local HTML fallback",async()=>{
 const publication=legacyPublication();
 m.rpc.mockResolvedValue({data:{heads:{C1:id},publications:[{id,points:publication,created_at:publication.importedAt}],sourceHashes:[]}});
 const response=await GET(new Request("http://localhost/api/imports/results?campaignNumber=1&schemaVersion=yvae-results/1.0"));
 expect(await response.json()).toMatchObject({format:"legacy-v1",publicationId:id,publication});expect(m.from).not.toHaveBeenCalled();
});
it.each(["campaignNumber=99","campaignId=unknown&campaignNumber=1","campaignId=campanha-1-verao-2026&campaignNumber=2"])("rejects incompatible campaign identity %s",async query=>{
 expect((await GET(new Request(`http://localhost/api/imports/results?${query}`))).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled();
});
