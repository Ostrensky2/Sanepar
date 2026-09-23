import "server-only";
import { createHash } from "node:crypto";
import type { ResultsWorkbookExportModel, ResultsWorkbookImport } from "@/modules/results/types";
import { ANALYTICAL_SETS, RESULT_DOMAINS, RESULTS_CALCULATION_VERSION, RESULTS_CATALOG_VERSION, type AnalyticalSet, type ResultDomain } from "@/modules/results/types";
import { molecularSheetName } from "@/modules/results/sheet-names";
import { calculateAggregates, calculateWeightedSignal } from "@/modules/results/calculation";
import { isHiddenVersionField, mentionsInternalVersion } from "@/modules/results/hidden-fields";
import { tableRows } from "./results-source-preview";
import type { SourcePreviewRow } from "./results-source-preview-contract";
import { EVIDENCE_FIELDS } from "./results-evidence-dto";
import { RESULTS_RESEARCH_SECTIONS, type ResearchMethodDomain, type ResearchMethodPointOption, type ResearchMethodTrace, type ResearchRow, type ResearchValue, type ResultsResearchResponse, type ResultsResearchSection } from "./results-research-contract";

const CATALOG_FIELDS = {
  organismId:"ID organismo", organismLabel:"Organismo do banco", analyticalGroups:"Grupo analítico",
  identifiedLevel:"Nível identificado", declaredCampaigns:"Campanhas com registro", environmentalScore:"Score ambiental",
  operationalScore:"Score operacional", humanHealthScore:"Score saúde humana", environmentalConsequence:"Consequência ambiental",
  operationalConsequence:"Consequência operacional", humanHealthConsequence:"Consequência à saúde", environmentalEvidence:"Evidência ambiental",
  operationalEvidence:"Evidência operacional", humanHealthEvidence:"Evidência à saúde", reviewStatus:"Situação da revisão",
  upperLevelSearch:"Busca em nível superior", taxonomicCheck:"Conferência taxonômica", searchRecords:"Registros na nova busca",
  retrievedRecords:"Registros recuperados", searchTerm:"Termo da nova busca", reviewDate:"Data da revisão",
};
const OCCURRENCE_FIELDS = { campaign:"Campanha", sia:"Cód. SIA", waterBody:"Manancial / Corpo Hídrico", municipality:"Município",
  set:"Conjunto analisado", organismLabel:"Espécie", reads:"Número de Reads", sourcePercent:"% Reads", denominator:"Reads do conjunto", proportion:"Proporção no conjunto" };
