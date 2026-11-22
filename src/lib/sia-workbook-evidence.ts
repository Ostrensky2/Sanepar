import { Workbook } from "exceljs";
import { inspectMatrixArchive } from "@/lib/imports/sia-matrices";
import { resolveCanonicalCampaign } from "@/lib/campaign-identity";

export async function workbookEvidence(bytes:Buffer,campaign:number){
  const {names}=inspectMatrixArchive(bytes);
  if(!names.has("xl/workbook.xml")||!names.has("[Content_Types].xml"))throw Error("XLSX");
  const workbook=new Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  function required(name:string,headers:string[]){
    const sheet=workbook.getWorksheet(name);
    if(!sheet || headers.some((h,i)=>sheet.getCell(1,i+1).value!==h))throw Error("SCHEMA");
    return sheet;
  }
  const summary=required("Resumo",["Item","Valor"]);
  const claims:string[]=[];
  summary.eachRow(row=>{if(row.getCell(1).value==="Campanha")claims.push(row.getCell(2).text);});
  if(claims.length!==1 || claims[0]!==resolveCanonicalCampaign(campaign)?.name)throw Error("CAMPAIGN");
  const sources=required("Fontes",["Arquivo","SHA-256","Campanha","Marcador","Nível","Plataforma / run","Bibliotecas"]);
  const sourcesDeclared:{filename:string;sha256:string}[]=[];
  sources.eachRow((row,i)=>{
    if(i===1)return;
    const filename=row.getCell(1).text,sha256=row.getCell(2).text;
    if(!filename||filename.length>400||!/^[0-9a-f]{64}$/.test(sha256)||sourcesDeclared.length>=32)throw Error("SOURCE");
    sourcesDeclared.push({filename,sha256});
  });
  if(!sourcesDeclared.length)throw Error("MISSING_SOURCES");
  required("Evidências de campo",["Campanha","SIA original"]);
  required("Resultados finais",["Campanha","SIA"]);
  const links=required("Vínculos laboratoriais",["Campanha","SIA","Marcador","Corrida","Nível taxonômico","Matriz de origem","SHA-256 da matriz"]);
  links.eachRow((row,i)=>{if(i>1&&!sourcesDeclared.some(s=>s.filename===row.getCell(6).text&&s.sha256===row.getCell(7).text))throw Error("SOURCE_LINK");});
  for(const sheet of workbook.worksheets){
    sheet.getRow(1).eachCell((cell,col)=>{
      if(cell.value==="Campanha")sheet.eachRow((row,i)=>{if(i>1&&row.getCell(col).value!==campaign)throw Error("CAMPAIGN");});
    });
  }
  const pending=required("Pendências",["SIA / dataset","Condição"]);
  return {sourcesDeclared,pendingCount:pending.actualRowCount-1,corroboration:"workbook-internal" as const};
}
