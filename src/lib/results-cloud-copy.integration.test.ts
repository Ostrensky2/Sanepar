import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPublishedResultsSource, readResultsSnapshot, resultsInventory } from "./results-publication-store";

const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:async()=>({ok:true})}));
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:()=>({rpc:m.rpc})}));
import { GET } from "@/app/api/imports/results/route";

// Opt-in only after E7 restore PASS + E6 isolated migration PASS. No local/remote fallback.
const container=process.env.YVAE_CLOUD_COPY_CONTAINER;
const database=process.env.YVAE_CLOUD_COPY_DATABASE;
const ids={C1:"efc4cf10-4af8-4a7c-8fc4-cc93c0836b67",C2:"ce048c72-3735-4917-9ac3-2ca002a79a7a"};
const fingerprint=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function select(query:string) {
  if(!container || !database || !/^[\w-]+$/.test(container) || !/^[\w-]+$/.test(database)) throw Error("Explicit isolated container/database required");
  const output=execFileSync("docker",["exec",container,"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",database,"-c",`BEGIN READ ONLY; SET LOCAL ROLE service_role; ${query}; ROLLBACK;`],{encoding:"utf8",maxBuffer:64*1024*1024});
  return JSON.parse(output.trim());
}
describe.skipIf(!container || !database)("restored CLOUD only, guarded port 55433, read-only API rehearsal",()=>{
  beforeAll(()=>{
    const inspect=JSON.parse(execFileSync("docker",["inspect",container!],{encoding:"utf8"}))[0];
    const bindings=inspect.HostConfig.PortBindings?.["5432/tcp"];
    if(!Array.isArray(bindings)||bindings.length!==1||bindings[0].HostPort!=="55433"||bindings[0].HostIp!=="127.0.0.1") throw Error("Refusing anything except isolated 127.0.0.1:55433");
    m.rpc.mockImplementation(async(name:string,args?:Record<string,unknown>)=>{
      if(name==="read_results_inventory") return {data:select("SELECT public.read_results_inventory()")};
      if(name!=="read_results_source"||!args||!/^C[12]$/.test(String(args.p_campaign_code))||!Object.values(ids).includes(String(args.p_publication_id))||args.p_source_sha256!==null) throw Error("Only exact restored legacy read RPCs permitted");
      return {data:select(`SELECT public.read_results_source('${args.p_campaign_code}', '${args.p_publication_id}'::uuid, NULL, ${args.p_include_bytes===true})`)};
    });
  });
  it("preserves all three cloud rows, exposes two original V1 models and the 69-row history",async()=>{
    const client={rpc:m.rpc} as unknown as SupabaseClient;
    const before=await readResultsSnapshot(client);
    expect(before.publications.map(row=>row.id).sort()).toEqual([ids.C1,ids.C2,"9d88ebd4-68ca-459f-b416-2f3146a39b99"].sort());
    const inventory=resultsInventory(before);
    expect(inventory.publishedCount).toBe(2);
    expect(inventory.historicalPublications).toMatchObject([{publicationId:"9d88ebd4-68ca-459f-b416-2f3146a39b99",format:"legacy-array",campaignCode:null,recordCount:69}]);
    for(const [code,id] of Object.entries(ids)) {
      const response=await GET(new Request(`http://isolated.invalid/api/imports/results?campaignNumber=${code.slice(1)}`));
      const dto=await response.json();
      expect(response.status).toBe(200);
      expect(dto.format).toBe("legacy-v1");
      expect(dto.publicationId).toBe(id);
      const original=before.publications.find(row=>row.id===id)!.points;
      expect(fingerprint(dto.publication)).toBe(fingerprint(original));
      expect(dto.sourceAvailability).toBe("missing_source_artifact");
      await expect(readPublishedResultsSource(client,new URLSearchParams({campaignCode:code,publicationId:id}),true)).rejects.toMatchObject({status:409,code:"missing_source_artifact"});
    }
    expect(fingerprint(await readResultsSnapshot(client))).toBe(fingerprint(before));
  },30000);
});