const CALCULATION_FIELDS: Record<string,string> = { calculationKey:"Chave do cálculo",campaign:"Campanha",sia:"Ponto",set:"Conjunto",totalReads:"Total de reads",recordCount:"Registros",analyticalStatus:"Situação analítica",reason:"Motivo / observação analítica",included:"Incluir na síntese (0/1)" };
for (const [domain,label] of [["environmental","ambiental"],["operational","operacional"],["humanHealth","saúde"]]) {
  for (const n of [1,2,3]) CALCULATION_FIELDS[`${domain}ReadsScore${n}`]=`Reads score ${n} ${label}`;
  CALCULATION_FIELDS[`${domain}ReadsUnscored`]=`Reads sem score ${label}`;
  CALCULATION_FIELDS[`${domain}Coverage`]=`Cobertura ${label}`;
  CALCULATION_FIELDS[`${domain}Signal`]=`Sinal ponderado ${label}`;
  CALCULATION_FIELDS[`${domain}Calculated`]=`Índice ${label}`;
  CALCULATION_FIELDS[`${domain}Used`]=`Componente ${label} utilizado`;
}
const FACET_LABELS: Record<string,string> = {associationKey:"Associação",organismId:"Organismo (ID)",analyticalGroups:"Grupo analítico",domain:"Domínio",effectCode:"Efeito",score:"Score bibliográfico",evidenceType:"Tipo de evidência",identifiedLevel:"Nível identificado",reviewStatus:"Situação da revisão",campaign:"Campanha",sia:"Ponto SIA",waterBody:"Manancial",municipality:"Município",taxonomicResolution:"Resolução da associação",target:"Alvo",toxinOrCompoundSourceText:"Composto",accessedContent:"Conteúdo acessado",set:"Conjunto",analyticalStatus:"Situação analítica",referenceId:"Referência"};
const strings = (value: ResearchValue | undefined): string[] => value === null || value === undefined ? ["NA"] : Array.isArray(value) ? value : [String(value)];
const normalize = (value:string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const scalar = (row:SourcePreviewRow,key:string) => row[key] ?? null;
const fields = (row:SourcePreviewRow, mapping:Record<string,string>):Record<string,ResearchValue> => Object.fromEntries(Object.entries(mapping).map(([key,header])=>[key,scalar(row,header)]));
const split = (value:ResearchValue) => String(value??"").split(";").map(s=>s.trim()).filter(Boolean);

/** DOI/URL extraction is not citation pairing. Ambiguous blocks remain visibly unresolved. */
export function researchReferenceLinks(raw:string, bibliography:string): ResearchRow["referenceLinks"] {
  const links=new Map<string,ResearchRow["referenceLinks"][number]>();
  for(const match of raw.matchAll(/https?:\/\/[^\s<>"'|;]+/gi)) {
    const candidate=match[0].replace(/[.,]+$/, "");
    try {
      const url=new URL(candidate);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) continue;
      const doi=/^(?:dx\.)?doi\.org$/i.test(url.hostname) ? decodeURIComponent(url.pathname.slice(1)).toLowerCase() : null;
      const id=doi ? `doi:${doi}` : `url:${url.href}`;
      links.set(id,{id,href:doi?`https://doi.org/${doi}`:url.href,label:doi??url.href,correspondence:doi&&bibliography.toLowerCase().includes(doi)?"explicit_identifier":"check_required"});
    } catch { /* Invalid source text remains in the bibliographic block. */ }
  }
  for(const match of raw.matchAll(/\b10\.\d{4,9}\/[^\s<>"'|;]+/gi)) {
    const doi=match[0].replace(/[.,]+$/,"").toLowerCase(), id=`doi:${doi}`;
    if(!links.has(id)) links.set(id,{id,href:`https://doi.org/${doi}`,label:doi,correspondence:bibliography.toLowerCase().includes(doi)?"explicit_identifier":"check_required"});
  }
  return [...links.values()];
}

const METHOD_DOMAIN_KEYS=[["Ambiental","environmental"],["Operacional","operational"],["Saúde humana","humanHealth"]] as const;
const METHOD_SET_ORDER:AnalyticalSet[]=["cyanobacteria","bacteria","coi"];
const methodSetKey=(label:string):AnalyticalSet|null=>{const n=normalize(label);return n.startsWith("ciano")?"cyanobacteria":n.startsWith("bact")?"bacteria":n.startsWith("coi")||n.includes("eucar")?"coi":null;};
const finiteOrNull=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;

/**
 * Refaz, para um ponto, o caminho publicado: organismos → peso → sinal → 0–1 → domínios → índice geral.
 * A combinação usa os componentes "utilizados" da planilha publicada; nada é estimado para conjunto ausente.
 */
export function methodTrace(componentRows:SourcePreviewRow[], occurrences:ResearchRow[], campaign:string, requestedSia:string|null) {
  const rows=componentRows.filter(row=>String(row.Campanha)===campaign);
  const byPoint=new Map<string,SourcePreviewRow[]>();
  for(const row of rows){const sia=String(row.Ponto);byPoint.set(sia,[...(byPoint.get(sia)??[]),row]);}
  const aggregates=new Map([...byPoint].map(([sia,pointRows])=>{
    const components=Object.fromEntries(ANALYTICAL_SETS.map(set=>[set,Object.fromEntries(RESULT_DOMAINS.map(domain=>[domain,null]))])) as Record<AnalyticalSet,Record<ResultDomain,number|null>>;
    for(const row of pointRows){
      const set=methodSetKey(String(row.Conjunto));if(!set||Number(row["Incluir na síntese (0/1)"])!==1)continue;
      for(const [,domain] of METHOD_DOMAIN_KEYS)components[set][domain]=finiteOrNull(row[CALCULATION_FIELDS[`${domain}Used`]]);
    }
    return [sia,calculateAggregates(components)];
  }));
  const completes=[...aggregates].filter(([,value])=>value.overall.value!==null);
  const ranks=new Map(completes.map(([sia,value])=>[sia,1+completes.filter(([,other])=>(other.overall.value as number)>(value.overall.value as number)).length]));
  const place=(sia:string)=>{const row=occurrences.find(item=>item.values.campaign===campaign&&item.values.sia===sia);return {waterBody:row?.values.waterBody?String(row.values.waterBody):null,municipality:row?.values.municipality?String(row.values.municipality):null};};
  const points:ResearchMethodPointOption[]=[...aggregates].map(([sia,value])=>({sia,label:[sia,place(sia).waterBody,place(sia).municipality].filter(Boolean).join(" · "),overall:value.overall.value,rank:ranks.get(sia)??null}))
    .sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||a.sia.localeCompare(b.sia,"pt-BR",{numeric:true}));
  const sia=requestedSia&&byPoint.has(requestedSia)?requestedSia:points[0]?.sia;
  if(!sia)return {points,trace:null};
  const aggregate=aggregates.get(sia)!;
  const sets=[...byPoint.get(sia)!].sort((a,b)=>METHOD_SET_ORDER.indexOf(methodSetKey(String(a.Conjunto))!)-METHOD_SET_ORDER.indexOf(methodSetKey(String(b.Conjunto))!)).map(row=>{
    const set=String(row.Conjunto);
    const organisms=occurrences.filter(item=>item.values.campaign===campaign&&item.values.sia===sia&&item.values.set===set);
    const reads=organisms.map(item=>Number(item.values.reads));
    const total=reads.reduce((sum,value)=>sum+value,0);
    const score=(item:ResearchRow,key:string)=>finiteOrNull(item.values[key]);
    return {set,totalReads:total,organismCount:organisms.length,analyticalStatus:row["Situação analítica"]==null?null:String(row["Situação analítica"]),
      included:row["Incluir na síntese (0/1)"]==null?null:Number(row["Incluir na síntese (0/1)"])===1,
      organisms:[...organisms].sort((a,b)=>Number(b.values.reads)-Number(a.values.reads)).slice(0,8).map(item=>({label:String(item.values.organismLabel),reads:Number(item.values.reads),proportion:total>0?Number(item.values.reads)/total:0,
        scores:Object.fromEntries(METHOD_DOMAIN_KEYS.map(([label,domain])=>[label,score(item,`${domain}Score`)])) as Record<ResearchMethodDomain,number|null>})),
      domains:Object.fromEntries(METHOD_DOMAIN_KEYS.map(([label,domain])=>{
        const signal=calculateWeightedSignal(organisms.map(item=>({reads:Number(item.values.reads),score:score(item,`${domain}Score`)})));
        return [label,{scoredReads:signal.scoredReads,coverage:signal.coverage,signal:signal.signal,calculated:signal.index,used:finiteOrNull(row[CALCULATION_FIELDS[`${domain}Used`]])}];
      })) as ResearchMethodTrace["sets"][number]["domains"]};
  });
  // Conjunto sem linha na planilha para este ponto aparece como "sem registros", nunca some da conta.
  for(const set of METHOD_SET_ORDER) if(!sets.some(item=>methodSetKey(item.set)===set)) {
    const label=String(componentRows.find(row=>methodSetKey(String(row.Conjunto))===set)?.Conjunto??{cyanobacteria:"Cianobactérias",bacteria:"Bactérias",coi:"COI"}[set]);
    sets.splice(METHOD_SET_ORDER.indexOf(set),0,{set:label,totalReads:0,organismCount:0,included:false,analyticalStatus:"Sem registros",organisms:[],
      domains:Object.fromEntries(METHOD_DOMAIN_KEYS.map(([name])=>[name,{scoredReads:0,coverage:null,signal:null,calculated:null,used:null}])) as ResearchMethodTrace["sets"][number]["domains"]});
  }
  const trace:ResearchMethodTrace={campaign,sia,...place(sia),rank:ranks.get(sia)??null,sets,usedSetCount:aggregate.usedSetCount,overall:aggregate.overall,
    domains:Object.fromEntries(METHOD_DOMAIN_KEYS.map(([label,domain])=>[label,aggregate.domains[domain]])) as ResearchMethodTrace["domains"]};
  return {points,trace};
}

export type ResearchModel=Pick<ResultsWorkbookExportModel,"sheets"|"campaignCodes"> & {catalogVersion:string;calculationVersion?:string;sheetSources?:Record<string,{sha256:string;fileName:string}>};
export function queryResultsResearch(model:ResearchModel, parsed:ResultsWorkbookImport|null,
  source:ResultsResearchResponse["source"], query:URLSearchParams):ResultsResearchResponse {
  const catalogVersion=parsed?.catalogVersion??model.catalogVersion,calculationVersion=parsed?.calculationVersion??null;
  if((parsed&&parsed.calculationVersion!==RESULTS_CALCULATION_VERSION) || catalogVersion!==RESULTS_CATALOG_VERSION) throw new Error("Versão metodológica não suportada nesta consulta.");
  if(source.published&&(!parsed||source.sha256.toLowerCase()!==parsed.source.sha256.toLowerCase())) throw new Error("Fonte divergente.");
  const section=(query.get("section")??"impacts") as ResultsResearchSection;
  if(!source.published&&!['impacts','references'].includes(section))throw new Error("Seção indisponível: esta revisão bibliográfica não contém resultados de campanha publicados.");
  const offset=Number(query.get("offset")??0), limit=Number(query.get("limit")??50), search=normalize(query.get("q")??"");
  const mode=query.get("catalogScope")??"associations";
  if(!RESULTS_RESEARCH_SECTIONS.includes(section)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100||search.length>200||!["detected","associations","all","scored","unscored","without-association"].includes(mode)) throw new Error("Consulta inválida.");
  const getSheet=(name:string)=>{const sheet=model.sheets.find(s=>s.name===name);if(!sheet)throw new Error(`Aba ausente: ${name}.`);return sheet;};
  const catalogSheet=getSheet("Riscos_bibliografia"), evidenceSheet=getSheet("Evidencias_risco"), criteria=getSheet("Criterios_scores");
  // Content, including NA/text/references/criteria, fixes the revision; a label alone never identifies it.
  const revisionId=createHash("sha256").update(JSON.stringify([catalogSheet.rows,evidenceSheet.rows,criteria.rows])).digest("hex");
  const make=(sheet:string,row:SourcePreviewRow,headers:Record<string,string>,values=fields(row,headers)):ResearchRow=>({
    id:`${revisionId}:${sheet}:${row._sourceRow}`,values,organismIds:[],associationIds:[],referenceLinks:[],links:[],
    provenance:{sourceHash:source.published?source.sha256:model.sheetSources?.[sheet]?.sha256??"",revisionId,publicationId:source.publicationId,sheet,row:Number(row._sourceRow),headers:{...headers},sourceValues:row},
  });
  const catalog=tableRows(catalogSheet,4).rows.map(row=>{
    const item=make(catalogSheet.name,row,CATALOG_FIELDS); item.values.analyticalGroups=split(item.values.analyticalGroups);
    item.organismIds=[String(item.values.organismId)];return item;
  });
  const byId=new Map<string,ResearchRow>(), byName=new Map<string,ResearchRow>();
  for(const item of catalog) {
    const id=String(item.values.organismId), name=String(item.values.organismLabel);
    if(!id||id==="null"||!name||name==="null"||byId.has(id)||byName.has(name))throw new Error("Catálogo com identidade ausente/ambígua.");
    byId.set(id,item);byName.set(name,item);
  }
  const effectRows=criteria.rows.slice(32).filter(row=>/^[AOS]\d+$/.test(String(row[0])));
  const effects=new Map(effectRows.map(row=>[String(row[0]),{domain:row[1],label:row[2],scope:row[3]}]));
  const associationKeys=new Set<string>();
  const associations=tableRows(evidenceSheet,4).rows.map(row=>{
    const c=byId.get(String(row["ID organismo"])), key=String(row["Chave organismo-domínio"]);
    if(!c||c.values.organismLabel!==row["Organismo do banco"]||associationKeys.has(key))throw new Error("Associação órfã, duplicada ou nome conflitante.");
    associationKeys.add(key);
    const item=make(evidenceSheet.name,row,EVIDENCE_FIELDS,{...c.values,...fields(row,EVIDENCE_FIELDS)});
    const effect=effects.get(String(item.values.effectCode));
    if(!effect || effect.domain!==item.values.domain) throw new Error("Código de efeito ausente ou incompatível com domínio.");
    item.values.effectLabel=String(effect.label??"");item.values.effectScope=String(effect.scope??"");
    item.organismIds=c.organismIds;item.associationIds=[key];
    item.referenceLinks=researchReferenceLinks(String(item.values.doi??""),String(item.values.references??""));
    item.values.referenceId=item.referenceLinks.map(link=>link.id);
    item.values.referenceCorrespondence=item.referenceLinks.length&&item.referenceLinks.every(link=>link.correspondence==="explicit_identifier")?"Identificadores explícitos; bloco bibliográfico preservado":"Correspondência a conferir";
    item.links=source.published?[{label:"Ocorrências",section:"occurrences",filters:{organismId:item.organismIds}}]:[];
    return item;
  });
  const associationsById=new Map<string,ResearchRow[]>();
  for(const a of associations) {const id=a.organismIds[0];associationsById.set(id,[...(associationsById.get(id)??[]),a]);}
  const molecular=source.published?getSheet(molecularSheetName(model.sheets.map(s=>s.name))):null;
  const molecularRows=molecular?tableRows(molecular,0).rows.filter(row=>model.campaignCodes.includes(String(row.Campanha))):[];
  const componentRows=source.published?tableRows(getSheet("Calculo_conjuntos"),4).rows:[];
  const componentMap=new Map(componentRows.map(row=>[JSON.stringify([row.Campanha,row.Ponto,row.Conjunto]),row]));
  const denominators=new Map<string,number>();
  const molecularKey=(r:SourcePreviewRow)=>JSON.stringify([r.Campanha,r["Cód. SIA"],r["Conjunto analisado"]]);
  for(const row of molecularRows) {
    const reads=row["Número de Reads"];if(typeof reads!=="number"||!Number.isFinite(reads)||reads<0)throw new Error("Reads inválidos.");
    const key=molecularKey(row);denominators.set(key,(denominators.get(key)??0)+reads);
  }
  const occurrences=molecularRows.map(row=>{
    const c=byName.get(String(row["Espécie"]));if(!c)throw new Error("Ocorrência sem identidade literal no catálogo.");
    const item=make(molecular!.name,row,OCCURRENCE_FIELDS,{...c.values,...fields(row,OCCURRENCE_FIELDS)});
    const n=denominators.get(molecularKey(row))!;
    item.values.denominator=n;item.values.proportion=n>0?Number(item.values.reads)/n:null;
    if(typeof item.values.sia==="number")item.values.sia=`SIA-${String(item.values.sia).padStart(4,"0")}`;
    const component=componentMap.get(JSON.stringify([item.values.campaign,item.values.sia,item.values.set]));
    item.values.analyticalStatus=component?.["Situação analítica"]??null;
    item.values.included=component?.["Incluir na síntese (0/1)"]??null;
    item.values.reason=component?.["Motivo / observação analítica"]??null;
    if(component) {
      item.provenance.headers.analyticalStatus="Calculo_conjuntos: Situação analítica";
      item.provenance.headers.included="Calculo_conjuntos: Incluir na síntese (0/1)";
      item.values.componentSourceRow=component._sourceRow;
    }
    const related=associationsById.get(c.organismIds[0])??[];
    item.organismIds=c.organismIds;item.associationIds=related.flatMap(a=>a.associationIds);
    for(const key of ["domain","effectCode","score","evidenceType","referenceId"])item.values[key]=[...new Set(related.flatMap(a=>strings(a.values[key])))];
    item.links=[{label:"Associações",section:"impacts",filters:{organismId:item.organismIds}},{label:"Cálculo do conjunto",section:"calculations",filters:{campaign:strings(item.values.campaign),sia:strings(item.values.sia),set:strings(item.values.set)}}];
    return item;
  });
  const occurrencesById=new Map<string,ResearchRow[]>();
  for(const o of occurrences) {const id=o.organismIds[0];occurrencesById.set(id,[...(occurrencesById.get(id)??[]),o]);}
  for (const c of catalog) {
    const related=occurrencesById.get(c.organismIds[0])??[];
    for (const key of ["campaign","sia","waterBody","municipality","set"]) {
      const values=[...new Set(related.flatMap(o=>strings(o.values[key])))];
      c.values[key]=values;
      for(const a of associationsById.get(c.organismIds[0])??[])a.values[key]=values;
    }
  }
  // Detecção na campanha escolhida: separa o que apareceu de fato do que é só catálogo.
  const focusCampaign=query.get("campaignCode")??model.campaignCodes[0]??"";
  const detection=new Map<string,{points:Set<string>;reads:number}>();
  for(const o of occurrences) {
    const reads=Number(o.values.reads);
    if(o.values.campaign!==focusCampaign||!(reads>0))continue;
    const item=detection.get(o.organismIds[0])??{points:new Set<string>(),reads:0};
    item.points.add(String(o.values.sia));item.reads+=reads;detection.set(o.organismIds[0],item);
  }
  if(source.published) for(const row of [...catalog,...associations]) {
    const found=detection.get(row.organismIds[0]);
    row.values.detectedPoints=found?.points.size??0;row.values.detectedReads=found?.reads??0;
    row.values.detection=found?`${found.points.size} ${found.points.size===1?"ponto":"pontos"} · ${found.reads.toLocaleString("pt-BR")} reads`:"Não detectado";
  }
  const filters:Record<string,string[]>={};
  for(const [key,value] of query) if(key.startsWith("filter.")) {
    const field=key.slice(7);if(!Object.hasOwn(FACET_LABELS,field)||value.length>500)throw new Error("Filtro inválido.");
    filters[field]=[...new Set([...(filters[field]??[]),value])];
  }
  if(Object.values(filters).some(values=>values.length>100))throw new Error("Muitas opções de filtro.");
  const matches=(row:ResearchRow, selected:Record<string,string[]>)=>Object.entries(selected).every(([key,values])=>values.some(v=>strings(row.values[key]).includes(v)));
  const occurrenceKeys=["campaign","sia","waterBody","municipality","set"];
  if(!source.published&&Object.keys(filters).some(key=>occurrenceKeys.includes(key)||key==="analyticalStatus"))throw new Error("Filtro de campanha indisponível nesta revisão bibliográfica independente.");
  const occurrenceFilters=Object.fromEntries(Object.entries(filters).filter(([key])=>occurrenceKeys.includes(key)));
  const scopedIds=new Set(occurrences.filter(row=>matches(row,occurrenceFilters)).flatMap(row=>row.organismIds));
  const bibliographicFilters=Object.fromEntries(Object.entries(filters).filter(([key])=>!occurrenceKeys.includes(key)));
  let population:ResearchRow[];
  let mapping:Record<string,string>;
  if(section==="impacts"||section==="references") {
    population=associations;
    if(section==="impacts") {
      if(mode==="scored")population=population.filter(r=>typeof r.values.score==="number");
      if(mode==="unscored")population=population.filter(r=>r.values.score==="NA"||r.values.score===null);
      if(mode==="all"||mode==="without-association") {const absent=catalog.filter(c=>!associationsById.has(c.organismIds[0]));population=mode==="all"?[...population,...absent]:absent;}
      if(mode==="detected")population=population.filter(r=>Number(r.values.detectedPoints)>0);
      // Primeiro o que apareceu na campanha (mais reads antes); o resto do catálogo mantém a ordem da fonte.
      if(source.published)population=population.map((row,index)=>({row,index})).sort((a,b)=>Number(b.row.values.detectedReads??0)-Number(a.row.values.detectedReads??0)||a.index-b.index).map(({row})=>row);
    }
    population=population.filter(r=>!Object.keys(occurrenceFilters).length||r.organismIds.some(id=>scopedIds.has(id)));
    mapping={organismLabel:"Organismo",...(section==="impacts"&&source.published?{detection:`Na campanha ${focusCampaign}`}:{}),domain:"Domínio",effectLabel:"Efeito",consequence:"Consequência",score:"Score bibliográfico",evidenceType:"Tipo de evidência"};
  } else if(section==="occurrences") {population=occurrences;mapping={organismLabel:"Organismo",campaign:"Campanha",sia:"Ponto SIA",set:"Conjunto",reads:"Reads",sourcePercent:"% da fonte",denominator:"Reads do conjunto",proportion:"Fatia no conjunto"};}
  else if(section==="calculations") {
    population=tableRows(getSheet("Calculo_conjuntos"),4).rows.filter(row=>model.campaignCodes.includes(String(row.Campanha))).map(row=>{
      const item=make("Calculo_conjuntos",row,CALCULATION_FIELDS);
      item.values.domain=["Ambiental","Operacional","Saúde humana"];
      item.links=[{label:"Organismos do conjunto",section:"occurrences",filters:{campaign:strings(item.values.campaign),sia:strings(item.values.sia),set:strings(item.values.set)}}];
      return item;
    });mapping={campaign:"Campanha",sia:"Ponto",set:"Conjunto",totalReads:"Reads do conjunto",analyticalStatus:"Situação analítica",included:"Entrou no índice",environmentalCalculated:"Ambiental calculado",environmentalUsed:"Ambiental",operationalUsed:"Operacional",humanHealthUsed:"Saúde humana"};
  } else {
    const sheet=getSheet("Metodo_calculo");
    // Versões de método/catálogo são controle interno e não são exibidas.
    population=sheet.rows.flatMap((cells,index)=>cells.some(c=>c!==null&&c!=="")&&!cells.some(c=>mentionsInternalVersion(c)||typeof c==="string"&&isHiddenVersionField(c))?[make(sheet.name,{...Object.fromEntries(cells.map((c,i)=>[`Coluna ${i+1}`,c instanceof Date?c.toISOString():c])),_sourceRow:index+1},{parameter:"Coluna 1",value:"Coluna 2",explanation:"Coluna 3"})]:[]);
    // Display canonical terminology, retaining untouched raw provenance.
    for(const row of population) for(const key of Object.keys(row.values))if(typeof row.values[key]==="string")row.values[key]=(row.values[key] as string).replaceAll("Metadata-C2","Metadados");
    mapping={parameter:"Parâmetro / regra",value:"Valor / fórmula",explanation:"Explicação"};
  }
  const selected=section==="method"?{}:(section==="impacts"||section==="references")?bibliographicFilters:filters;
  const associationFacetKeys=["associationKey","domain","effectCode","score","evidenceType","referenceId","taxonomicResolution","target","toxinOrCompoundSourceText","accessedContent"];
  const associationFilters=Object.fromEntries(Object.entries(selected).filter(([key])=>associationFacetKeys.includes(key)));
  const rowFilters=section==="occurrences"?Object.fromEntries(Object.entries(selected).filter(([key])=>!associationFacetKeys.includes(key))):selected;
  let filtered=population.filter(row=>matches(row,rowFilters)&&
    (section!=="occurrences"||!Object.keys(associationFilters).length||(associationsById.get(row.organismIds[0])??[]).some(a=>matches(a,associationFilters)))&&
    (!search||normalize(Object.values(row.values).flat().join(" ")).includes(search)));
  const matchedAssociations=filtered;
  if(section==="references") {
    const grouped=new Map<string,ResearchRow>();
    for(const a of filtered) {
      const keys=(a.referenceLinks.length?a.referenceLinks.map(link=>link.id):[`unresolved:${a.id}`]).filter(id=>!filters.referenceId?.length||filters.referenceId.includes(id));
      for(const id of keys) {
        const existing=grouped.get(id), link=a.referenceLinks.find(l=>l.id===id);
        if(existing) {
          existing.organismIds=[...new Set([...existing.organismIds,...a.organismIds])];
          existing.associationIds=[...new Set([...existing.associationIds,...a.associationIds])];
          existing.values.references=[...new Set([...strings(existing.values.references),String(a.values.references??"")])];
          existing.values.organismLabel=[...new Set([...strings(existing.values.organismLabel),String(a.values.organismLabel)])];
          existing.associationSources!.push({associationId:a.associationIds[0],organismId:a.organismIds[0],provenance:a.provenance});
          existing.links.push({label:`Associação ${a.associationIds[0]}`,section:"impacts",filters:{associationKey:a.associationIds}});
        } else grouped.set(id,{...a,id,values:{referenceId:id,referenceLabel:link?.label??"Bloco sem fonte resolvida",organismLabel:[String(a.values.organismLabel)],references:[String(a.values.references??"")],referenceCorrespondence:link?.correspondence==="explicit_identifier"?"Identificador explícito; consultar associações separadamente":"Correspondência a conferir"},referenceLinks:link?[link]:[],associationSources:[{associationId:a.associationIds[0],organismId:a.organismIds[0],provenance:a.provenance}],links:[{label:`Associação ${a.associationIds[0]}`,section:"impacts",filters:{associationKey:a.associationIds}}]});
      }
    }
    filtered=[...grouped.values()];
    mapping={referenceLabel:"Identificador da fonte",organismLabel:"Organismos",references:"Blocos bibliográficos originais",referenceCorrespondence:"Correspondência"};
  }
  const facets=Object.entries(FACET_LABELS).flatMap(([key,label])=>{
    if(section==="method"&&!["campaign","sia","set","domain"].includes(key))return [];
    const options=new Map<string,number>();for(const row of section==="method"?occurrences:population)if(Object.hasOwn(row.values,key))for(const v of new Set(strings(row.values[key])))options.set(v,(options.get(v)??0)+1);
    return options.size?[{key,label,options:[...options].sort(([a],[b])=>a.localeCompare(b,"pt-BR")).map(([value,count])=>({value,label:key==="effectCode"?`${effects.get(value)?.label??value} (${value})`:value,count}))}]:[];
  });
  const referenceLinks=new Set(filtered.flatMap(r=>r.referenceLinks.map(link=>link.id)));
  const visibleEvidenceFields=Object.fromEntries(Object.entries(EVIDENCE_FIELDS).filter(([key])=>!isHiddenVersionField(key)));
  const allFields={...CATALOG_FIELDS,...visibleEvidenceFields,...CALCULATION_FIELDS,...OCCURRENCE_FIELDS,effectLabel:"Efeito",effectScope:"Escopo do efeito",referenceCorrespondence:"Correspondência bibliográfica"};
  let method:ResultsResearchResponse["method"];
  if(section==="method") {
    const p=parsed?.parameters;
    if(!p||p.alpha!==100||p.severityExponent!==1||p.requiredSetCount!==3||p.domainCount!==3)throw new Error("Parâmetros metodológicos incompatíveis.");
    const exampleRow=occurrences.find(row=>matches(row,occurrenceFilters));
    const domain=query.get("filter.domain")??"Ambiental";
    const domainScore=({Ambiental:"environmentalScore",Operacional:"operationalScore","Saúde humana":"humanHealthScore"} as Record<string,string>)[domain];
    if(!domainScore)throw new Error("Domínio inválido.");
    const exampleRows=exampleRow?occurrences.filter(row=>["campaign","sia","set"].every(key=>row.values[key]===exampleRow.values[key])):[];
    const calculated=calculateWeightedSignal(exampleRows.map(row=>({reads:Number(row.values.reads),score:typeof row.values[domainScore]==="number"?row.values[domainScore] as number:null})));
    const {points,trace}=methodTrace(componentRows,occurrences,query.get("filter.campaign")??model.campaignCodes[0]??"",query.get("filter.sia"));
    method={version:calculationVersion!,parameters:p,points,trace,stages:[
      {id:"denominator",title:"Quanto cada organismo representa",formula:"N = Σ n(i); p(i) = n(i)/N",variables:"n(i): reads do organismo; N: total de reads do conjunto neste ponto.",explanation:"Conta-se quantos reads cada organismo teve no conjunto e divide-se pelo total de reads do conjunto. Todos os organismos entram no total, mesmo os que não têm nota na literatura."},
      {id:"score",title:"Peso dado pela literatura",formula:"H(i,d) = (S(i,d)/3)^e",variables:"S: nota da literatura (1, 2 ou 3); e: expoente, hoje igual a 1.",explanation:"Cada organismo tem uma nota de 1 a 3 em cada domínio. A nota dividida por 3 vira um peso entre 0 e 1. Organismo sem nota fica fora da soma: não conta como zero."},
      {id:"signal",title:"Fatia × peso",formula:"Q(d,g) = Σ p(i) × H(i,d)",variables:"d: domínio; g: conjunto; só entram organismos com nota.",explanation:"Multiplica-se a fatia de cada organismo pelo seu peso e soma-se tudo. O resultado (Q) é o sinal do conjunto naquele domínio. O que pesa é a fatia e a nota; o número de referências não multiplica o valor."},
      {id:"component",title:"Escala de 0 a 1",formula:"I(d,g) = ln(1 + αQ)/ln(1 + α)",variables:"α = 100, fixo no método.",explanation:"Uma curva logarítmica leva o sinal Q para a escala de 0 a 1 e dá mais espaço aos sinais pequenos. O valor só entra no índice se o conjunto foi considerado utilizável."},
      {id:"aggregate",title:"Índice geral do ponto",formula:"D(d) = √(Σ I(d,g)²/3); R = Σ D(d)/3",variables:"Exige os três conjuntos; três domínios.",explanation:"Em cada domínio, os três conjuntos são combinados (raiz da média dos quadrados). A média dos três domínios é o índice geral. Se faltar um conjunto, o ponto recebe uma faixa possível e fica fora do ranking."},
      {id:"coverage",title:"Cobertura da literatura",formula:"reads com nota / N",variables:"Reads com nota ÷ total de reads do conjunto.",explanation:"Mostra que fatia dos reads tem nota na literatura. Cobertura baixa quer dizer que muitos organismos ainda não foram avaliados; não é medida de qualidade da análise."},
    ],example:exampleRow?{campaign:String(exampleRow.values.campaign),sia:String(exampleRow.values.sia),set:String(exampleRow.values.set),domain,...calculated}:null};
  }
  return {contractVersion:"yvae-research/1",section,source,revision:{id:revisionId,catalogVersion,calculationVersion,campaignCodes:model.campaignCodes},columns:Object.entries(mapping).map(([key,label])=>({key,label})),
    fieldLabels:{...allFields,...mapping},detailGroups:[{label:"Campos completos e procedência",keys:Object.keys(allFields)}],facets,rows:filtered.slice(offset,offset+limit),
    counts:{...(section==="impacts"&&source.published?{detected:filtered.filter(r=>Number(r.values.detectedPoints)>0).length}:{}),population:section==="references"?new Set(population.flatMap(a=>a.referenceLinks.length?a.referenceLinks.map(l=>l.id):[`unresolved:${a.id}`])).size:population.length,filtered:filtered.length,organisms:new Set(filtered.flatMap(r=>r.organismIds)).size,associations:new Set(filtered.flatMap(r=>r.associationIds)).size,referenceLinks:referenceLinks.size,unresolvedReferenceBlocks:matchedAssociations.filter(r=>r.values.references&&(!r.referenceLinks.length||r.referenceLinks.some(l=>l.correspondence==="check_required"))).length},
    pagination:{offset,limit,returned:Math.min(limit,Math.max(0,filtered.length-offset))},appliedFilters:filters,scope:source.published?"current-campaigns-same-source":"pinned-bibliography-revision",method,
    limitations:["DNA e associação bibliográfica não comprovam impacto local. NA não equivale a zero.","N inclui todos os reads do ponto/campanha/conjunto, antes dos filtros; percentuais não são somados.","Revisão fixada pelo conteúdo; somente campanhas vigentes desta mesma fonte. Fontes distintas não são combinadas.","Links identificados não equivalem à contagem de publicações; o bloco bibliográfico e seus limites são preservados."]};
}
