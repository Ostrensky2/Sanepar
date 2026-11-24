import { beforeEach,expect,it,vi } from "vitest";
const access=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/api-auth",()=>({requireApiSession:access}));
import { GET } from "./route";
const request=(q:string)=>new Request("http://localhost/api/results/capture-index/effects?"+q);
beforeEach(()=>{access.mockReset();access.mockResolvedValue({ok:true});});
it("exige leitura autorizada antes de retornar dados",async()=>{
  access.mockResolvedValue({ok:false,response:new Response(null,{status:403})});
  const r=request("campaign=1");
  expect((await GET(r)).status).toBe(403);
  expect(access).toHaveBeenCalledWith(r,"data.view");
});
it("aceita somente a campanha, sem seletor de ponto",async()=>{
  for(const q of ["","campaign=0","campaign=1&campaign=2","campaign=1&sia=fixture"])
    expect((await GET(request(q))).status).toBe(422);
});
it("entrega somente agregados privados, inclusive o estado de campanha sem linhas",async()=>{
  const r=await GET(request("campaign=1")), data=await r.json();
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(data.summary.observations).toBe(73);
  for(const [campaign,denominator,health,environment,residue] of [[1,73,36,16,259],[2,75,59,18,195],[3,76,40,12,272]]){
    const {summary}=await (await GET(request("campaign="+campaign))).json();
    expect(summary.unmappedContributions).toBe(residue);
    for(const [id,positive] of [["cyanotoxins",health],["animal-toxicity",environment]] as const){
      const entry=summary.effects.find((e:{id:string})=>e.id===id);
      expect([entry.component,entry.denominator,entry.counts.winning+entry.counts.other]).toEqual(["16S",denominator,positive]);
    }
  }
  expect(JSON.stringify(data)).not.toMatch(/"(?:sia|rows|taxon|ficha|waterBody|coordinates)":/);
  const empty=await (await GET(request("campaign=4"))).json();
  expect(empty.summary.observations).toBe(0);
  expect(empty.summary.effects.every((e:{counts:unknown})=>e.counts===null)).toBe(true);
});
