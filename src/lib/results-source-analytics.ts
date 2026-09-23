import type { ResultsWorkbookImport, AnalyticalSet } from "@/modules/results/types";
import type { SourcePreviewRow } from "./results-source-preview-contract";
import type { ResultsSourceAnalytics, MolecularTaxonSummary, MolecularHeatCell } from "./results-source-analytics-contract";

const setNames: Record<string,AnalyticalSet> = { "Bactérias":"bacteria", "Cianobactérias":"cyanobacteria", COI:"coi" };
const siaOf = (row: SourcePreviewRow) => typeof row["Cód. SIA"] === "number" ? `SIA-${String(row["Cód. SIA"]).padStart(4,"0")}` : String(row["Cód. SIA"]);
const numberOf = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
export function descriptive(values: number[]) {
  const sorted=[...values].sort((a,b)=>a-b), n=sorted.length;
  return { included:n, mean:n ? sorted.reduce((a,b)=>a+b,0)/n:null, median:n ? (sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null };
}
export function aggregateSource(parsed: ResultsWorkbookImport, rows: SourcePreviewRow[], catalog: SourcePreviewRow[], query: URLSearchParams, molecularSheetName = "Metadados"): ResultsSourceAnalytics {
  if (query.get("sourceHash")?.toLowerCase() !== parsed.source.sha256.toLowerCase()) throw new Error("Fonte alterada ou hash ausente.");
  const campaignCode=query.get("campaignCode") ?? "", set=query.get("set") as AnalyticalSet;
  const campaign=parsed.campaigns.find(c=>c.campaignCode===campaignCode);
  if (!campaign || !["bacteria","cyanobacteria","coi"].includes(set)) throw new Error("Campanha/conjunto inválidos.");
  const page=(name:string, fallback:number, max:number) => { const n=Number(query.get(name)??fallback); if(!Number.isInteger(n)||n<0||n>max) throw new Error("Página inválida."); return n; };
  const topN=page("topN",10,100), pointOffset=page("pointOffset",0,1000000), taxonOffset=page("taxonOffset",0,1000000), pageSize=page("pageSize",20,100);
  if (!topN || !pageSize) throw new Error("Página vazia.");
  const sia=query.get("sia"), q=(query.get("q")??"").toLocaleLowerCase("pt-BR");
  const leaders=(query.get("leaders")??"").split(",").filter(Boolean);
  if(leaders.length>10||leaders.some(code=>!/^SIA-\d+$/.test(code))) throw new Error("Pontos inválidos.");
  const catalogMap=new Map<string,SourcePreviewRow>();
  for(const row of catalog) {const name=String(row["Organismo do banco"]);if(catalogMap.has(name))throw new Error("Catálogo ambíguo.");catalogMap.set(name,row);}
  const population=rows.filter(r=>r.Campanha===campaignCode&&setNames[String(r["Conjunto analisado"])]===set&&(!sia||siaOf(r)===sia));
  const denominators=new Map<string,number>(), taxonPoints=new Map<string,Map<string,number>>();
  for(const row of population) {
    const reads=numberOf(row["Número de Reads"]), point=siaOf(row), taxon=String(row["Espécie"]);
    if(reads===null||reads<0) throw new Error("Reads inválidos.");
    denominators.set(point,(denominators.get(point)??0)+reads);
    const map=taxonPoints.get(taxon)??new Map<string,number>(); map.set(point,(map.get(point)??0)+reads);taxonPoints.set(taxon,map);
  }
  // Dominant taxa of each requested point in all three sets (one request), always over the whole
  // point/campaign/set denominator, independent of the set/sia/q filters of this query.
  const pointLeaders=leaders.map(code=>{
    const bySet=Object.fromEntries((["bacteria","cyanobacteria","coi"] as const).map(key=>[key,{reads:0,top:[] as {taxon:string;reads:number}[]}])) as ResultsSourceAnalytics["pointLeaders"][number]["bySet"];
    const byTaxon=new Map<string,number>();
    for(const row of rows) {
      const key=setNames[String(row["Conjunto analisado"])];
      if(row.Campanha!==campaignCode||!key||siaOf(row)!==code) continue;
      const reads=numberOf(row["Número de Reads"]);
      if(reads===null||reads<0) throw new Error("Reads inválidos.");
      bySet[key].reads+=reads;
      byTaxon.set(`${key}|${row["Espécie"]}`,(byTaxon.get(`${key}|${row["Espécie"]}`)??0)+reads);
    }
    for(const [id,reads] of byTaxon) if(reads>0) {const [key,taxon]=[id.slice(0,id.indexOf("|")),id.slice(id.indexOf("|")+1)] as [AnalyticalSet,string];bySet[key].top.push({taxon,reads});}
    // Maiores contribuições q = (reads/N) × (score/3): só conjuntos utilizados no cálculo e scores numéricos.
    // Dominância (reads) e contribuição ao índice são informações distintas.
    const point=campaign.points.find(p=>p.siaCode===code);
    const contributors:ResultsSourceAnalytics["pointLeaders"][number]["contributors"]=[];
    for(const [id,reads] of byTaxon) {
      const [key,taxon]=[id.slice(0,id.indexOf("|")),id.slice(id.indexOf("|")+1)] as [AnalyticalSet,string];
      if(reads<=0||!point?.components[key]?.included||!bySet[key].reads) continue;
      for(const domain of ["ambiental","operacional","saúde humana"]) {
        const score=numberOf(catalogMap.get(taxon)?.[`Score ${domain}`]);
        if(score!==null&&score>0) contributors.push({taxon,set:key,domain,share:reads/bySet[key].reads,score,q:reads/bySet[key].reads*(score/3)});
      }
    }
    for(const item of Object.values(bySet)) item.top=item.top.sort((x,y)=>y.reads-x.reads||x.taxon.localeCompare(y.taxon)).slice(0,3);
    return {sia:code,bySet,contributors:contributors.sort((x,y)=>y.q-x.q||x.taxon.localeCompare(y.taxon)||x.domain.localeCompare(y.domain)).slice(0,5)};
  });
  const summaries: MolecularTaxonSummary[]=[...taxonPoints].map(([taxon,points])=>({taxon, reads:[...points.values()].reduce((a,b)=>a+b,0),positivePoints:[...points.values()].filter(n=>n>0).length,denominatorPoints:denominators.size}));
  const filtered=summaries.filter(r=>r.taxon.toLocaleLowerCase("pt-BR").includes(q));
  const byReads=[...filtered].sort((a,b)=>b.reads-a.reads||a.taxon.localeCompare(b.taxon));
  const byFrequency=[...filtered].sort((a,b)=>b.positivePoints-a.positivePoints||a.taxon.localeCompare(b.taxon));
  const points=campaign.points.filter(p=>!sia||p.siaCode===sia);
  // Mapa de calor começa pelos táxons com mais reads: a primeira página mostra o que apareceu, não uma lista alfabética de zeros.
  const taxa=byReads.slice(taxonOffset,taxonOffset+pageSize);
  const cells: MolecularHeatCell[]=points.slice(pointOffset,pointOffset+pageSize).flatMap(point=>taxa.map(t=>{
    const denominator=denominators.get(point.siaCode)??0, reads=taxonPoints.get(t.taxon)?.get(point.siaCode)??0;
    const state=!denominators.has(point.siaCode)?"absent":!point.components[set].included?"unusable":denominator===0?"no-denominator":reads===0?"zero":"observed";
    return {sia:point.siaCode,taxon:t.taxon,reads,denominator,proportion:state==="zero"||state==="observed"?reads/denominator:null,state};
  }));
  const complete=points.filter(p=>p.usedSetCount===3&&p.overall.value!==null).map(p=>p.overall.value!);
  const stats=descriptive(complete);
  // Só organismos detectados no ponto, do que mais pesa (q) para o que menos pesa; sem nota vai ao fim.
  const contributions=sia ? [...taxonPoints].filter(([taxon,pointReads])=>taxon.toLocaleLowerCase("pt-BR").includes(q)&&(pointReads.get(sia)??0)>0).flatMap(([taxon,pointReads])=>["ambiental","operacional","saúde humana"].map(domain=>{
    const score=numberOf(catalogMap.get(taxon)?.[`Score ${domain}`]), reads=pointReads.get(sia)??0, denominator=denominators.get(sia)??0;
    return {sia,taxon,reads,denominator,domain,score,q:score!==null&&denominator>0?reads/denominator*(score/3):null};
  })).sort((a,b)=>(b.q??-1)-(a.q??-1)||b.reads-a.reads||a.taxon.localeCompare(b.taxon)):[];
  const history=parsed.campaigns.map(c=>{
    const values=c.points.filter(p=>p.usedSetCount===3&&p.overall.value!==null).map(p=>p.overall.value!);
    const readsBySet:Record<string,number>={};
    for(const row of rows.filter(r=>r.Campanha===c.campaignCode)) {const key=setNames[String(row["Conjunto analisado"])];if(key)readsBySet[key]=(readsBySet[key]??0)+Number(row["Número de Reads"]);}
    return {campaignCode:c.campaignCode,calculationVersion:parsed.calculationVersion,catalogVersion:parsed.catalogVersion,point:sia?c.points.find(p=>p.siaCode===sia):undefined,counts:c.counts,...descriptive(values),excluded:c.points.length-values.length,siaUniverse:c.points.map(p=>p.siaCode),readsBySet,protocolCompatibility:"not-established" as const};
  });
  const pointMetadata:ResultsSourceAnalytics["pointMetadata"]=[];
  const seenMetadata=new Set<string>();
  if(sia) for(const row of rows.filter(r=>r.Campanha===campaignCode&&siaOf(r)===sia)) {
    const values=Object.fromEntries(["Data","Hora","Manancial / Corpo Hídrico","Município","Acessibilidade do Ponto","Turbidez","Clima","Observações"].map(key=>[key,row[key]??null]));
    const signature=JSON.stringify(values);if(seenMetadata.has(signature))continue;seenMetadata.add(signature);
    pointMetadata.push({sia,source:{sheet:molecularSheetName,row:Number(row._sourceRow)},values});
  }
  return {source:{kind:"local-corrected-preview",sha256:parsed.source.sha256.toLowerCase(),published:false},calculationVersion:parsed.calculationVersion,catalogVersion:parsed.catalogVersion,campaignCode,set,
    campaignTaxa:new Set(rows.filter(r=>r.Campanha===campaignCode).map(r=>r["Espécie"])).size,pointMetadata,
    summary:{points:points.length,municipalities:new Set(points.map(p=>p.municipality).filter(Boolean)).size,waterBodies:new Set(points.map(p=>p.waterBody).filter(Boolean)).size,taxa:summaries.length,records:population.length,reads:[...denominators.values()].reduce((a,b)=>a+b,0),pointsWithRecords:denominators.size,usablePoints:points.filter(p=>p.components[set].included).length,...stats,excluded:points.length-stats.included,histogram:Array.from({length:10},(_,i)=>({lower:i/10,upper:(i+1)/10,count:complete.filter(v=>v>=i/10&&(i===9?v<=1:v<(i+1)/10)).length}))},
    topReads:byReads.slice(0,topN),topFrequency:byFrequency.slice(0,topN),taxaTotal:summaries.length,taxaFiltered:filtered.length,
    heatmap:{cells,pointsTotal:points.length,taxaTotal:filtered.length,pointOffset,taxonOffset,pageSize},
    contributions:contributions.slice(taxonOffset,taxonOffset+pageSize),contributionsTotal:contributions.length,pointLeaders,history,
    coordinateWarnings:points.filter(p=>p.siaCode==="SIA-0770"&&p.coordinates?.latitude===p.coordinates?.longitude).map(p=>({sia:p.siaCode,reason:"Longitude efetiva repete latitude; conferir fonte, sem correção presumida."})),
    limitations:["Reads são esforço de sequenciamento; conjuntos não são biologicamente equivalentes.","Frequência conta SIA com reads positivos; busca/TopN não alteram denominadores.","Contribuições Q são por domínio/conjunto, nunca parcelas aditivas do índice geral.","Grupos funcionais, invasores, gosto/odor e recomendações: informação curada indisponível."]};
}
