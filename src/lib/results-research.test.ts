import { expect, it } from "vitest";
import type { ResultsWorkbookExportModel, ResultsWorkbookImport } from "@/modules/results/types";
import { queryResultsResearch, researchReferenceLinks } from "./results-research";
const source={sha256:"a".repeat(64),publicationId:"synthetic",fileName:"synthetic.xlsx",published:true as const};
const parsed={source,calculationVersion:"SANEPAR-INDICE-0.3",catalogVersion:"SANEPAR-RISCOS-0.3",parameters:{severityExponent:1,alpha:100,requiredSetCount:3,domainCount:3}} as unknown as ResultsWorkbookImport;
const sheet=(name:string,headers:string[],rows:unknown[][],start=4)=>({name,rows:[...Array.from({length:start},()=>[]),headers,...rows]}) as ResultsWorkbookExportModel["sheets"][number];
function fixture():ResultsWorkbookExportModel {
  return {calculationVersion:parsed.calculationVersion,catalogVersion:parsed.catalogVersion,contractVersion:"yvae-results/2.0",campaignCodes:["C1","C2"],sheets:[
    sheet("Riscos_bibliografia",["ID organismo","Organismo do banco","Grupo analítico"],[["T1","Species A","Bactérias; Cianobactérias"],["T2","Species B","Bactérias"],["T3","Species C","COI"]]),
    sheet("Evidencias_risco",["Chave organismo-domínio","ID organismo","Organismo do banco","Domínio","Código do efeito","Score bibliográfico","DOI ou URL","Referências bibliográficas completas","Toxicidade em humanos","Toxicidade em animais","Justificativa do score"],[
      ["T1|A","T1","Species A","Ambiental","A1",2,"https://doi.org/10.1234/example https://example.org/x","DOI 10.1234/example. Unmatched block.","Human limits","Animal limits","Score rationale"],
      ["T1|O","T1","Species A","Operacional","O5","NA","https://doi.org/10.1234/example","DOI 10.1234/example"],
    ]),
    sheet("Criterios_scores",["Código","Domínio","Nome","Escopo"],[["A1","Ambiental","Efeito ambiental","Limites ambientais"],["O5","Operacional","Gosto e odor","Limites operacionais"]],31),
    sheet("Metadados",["Campanha","Cód. SIA","Conjunto analisado","Espécie","Número de Reads","% Reads"],[["C1","SIA-0001","Bactérias","Species A",10,10],["C1","SIA-0001","Bactérias","Species B",90,90],["C2","SIA-0001","Bactérias","Species A",5,100]],0),
    sheet("Calculo_conjuntos",["Campanha","Ponto","Conjunto","Total de reads","Situação analítica","Incluir na síntese (0/1)","Motivo / observação analítica"],[["C1","SIA-0001","Bactérias",100,"Inconclusivo",0,"Razão explícita"]]),
    sheet("Metodo_calculo",["Regra","Valor","Explicação"],[["N","Todos os reads","Metadata-C2 preservada na origem"]],0),
  ]};
}
const run=(extra="",model=fixture())=>queryResultsResearch(model,parsed,source,new URLSearchParams(extra));
it("preserves NA, multi-group unique counts, complete semantic evidence and provenance",()=>{
  const dto=run();expect(dto.counts).toMatchObject({organisms:1,associations:2});
  expect(dto.rows[1].values.score).toBe("NA");expect(dto.rows[0].values.analyticalGroups).toEqual(["Bactérias","Cianobactérias"]);
  expect(dto.rows[0].values).toMatchObject({humanToxicity:"Human limits",animalToxicity:"Animal limits",scoreJustification:"Score rationale"});
  expect(run("catalogScope=without-association").counts.organisms).toBe(2);
  expect(run("catalogScope=scored").counts.associations).toBe(1);
});
it("requires all association filters to match one association, never cross-product; OR remains valid",()=>{
  expect(run("section=occurrences&filter.domain=Ambiental&filter.effectCode=O5").counts.filtered).toBe(0);
  expect(run("section=occurrences&filter.domain=Ambiental&filter.domain=Operacional&filter.effectCode=O5").counts.filtered).toBe(2);
});
it("campaign/point scope uses real occurrences and preserves full N before filters",()=>{
  const dto=run("section=occurrences&filter.organismId=T1&filter.campaign=C1");
  expect(dto.rows).toHaveLength(1);expect(dto.rows[0].values).toMatchObject({reads:10,denominator:100,proportion:0.1});
  expect(run("filter.campaign=C3").counts.filtered).toBe(0);
});
it("deduplicates reference identifiers without multiplying associations and rejects unsafe links",()=>{
  const dto=run("section=references");expect(dto.rows).toHaveLength(2);expect(dto.counts.associations).toBe(2);
  expect(dto.rows.find(r=>r.id==="doi:10.1234/example")?.associationIds).toHaveLength(2);
  expect(researchReferenceLinks("javascript:evil https://user:pass@example.org/x","")).toEqual([]);
  expect(dto.rows.some(r=>r.referenceLinks.some(l=>l.correspondence==="check_required"))).toBe(true);
  expect(dto.rows[0].values).not.toHaveProperty("score");expect(dto.rows[0].values).not.toHaveProperty("domain");
  expect(dto.rows[0].associationSources).toHaveLength(2);
  const filtered=run("section=references&filter.referenceId=doi%3A10.1234%2Fexample");
  expect(filtered.rows.map(r=>r.id)).toEqual(["doi:10.1234/example"]);
});
it("joins occurrence analytical state only by campaign/SIA/set, retaining reason and exclusion",()=>{
  const dto=run("section=occurrences&filter.analyticalStatus=Inconclusivo");
  expect(dto.rows).toHaveLength(2);expect(dto.rows[0].values).toMatchObject({included:0,reason:"Razão explícita"});
});
it("content change produces a distinct revision despite unchanged declared label; unknown filters fail closed",()=>{
  const model=fixture();const before=run().revision.id;model.sheets[1].rows[5][10]="changed rationale";
  expect(run("",model).revision.id).not.toBe(before);expect(()=>run("filter.unknown=x")).toThrow();
  expect(()=>run("limit=1000")).toThrow();
});
it("method displays canonical terminology without rewriting raw provenance",()=>{
  const dto=run("section=method");expect(dto.rows[1].values.explanation).toContain("Metadados");
  expect(dto.rows[1].provenance.sourceValues["Coluna 3"]).toContain("Metadata-C2");
});
it("impacts separate what was detected in the chosen campaign from the rest of the catalog",()=>{
  const all=run("campaignCode=C1&catalogScope=all");
  expect(all.columns.map(c=>c.label)).toContain("Na campanha C1");
  expect(all.rows[0].values).toMatchObject({organismLabel:"Species B",detectedPoints:1,detectedReads:90,detection:"1 ponto · 90 reads"});
  expect(all.rows.at(-1)?.values).toMatchObject({organismLabel:"Species C",detection:"Não detectado"});
  expect(all.counts.detected).toBe(3);
  const detected=run("campaignCode=C2&catalogScope=detected");
  expect(detected.counts.filtered).toBe(2);expect(detected.rows.every(r=>r.values.detectedReads===5)).toBe(true);
  expect(run("section=occurrences").columns.map(c=>c.key)).not.toContain("detection");
});
