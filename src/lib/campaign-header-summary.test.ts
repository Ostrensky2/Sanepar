import {describe,expect,it} from "vitest";
import type {FieldDiaryEntry} from "./field-diary";
import {collectedPhysicalPoints,molecularAvailability} from "./campaign-header-summary";

function entry(sia:string, status:FieldDiaryEntry["executionStatus"]): FieldDiaryEntry {
  return {sia,campaignId:"campanha-2-outono-2026",executionStatus:status,activities:[],latitude:"-25",longitude:"-49"} as unknown as FieldDiaryEntry;
}
describe("resumo da campanha",()=>{
  it("conta cada SIA realizado ou realocado uma vez, sem coordenadas como prova",()=>{
    expect(collectedPhysicalPoints([entry("SIA-0174","realized"),entry("174","not_realized"),entry("0174","realized"),entry("175","relocated"),entry("176","planned"),entry("177",undefined),entry("","realized"),{...entry("200","realized"),campaignName:"3ª Campanha"}],"campanha-2-outono-2026",["174","175"])).toEqual({identified:2,pending:1});
  });
  it("aceita mais de 78 pontos e preserva o numerador acima da meta",()=>{
    expect(collectedPhysicalPoints(Array.from({length:80},(_,i)=>entry(String(i+1),"realized")),"campanha-2-outono-2026",Array.from({length:80},(_,i)=>String(i+1)))).toEqual({identified:80,pending:0});
  });
  it("preserva a visita com código legado concatenado e não a atribui a nenhum dos SIAs",()=>{
    const result = collectedPhysicalPoints([entry("SIA-3051037","realized"),entry("SIA-0174","relocated")],"campanha-2-outono-2026",["305/1037*","174","1037"]);
    expect(result).toEqual({identified:1,pending:1});
  });
  it("aceita identidade do cadastro de campo com visita comprovada nesta campanha",()=>{
    const visit = {...entry("SIA-0770","relocated"),campaignId:"campanha-4"};
    expect(collectedPhysicalPoints([visit],"campanha-4",["770"],[])).toEqual({identified:1,pending:0});
    expect(collectedPhysicalPoints([visit],"campanha-3",["770"],[])).toEqual({identified:0,pending:0});
  });
  it("distingue análise registrada, ausência e falha de consulta",()=>{
    expect(molecularAvailability(76,"0.7")).toContain("76 pontos");
    expect(molecularAvailability(0,"0.7")).toContain("Sem análise molecular registrada");
    expect(molecularAvailability(null,"0.7")).toContain("consulta indisponível");
  });
});
