import { expect,it,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentResultsPublication, readPublishedResultsSource,resultsInventory,selectExpectedHeads } from "./results-publication-store";
import { legacyPublication } from "./__tests__/fixtures/results-legacy";
const hash="a".repeat(64),id="11111111-1111-4111-8111-111111111111";
const query=new URLSearchParams({campaignCode:"C1",publicationId:id,sourceHash:hash});
it("binds reads to current head and never includes another campaign from the binary",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{sourceSha256:hash,fileName:"synthetic.xlsx",parsed:{source:{sha256:hash},campaigns:[{campaignCode:"C1"},{campaignCode:"C2"}]},model:{campaignCodes:["C1","C2"],sheets:[]}}});
 const data=await readPublishedResultsSource({rpc} as unknown as SupabaseClient,query);
 expect(rpc).toHaveBeenCalledWith("read_results_source",{p_campaign_code:"C1",p_publication_id:id,p_source_sha256:hash,p_include_bytes:false});
 expect(data.parsed.campaigns).toEqual([{campaignCode:"C1"}]);expect(data.model.campaignCodes).toEqual(["C1"]);expect(data.bytes).toBeUndefined();
});
it("refuses old head or unavailable artifact, without a local fallback",async()=>{
 const rpc=vi.fn().mockResolvedValue({error:{code:"40001"}});
 await expect(readPublishedResultsSource({rpc} as unknown as SupabaseClient,query)).rejects.toMatchObject({status:409,code:"stale_scope"});
 rpc.mockResolvedValue({data:null});await expect(readPublishedResultsSource({rpc} as unknown as SupabaseClient,query)).rejects.toMatchObject({status:409});
});
it("history intersects the artifact with authoritative current campaigns from the same source",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{sourceSha256:hash,currentCampaignCodes:["C1","C2"],fileName:"synthetic.xlsx",parsed:{source:{sha256:hash},campaigns:[{campaignCode:"C1"},{campaignCode:"C2"},{campaignCode:"C3"}]},model:{campaignCodes:["C1","C2","C3"],sheets:[]}}});
 const data=await readPublishedResultsSource({rpc} as unknown as SupabaseClient,query);
 expect(data.parsed.campaigns.map(c=>c.campaignCode)).toEqual(["C1","C2"]);
 expect(data.model.campaignCodes).toEqual(["C1","C2"]);
});
it("never treats malformed bytes as the original export",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{sourceSha256:hash,fileName:"synthetic.xlsx",originalBase64:"ZmFrZQ==",parsed:{source:{sha256:hash},campaigns:[{campaignCode:"C1"}]},model:{sheets:[]}}});
 await expect(readPublishedResultsSource({rpc} as unknown as SupabaseClient,query,true)).rejects.toMatchObject({status:409});
});
it("inventory and expected heads never activate absent campaigns",()=>{
 expect(resultsInventory({heads:{},publications:[],sourceHashes:[]})).toMatchObject({campaigns:[],publishedCount:0,totalCampaigns:9});
 expect(selectExpectedHeads({C1:null,C2:id},["C1"])).toEqual({C1:null});
 expect(()=>selectExpectedHeads({},["C1"])).toThrow();
});

it("keeps legacy heads visible without fabricating a binary hash or V2 counts",()=>{
 const second="22222222-2222-4222-8222-222222222222";
 const publications=[{id,points:legacyPublication(1),created_at:"2026-08-21"},{id:second,points:legacyPublication(2),created_at:"2026-08-21"},{id:"history",points:Array(69).fill({}),created_at:"2026-08-20"}];
 const before=JSON.stringify(publications);
 const inventory=resultsInventory({heads:{C1:id,C2:second},publications,sourceHashes:[]});
 expect(inventory.publishedCount).toBe(2);
 expect(inventory.campaigns.map(c=>c.campaignCode)).toEqual(["C1","C2"]);
 expect(inventory.campaigns[0]).toMatchObject({format:"legacy-v1",source:{sha256:null},counts:{total:1,complete:null},downloadAvailable:false,sourceAvailability:"missing_source_artifact"});
 expect(inventory.expectedHeads).toMatchObject({C1:id,C2:second,C3:null});
 expect(inventory.historicalPublications).toEqual([{publicationId:"history",createdAt:"2026-08-20",format:"legacy-array",campaignCode:null,recordCount:69,sourceAvailability:"unavailable_in_history"}]);
 expect(JSON.stringify(publications)).toBe(before);
});
it("rejects unanchored, duplicated and wrong-campaign heads instead of false empty or fallback",()=>{
 const row={id,points:legacyPublication(),created_at:"2026-08-21"};
 expect(()=>resultsInventory({heads:{},publications:[row],sourceHashes:[]})).toThrow(/vigência/);
 expect(()=>currentResultsPublication({heads:{C2:id},publications:[row],sourceHashes:[]},"C2")).toThrow(/campanha/);
 expect(()=>currentResultsPublication({heads:{C1:id},publications:[row,row],sourceHashes:[]},"C1")).toThrow();
});
it("reports missing legacy source specifically only after verifying the database head",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{availability:"missing_source_artifact",sourceSha256:null}});
 const queryWithoutHash=new URLSearchParams({campaignCode:"C1",publicationId:id});
 await expect(readPublishedResultsSource({rpc} as unknown as SupabaseClient,queryWithoutHash,true)).rejects.toMatchObject({status:409,code:"missing_source_artifact"});
 expect(rpc).toHaveBeenCalledWith("read_results_source",{p_campaign_code:"C1",p_publication_id:id,p_source_sha256:null,p_include_bytes:true});
 rpc.mockResolvedValue({error:{code:"40001"}});
 await expect(readPublishedResultsSource({rpc} as unknown as SupabaseClient,queryWithoutHash)).rejects.toMatchObject({code:"stale_scope"});
});
