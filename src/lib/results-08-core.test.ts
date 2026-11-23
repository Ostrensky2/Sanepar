import {describe,expect,it} from "vitest";
import {evaluateResultsIndex as evaluate,type Category08,type Contribution08} from "./results-08-core";
const make=(...items:Contribution08[][]):Category08[]=>(["ambiental","operacional","saude"] as const).map((domain,i)=>({
  domain,winner:0,enumeratedUsableCount:2,components:[{component:0,complete:true,positiveDenominator:true,assessedFraction:.2,items:items[i]},{component:1,complete:true,positiveDenominator:true,assessedFraction:0,items:items[i].some(v=>v[1]>0)?[[null,1,"generica",true]]:[]}]
}));
const run=(categories:Category08[])=>evaluate("0.8",{version:"0.8",origin:"adjudicated-component-masses/v1",categories});
describe("índice por massas adjudicadas",()=>{
  it("exige suporte aplicável do reforço genérico sem descontar o piso",()=>{
    const base=Math.log1p(50)/Math.log1p(100);
    const aux=Math.log1p(4)/Math.log1p(100);
    const valor=(supported:boolean)=>run(make([[0,.5,"generica",true]],[[1,.04,"generica",supported]],[]));
    expect(valor(false)).toBe(base);
    expect(valor(true)).toBeCloseTo(base+(1-base)*aux/2,14);
    expect(run(make([[0,.5,"generica",false]],[],[]))).toBe(base);
  });
  it("recompõe pelo vencedor e reproduz Python em 30 comparações",()=>{
    const expected=[.38365182197999387,.3908759904106015,.488727942701752,.7082422602424484,.983490674730165];
    [0,.001,.02,.1,.6].forEach((q,i)=>{
      const cs=make([[0,.03,"generica",true]],[[1,q,"generica",true],[1,q/2,"generica",true]],[[3,.02,"sanitaria-distinta",true]]);
      for(const ix of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])expect(run(ix.map(j=>cs[j]))).toBeCloseTo(expected[i],14);
    });
  });
  it("não transfere reforço sensorial; piso e teto",()=>{
    const cs=make([],[[0,.1,"sensorial",true]],[[1,.1,"sensorial",true]]);
    expect(run(cs)).toBe(Math.log1p(10)/Math.log1p(100));
    expect(run(make([[0,1,"generica",true]],[],[]))).toBe(1);
    expect(run(make([],[],[]))).toBe(0);
  });
  it("massa incompleta, vencedor ausente ou domínio faltante não são zero",()=>{
    const cs=make([],[],[]);
    expect(run(cs.slice(1))).toBeNull();
    cs[0].winner=2;expect(run(cs)).toBeNull();
    cs[0].winner=null;cs[0].enumeratedUsableCount=undefined;expect(run(cs)).toBeNull();
    cs[0]={...cs[0],winner:0,components:[{component:0,complete:false,items:[]}]};expect(run(cs)).toBeNull();
  });
  it("rejeita versão histórica, inclusive zero e null, e não aceita relabel",()=>{
    const cs=make([],[],[]);
    expect(()=>run(cs.map(c=>({...c,score:.6})))).toThrow();
    const h={version:"0.7" as const,historicalScore:.52};
    for(const historicalScore of [.52,0,null]){
      // @ts-expect-error 0.7 is not part of the active public API.
      expect(()=>evaluate("0.7",{...h,historicalScore})).toThrow("Index version mismatch");
    }
    // @ts-expect-error An old payload cannot be passed under the current version.
    expect(()=>evaluate("0.8",h)).toThrow("Index version mismatch");
    expect(()=>evaluate("0.8",{...h,version:"0.8",origin:"adjudicated-component-masses/v1",categories:cs})).toThrow();
    expect(()=>evaluate("0.8",{version:"0.8",origin:"historical" as never,categories:cs})).toThrow();
    expect(()=>evaluate("0.9" as never,h as never)).toThrow();
  });
  it("rejeita massa inválida, duplicação de componente e de domínio",()=>{
    expect(()=>run(make([[1,NaN,"generica",true]],[],[]))).toThrow();
    const cs=make([],[],[]);expect(()=>run([cs[0],cs[0],cs[2]])).toThrow();
    cs[0]={...cs[0],components:[cs[0].components[0],cs[0].components[0]]};expect(()=>run(cs)).toThrow();
  });
  it("distingue enumeração completa de cobertura científica integral sem inventar vencedor",()=>{
    const cs=make([],[],[]);
    const empty={component:0,complete:true,items:[],positiveDenominator:true,assessedFraction:.2};
    const absent={domain:"ambiental" as const,winner:null,enumeratedUsableCount:1};
    expect(run([{...absent,components:[empty]},cs[1],cs[2]])).toBe(0);
    for(const changed of [{assessedFraction:0},{positiveDenominator:false},{complete:false},{assessedFraction:NaN}])
      expect(run([{...absent,components:[{...empty,...changed}]},cs[1],cs[2]])).toBeNull();
    expect(run([{...absent,enumeratedUsableCount:2,components:[empty]},cs[1],cs[2]])).toBeNull();
    const pos=make([],[[1,.2,"generica",true]],[]);
    expect(run([{...absent,components:[]},pos[1],pos[2]])).toBeNull();
  });
  it("três vencedores vazios não certificam o próprio zero",()=>{
    const cs=make([],[],[]).map(c=>({...c,components:c.components.map(x=>({...x,positiveDenominator:false,assessedFraction:0}))}));
    expect(run(cs)).toBeNull();
  });
  it("não escolhe implicitamente o irmão positivo e preserva zero certificado em série mista",()=>{
    const cs=make([],[[1,.2,"generica",true]],[]);
    expect(run(cs)).toBe(Math.log1p(20)/Math.log1p(100));
    cs[0]={...cs[0],components:[cs[0].components[0],{...cs[0].components[1],items:[[0,.1,"generica",true]]}]};
    expect(run(cs)).toBeNull();
    cs[0]={...cs[0],components:[{...cs[0].components[0],positiveDenominator:false,assessedFraction:0},cs[0].components[1]]};
    expect(run(cs)).toBeNull();
  });
});
