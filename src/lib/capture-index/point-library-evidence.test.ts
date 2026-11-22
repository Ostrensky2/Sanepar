import { describe,expect,it } from "vitest";
import { captureIndexRows,captureIndexView } from "./index";
import { pointLibraryEvidence,domainEvidenceRoles,publishedEvidenceReference } from "./point-library-evidence";
import { summarizeEffects } from "./effect-summary";

const library=(status:string,observedReads:string,validReads:string)=>
  pointLibraryEvidence({campaign:"C9",sia:"fixture",components:[{name:"COI",run:"ensaio",status,observedReads,validReads}]}).libraries[0];

describe("leitura científica do extrato individual",()=>{
  it("não confunde COI ausente, inconclusivo com reads ou zero observado",()=>{
    expect(library("ausente","0","0")).toMatchObject({observedReads:"—",validDenominator:null,state:"absent"});
    expect(library("inconclusivo","10","0")).toMatchObject({observedReads:"10",validDenominator:null,state:"inconclusive"});
    expect(library("inconclusivo","0","0").state).toBe("inconclusive");
    expect(library("disponível","0","0").state).toBe("zero-observed");
    expect(library("disponível","1","0").state).toBe("unassessed");
    expect(library("disponível","1","1.250")).toMatchObject({state:"usable",validDenominator:"1.250"});
    expect(library("disponível","","").state).toBe("unassessed");
    expect(publishedEvidenceReference({ficha:" ",source:""})).toMatchObject({id:null,source:null});
  });
  it("preserva chave, origem, papéis e os 900 valores do extrato",()=>{
    const rows=captureIndexRows();let values=0,secondary=0,unusableCOI=0;
    for(const r of rows){
      const v=captureIndexView(r),reading=pointLibraryEvidence(v);
      expect([reading.campaign,reading.sia]).toEqual([v.campaign,r.sia]);
      for(const c of reading.libraries){
        expect(c.state==="usable").toBe(c.status==="disponível");
        if(c.name==="COI" && c.validDenominator===null)unusableCOI++;
      }
      for(const domain of v.domains){
        const detail=domainEvidenceRoles(domain);
        for(const [i,c] of detail.contributions.entries()){
          expect(c.reference.id).toBe(domain.contributions[i].ficha);
          expect(c.reference.source).toBe(domain.contributions[i].source.trim()||null);
          if(c.role==="Em outro componente observado")secondary++;
        }
        expect(v.exact.domains[domain.key]).toBe(r.scores[domain.key]?.score??null);values++;
      }
      expect(v.exact.general).toBe(r.general);values++;
    }
    expect([rows.length,values,unusableCOI]).toEqual([225,900,47]);
    expect(secondary).toBeGreaterThan(0);
  });
  it("cada numerador e denominador agregado corresponde a pontos distintos, por campanha",()=>{
    for(const c of [1,2,3]){
      const rows=captureIndexRows(c),summary=summarizeEffects(rows,c);
      expect(new Set(rows.map(r=>r.sia)).size).toBe(rows.length);
      // Partições unitárias somente em memória; nenhum vínculo individual é exportado.
      const units=rows.map(row=>summarizeEffects([row],c));
      summary.effects.forEach((effect,i)=>{
        if(effect.denominator===null){expect(units.every(s=>s.effects[i].denominator===null)).toBe(true);return;}
        expect(effect.denominator).toBe(units.reduce((a,s)=>a+(s.effects[i].denominator??0),0));
        for(const k of ["winning","other","low"] as const)
          expect(effect.counts?.[k]??0).toBe(units.filter(s=>s.effects[i].counts?.[k]===1).length);
      });
    }
  });
});
