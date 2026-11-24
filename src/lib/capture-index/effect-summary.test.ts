import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { summarizeEffects } from "./effect-summary";
import type { CaptureIndexRow } from "./index";

const doc=JSON.parse(readFileSync("src/lib/capture-index/indice-captacao.json","utf8")) as {rows:CaptureIndexRow[]};
const mk=(id:string,win:boolean,alert=false):CaptureIndexRow=>{
  const c={component:"COI",ficha:"CUR-Limnoperna-O",q:0.1};
  return {campaign:1,sia:id,components:{"16S":{status:"disponível"},ALGAS:{status:"disponível"},COI:{status:"disponível"}},
    scores:{Operacional:{component:win?"COI":"16S",contributions:[c,c,{...c,ficha:"CUR-Cordylophora-O"}]}},descriptors:{exotics:[]},
    alerts:alert?[{motivo:"baixo suporte",ficha:c.ficha},{motivo:"baixo suporte",ficha:c.ficha}]:[]} as unknown as CaptureIndexRow;
};
describe("quadro de mecanismos",()=>{
  it("não transfere uma ficha entre domínios, marcadores ou pelo nome do táxon",()=>{
    const r=mk("fixture-negativa",false);
    const base={q:0.1,ficha:"CUR-Raphidiopsis-S",taxon:"Raphidiopsis",component:"16S"};
    r.scores={Ambiental:{component:"16S",contributions:[base]},
      "Saúde humana":{component:"16S",contributions:[{...base,component:"COI"},{...base,ficha:"outra-ficha"}]},
      Operacional:null} as unknown as CaptureIndexRow["scores"];
    const s=summarizeEffects([r],1);
    expect(s.unmappedContributions).toBe(3);
    for(const e of s.effects.filter(e=>["cyanotoxins","animal-toxicity"].includes(e.id)))
      expect(e.counts).toEqual({winning:0,other:0,low:0});
  });
  it("conta pontos, não fichas ou alertas repetidos; o denominador é específico",()=>{
    const rows=Array.from({length:10},(_,i)=>mk(String(i),i<6,i<5));
    const missing=mk("sem-coi",false);
    missing.components.COI.status="inconclusivo"; missing.scores.Operacional=null;
    const result=summarizeEffects([...rows,missing],1);
    const item=result.effects.find(e=>e.id==="fouling")!;
    expect(result.observations).toBe(11);
    expect(item.denominator).toBe(10);
    expect(item.counts).toEqual({winning:6,other:4,low:5});
    expect(result.effects.find(e=>e.id==="ghost")?.counts).toBeNull();
    expect(summarizeEffects([...rows,missing].reverse(),1)).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("sem-coi");
    expect(()=>summarizeEffects([rows[0],rows[0]],1)).toThrow(/duplicada/);
  });
  it("preserva ausência de biblioteca e campanha sem observações",()=>{
    const r=mk("A",false);r.scores.Operacional=null;r.components.COI.status="ausente";
    const item=summarizeEffects([r],1).effects.find(e=>e.id==="fouling")!;
    expect(item.denominator).toBe(0);expect(item.counts).toBeNull();
    expect(summarizeEffects([r],4).observations).toBe(0);
  });
  it("reconcilia as coberturas e não altera os 900 campos oficiais",()=>{
    const values=()=>doc.rows.flatMap(r=>[r.general,...Object.values(r.scores).map(s=>s?.score??null)]);
    const before=values();expect(before).toHaveLength(900);
    const result=[1,2,3,4].map(c=>summarizeEffects(doc.rows,c));
    for(const [id,n] of [["diatom",8],["fecal",5]] as const){
      const c=result[2].effects.find(e=>e.id===id)!.counts!;
      expect(c.winning+c.other).toBe(n); // positiva, independentemente de o componente ter vencido
    }
    expect(result.map(s=>[s.positiveContributions,s.unmappedContributions])).toEqual([[3094,2972],[2926,2650],[3780,3610],[0,0]]);
    for(const s of result){
      expect(s.residualDomains.reduce((n,d)=>n+d.contributions,0)).toBe(s.unmappedContributions);
      for(const d of s.residualDomains)expect(d.points>0).toBe(d.contributions>0);
    }
    expect(result.map(s=>[s.observations,s.eligible["16S"],s.eligible.COI,s.exoticsListed])).toEqual([[73,73,58,39],[76,75,72,51],[76,76,48,26],[0,0,0,0]]);
    for(const s of result)for(const e of s.effects)if(e.counts) {
      expect(e.counts.winning+e.counts.other).toBeLessThanOrEqual(e.denominator!);
      expect(e.counts.low).toBeLessThanOrEqual(e.denominator!);
    }
    expect(values()).toEqual(before);
  });
});
