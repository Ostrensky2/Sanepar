import { expect,it } from "vitest";
import {aggregateSource,descriptive} from "./results-source-analytics";
import type {ResultsWorkbookImport} from "@/modules/results/types";
const point=(sia:string,included=true,value:number|null=0.5)=>({siaCode:sia,usedSetCount:value===null?2:3,overall:{value},components:{coi:{included}},municipality:"M",waterBody:"W"});
const parsed={source:{sha256:"abc"},calculationVersion:"0.3",catalogVersion:"0.3",campaigns:[{campaignCode:"C3",points:[point("SIA-1"),point("SIA-2"),point("SIA-3",false,null),point("SIA-4")],counts:{}}]} as unknown as ResultsWorkbookImport;
const row=(sia:string,taxon:string,reads:number)=>({Campanha:"C3","Cód. SIA":sia,"Espécie":taxon,"Número de Reads":reads,"Conjunto analisado":"COI"});
const rows=[row("SIA-1","A",10),row("SIA-1","B",90),row("SIA-2","A",0),row("SIA-2","B",50),row("SIA-3","A",20)];
const query=(more="")=>new URLSearchParams("sourceHash=abc&campaignCode=C3&set=coi&"+more);
it("preserves the actual molecular worksheet name in metadata provenance",()=>{
 expect(aggregateSource(parsed,rows,[],query("sia=SIA-1"),"Metadados").pointMetadata[0].source.sheet).toBe("Metadados");
});
it("preserves full denominators through taxon search and TopN; frequency counts positive SIAs",()=>{
 const dto=aggregateSource(parsed,rows,[],query("q=A&topN=1"));
 expect(dto.topReads[0]).toEqual({taxon:"A",reads:30,positivePoints:2,denominatorPoints:3});
 expect(dto.heatmap.cells.find(c=>c.sia==="SIA-1")?.proportion).toBe(.1);
 expect(dto.heatmap.cells.map(c=>c.state)).toEqual(["observed","zero","unusable","absent"]);
 expect(dto.summary.records).toBe(5);
});
it("keeps null score and computes Q only in the original point/set denominator",()=>{
 const dto=aggregateSource(parsed,rows,[{"Organismo do banco":"A","Score ambiental":3},{"Organismo do banco":"B","Score ambiental":null}],query("sia=SIA-1"));
 expect(dto.contributions.find(c=>c.taxon==="A"&&c.domain==="ambiental")?.q).toBe(.1);
 expect(dto.contributions.find(c=>c.taxon==="B"&&c.domain==="ambiental")?.q).toBeNull();
 expect(dto.history[0].point?.siaCode).toBe("SIA-1");
});
it("distinguishes N zero; pages every point/taxon; refuses stale source",()=>{
 const dto=aggregateSource(parsed,[row("SIA-1","A",0)],[],query("pageSize=1"));
 expect(dto.heatmap.cells[0].state).toBe("no-denominator");
 expect(dto.heatmap.pointsTotal).toBe(4);
 expect(()=>aggregateSource(parsed,rows,[],new URLSearchParams("sourceHash=wrong&campaignCode=C3&set=coi"))).toThrow();
 expect(descriptive([])).toEqual({included:0,mean:null,median:null});
 expect(descriptive([1,0])).toEqual({included:2,mean:.5,median:.5});
});
it("lists the dominant taxa of each requested point from the full campaign/set population",()=>{
 const withBacteria=[...rows,{...row("SIA-1","A",7),"Conjunto analisado":"Bactérias"},row("SIA-3","Z",0)];
 const dto=aggregateSource(parsed,withBacteria,[],query("sia=SIA-2&leaders=SIA-1,SIA-3,SIA-9"));
 const empty={reads:0,top:[]};
 expect(dto.pointLeaders).toEqual([
  {sia:"SIA-1",bySet:{coi:{reads:100,top:[{taxon:"B",reads:90},{taxon:"A",reads:10}]},bacteria:{reads:7,top:[{taxon:"A",reads:7}]},cyanobacteria:empty},contributors:[]},
  {sia:"SIA-3",bySet:{coi:{reads:20,top:[{taxon:"A",reads:20}]},bacteria:empty,cyanobacteria:empty},contributors:[]},
  {sia:"SIA-9",bySet:{coi:empty,bacteria:empty,cyanobacteria:empty},contributors:[]},
 ]);
 expect(dto.summary.reads).toBe(50);
 expect(aggregateSource(parsed,rows,[],query()).pointLeaders).toEqual([]);
 expect(()=>aggregateSource(parsed,rows,[],query("leaders=SIA-1,DROP"))).toThrow();
});
it("separates the dominant taxon from the largest contributions to the index",()=>{
 // B domina o conjunto (90 reads) mas não tem score; A tem menos reads e é o único que contribui.
 const catalog=[{"Organismo do banco":"A","Score ambiental":3,"Score saúde humana":1},{"Organismo do banco":"B","Score ambiental":null,"Score saúde humana":null}];
 const [sia1,sia3]=aggregateSource(parsed,rows,catalog,query("leaders=SIA-1,SIA-3")).pointLeaders;
 expect(sia1.bySet.coi.top[0].taxon).toBe("B");
 expect(sia1.contributors.map(c=>[c.taxon,c.domain,c.q])).toEqual([["A","ambiental",.1],["A","saúde humana",.1/3]]);
 // SIA-3 não utiliza o COI no cálculo: nenhuma contribuição é atribuída.
 expect(sia3.contributors).toEqual([]);
});
