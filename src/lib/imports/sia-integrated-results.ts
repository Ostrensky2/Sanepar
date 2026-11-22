import type { Worksheet, Workbook } from "exceljs";
import type { captureIndexMeta, captureIndexView } from "../capture-index";
import { parsePointExecutionStatus } from "../point-execution-status";
import { resolveCanonicalCampaign } from "../campaign-identity";
import type { MatrixReferencePoint } from "./sia-matrices";

export type IntegratedIndex = { meta: Pick<typeof captureIndexMeta, "version" | "status" | "rowsSha256">; rows: ReturnType<typeof captureIndexView>[] };
export type FieldFile = { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

export function civilDay(value: unknown) {
  if (value instanceof Date && Number.isFinite(+value)) return value.toISOString().slice(0,10);
  const text = typeof value === "string" ? value.trim() : "";
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(iso+"T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0,10) === iso ? iso : "";
}
export function collectionDay(p: MatrixReferencePoint) {
  const state = parsePointExecutionStatus(p.executionStatus);
  return !p.contextualCampaign && p.sourceKind === "field_workbook" && p.sourceQualification==="original_verified" &&
    Boolean(p.verificationBasis && p.sourceDigest?.match(/^[a-f0-9]{64}$/i)) && p.identityStatus !== "ambiguous" && p.datePrecision === "civil_day" &&
    (!p.executionStatus || state === "realized" || state === "relocated") ? civilDay(p.sourceDate) : "";
}

const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
// Provenance by exact bytes of the original field books checked in the 22 Nov audit.
// A renamed file retains its scope; an edited book never inherits this attestation.
const originalCampaigns: Record<string, number> = {
  "8105cdcb11058ccb9d947e9a19a532dff20e0992d53e1841ffebe35b99d2ba2a": 1,
  "28ba8e7908e37de6ab330c29532fa6226dde3363dbe5e1635a792e72d3dc13cc": 2,
};
// Campo is a row-wise visit register; molecular XLSX is a matrix. Never parse one as the other.
export function fieldWorkbookRows(book: Workbook, filename: string, hash: string, campaign: number): MatrixReferencePoint[] {
  const attested=originalCampaigns[hash];
  if(attested!==undefined && attested!==campaign)throw Error("Campanha do original pelo SHA-256 diverge da seleção.");
  const sheets = book.worksheets.flatMap(sheet => {
    const headers = (sheet.getRow(1).values as unknown[]).map(x=>key(String(x ?? "")).replace(/\s+/g," "));
    const col = (label: string) => headers.indexOf(label);
    return col("cod. sia") > 0 && col("data") > 0 && col("manancial / corpo hidrico") > 0 ? [{sheet,col}] : [];
  });
  if (!sheets.length) throw new Error("Esperada aba de campo com Cód. SIA, Data e Manancial / Corpo Hídrico.");
  if (sheets.reduce((n,s)=>n+s.sheet.rowCount,0) > 10000) throw new Error("A planilha de campo excede 10.000 linhas.");
  const out: MatrixReferencePoint[] = [];
  for (const {sheet,col} of sheets) {
  for(let i=2;i<=sheet.rowCount;i++){
    const row=sheet.getRow(i), value=(k:string)=>col(k)>0 ? row.getCell(col(k)).value : null;
    const literal=(k:string)=>{const v=value(k);return typeof v==="string" || typeof v==="number" ? String(v).trim() : ""};
    const physicalPair=(original:boolean)=>{
      const joined=literal("latitude / longitude "+(original?"originais":"efetivas"));
      const parts=joined ? joined.split("/").map(v=>v.trim()) : [literal(original?"latitude original":"latitude efetiva"),literal(original?"longitude original":"longitude efetiva")];
      if(parts.length!==2 || !parts.every(v=>/^[+-]?\d+(?:[.,]\d+)?$/.test(v)))return null;
      const [lat,lon]=parts.map(v=>Number(v.replace(",",".")));
      return Math.abs(lat)<=90 && Math.abs(lon)<=180 ? {lat,lon} : null;
    };
    const rep=value("amostras e replicas");
    const cached=rep && typeof rep==="object" && "result" in rep && typeof rep.result==="string" ? rep.result.trim() : "";
    const sia=literal("cod. sia");if(!sia)continue;
    const declared=[literal("campanha"),literal("campaignid")].filter(Boolean);
    for(const v of declared){
      const expected=resolveCanonicalCampaign(campaign);
      const exact=expected && [String(campaign),`C${campaign}`,expected.id,expected.name,`Campanha ${campaign}`,`${campaign}ª Campanha`].some(label=>key(label)===key(v));
      if(!exact)throw Error("Campanha interna da linha de campo diverge da seleção.");
    }
    const state=literal("situacao") || literal("situacao de execucao") || literal("situacao do ponto") || literal("executionstatus") || literal("estado") || literal("status");
    const execution=parsePointExecutionStatus(state);
    const basis=attested?"SHA-256 do original de campo conferido para esta campanha":declared.length?"Campanha explícita na linha do livro de campo":"";
    const date=civilDay(value("data"));
    out.push({campaign,sia,originalSia:sia,contextualCampaign:!basis,sourceKind:"field_workbook",source:basis?filename:`${filename} (campanha apenas declarada na seleção)`,sourceId:hash,sourcePointId:`${sheet.name}!${i}`,sourceDate:date,
      sourceQualification:basis?"original_verified":"persisted_unverified",verificationBasis:basis,sourceDigest:hash,executionStatus:execution??(state || undefined),
      sourceDateRaw:date || literal("data"),datePrecision:date?"civil_day":"unknown",identityStatus:/^(?:SIA[-\s]*)?\d+$/i.test(sia)?"exact":"ambiguous",
      original:physicalPair(true),effective:physicalPair(false),waterBody:literal("manancial / corpo hidrico"),municipality:literal("municipio"),
      samplesReplicasEdna:literal("amostras e replicas") || (cached?`${cached} [valor salvo da fórmula; não recalculado]`:""),fieldSampleId:literal("amostra gogenetic"),zooplanktonId:literal("id zooplacton")});
  }
  }
  return out;
}

export function addFinalResults(sheet:Worksheet, index:IntegratedIndex|undefined,campaign:number, sias:string[], normalize:(x:unknown)=>string|null,
  link:(sia:string)=>{day:string; status:string; source:string; referenceDays?:string; warning?:string}){
  const bySia=new Map<string,IntegratedIndex["rows"][number]>();
  if(index){
    if(index.meta?.version!=="IR-CAPTACAO-0.7-piloto" || !Array.isArray(index.rows) || !/^[a-f0-9]{64}$/i.test(index.meta.rowsSha256))throw Error("Saída final do índice incompatível.");
    for(const row of index.rows){
      const sia=normalize(row.sia);
      if(!sia || row.campaign!==`C${campaign}` || bySia.has(sia))throw Error("Resultado final duplicado, sem SIA ou de outra campanha.");
      for(const v of [row.exact?.general,...["Ambiental","Operacional","Saúde humana"].map(d=>row.exact?.domains?.[d])]){
        if(v!==null && (typeof v!=="number" || !Number.isFinite(v)))throw Error("Valor oficial integral ausente ou incompatível.");
      }
      bySia.set(sia,row);
    }
  }
  for(const sia of new Set([...sias,...bySia.keys()])){
    const row=bySia.get(sia), l=link(sia);
    sheet.addRow([campaign,sia,row ? row.measured?"Com medição":"Sem medição":index?"Sem resultado localizado":"Fonte final não consultada",row?.measured?row.general:"",row?.range??"",row?.coverage??"",row?.band??"",row?.position??"",
      ...["Ambiental","Operacional","Saúde humana"].map(d=>row?.domains.find(x=>x.key===d)?.score??""),index?.meta.version??"",index?.meta.rowsSha256??"",
      l.day,l.day?"dia civil":"",l.source,l.status,"Resultado por campanha + SIA; não identifica visita, amostra ou réplica individual.",row?.exact.general??null,...["Ambiental","Operacional","Saúde humana"].map(d=>row?.exact.domains[d]??null),l.referenceDays??"",l.warning??""]);
  }
  return bySia.size;
}
