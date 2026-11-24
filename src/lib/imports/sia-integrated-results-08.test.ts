import ExcelJS from "exceljs";
import {expect,it} from "vitest";
import {addAggregateResults,addFinalResults,type IntegratedIndex} from "./sia-integrated-results";
import {RESULTS_08_GROUPS,RESULTS_08_SERIES,type Results08Aggregate} from "../results-08-contract";
import {captureIndexMeta,captureIndexRows,captureIndexView} from "../capture-index";
import {normalizeMatrixSia} from "./sia-matrices";
const link=()=>({day:"",status:"",source:""});
const index08=(campaign:number):IntegratedIndex=>({meta:captureIndexMeta,rows:captureIndexRows(campaign).map(captureIndexView)});
function fixture():Results08Aggregate {
 const grupos=Object.fromEntries(RESULTS_08_GROUPS.map(g=>[g,Object.fromEntries(RESULTS_08_SERIES.map(s=>[s,{observados:1,numericos:0,nulos:1,minimo:null,media:null,maximo:null,colunas:Array(40).fill(0),faixas:Array(5).fill(0)}]))]));
 return {versao:"0.8",politica:"sinal-documentado/1",schema:"agregados-home-export/1",grupos} as Results08Aggregate;
}
it("reopens generated neutral XLSX preserving numeric zero versus unavailable, without nominal data",async()=>{
 const data=fixture();data.grupos.C1.geral08={observados:1,numericos:1,nulos:0,minimo:0,media:0,maximo:0,colunas:[1,...Array(39).fill(0)],faixas:[1,0,0,0,0]};
 const book=new ExcelJS.Workbook();addAggregateResults(book.addWorksheet("Agregados 0.8"),data);
 const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await book.xlsx.writeBuffer());
 const sheet=reopened.getWorksheet("Agregados 0.8")!;
 expect(sheet.rowCount).toBe(13);expect(sheet.getCell("H2").value).toBe(0);expect(sheet.getCell("H3").value).toBe(null);
 expect(JSON.stringify(sheet.getRow(1).values)).not.toMatch(/SIA|local|organismo/i);
});
it("rejects 0.7 before writing any cells",()=>{
 const sheet=new ExcelJS.Workbook().addWorksheet("Teste");const old={...fixture(),versao:"0.7"} as unknown as Results08Aggregate;
 expect(()=>addAggregateResults(sheet,old)).toThrow();expect(sheet.rowCount).toBe(0);
 expect(()=>addFinalResults(sheet,{meta:{version:"IR-CAPTACAO-0.7-piloto",status:"synthetic",rowsSha256:"0".repeat(64)},rows:[]} as IntegratedIndex,1,[],String,link)).toThrow(/somente a metodologia 3.0/);
 expect(sheet.rowCount).toBe(0);
});
it("writes each campaign + SIA note 0.8 into the unified sheet and reopens it with zero, no-estimate and profiles intact",async()=>{
 const book=new ExcelJS.Workbook();
 for(const campaign of [1,2,3]){
  const sheet=book.addWorksheet("C"+campaign);
  expect(addFinalResults(sheet,index08(campaign),campaign,[],normalizeMatrixSia,link)).toBe([73,76,76][campaign-1]);
 }
 const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await book.xlsx.writeBuffer());
 const row=(campaign:number,sia:string)=>{const sheet=reopened.getWorksheet("C"+campaign)!;for(let r=1;r<=sheet.rowCount;r++)if(sheet.getCell(r,2).value===normalizeMatrixSia(sia))return sheet.getRow(r);throw Error("linha ausente")};
 const cells=(campaign:number,sia:string)=>{const r=row(campaign,sia);return {state:r.getCell(3).value,shown:r.getCell(4).value,categories:[8,9,10].map(c=>r.getCell(c).value),version:r.getCell(11).value,exact:[18,19,20,21].map(c=>r.getCell(c).value),profiles:[24,25].map(c=>r.getCell(c).value)}};
 // Mesmo SIA, campanhas diferentes: cada aba traz a nota da sua campanha.
 for(const campaign of [1,2,3]){
  const source=captureIndexRows(campaign).find(item=>item.sia==="17")!, got=cells(campaign,"17");
  expect(got.exact).toEqual([source.general,source.scores.Ambiental!.score,source.scores.Operacional!.score,source.scores["Saúde humana"]!.score]);
  expect([got.state,got.version]).toEqual(["Nota calculada (método 3.0)","IR-CAPTACAO-3.0"]);
 }
 expect([1,2,3].map(campaign=>cells(campaign,"17").shown)).toEqual(["0,13","0,09","0,16"]);
 // Zero calculado é o número 0; sem estimativa fica vazio e rotulado.
 expect(cells(1,"17").exact[2]).toBe(0);expect(cells(1,"17").categories[1]).toBe("0,00");
 const none=cells(2,"257");
 expect([none.state,none.shown,none.exact[0],none.exact[3],none.categories[2]]).toEqual(["Sem estimativa","",null,null,"sem estimativa"]);
 expect(none.exact.slice(1,3).every(value=>typeof value==="number"&&value>0)).toBe(true);
 expect(cells(2,"17").profiles).toEqual(["0,09 · Gosto e odor; Obstrução associada a diatomáceas","0,05 · Potencial de cianotoxinas; 3 outra(s) contribuição(ões) documentada(s)"]);
 expect(none.profiles).toEqual(["0,05 · Incrustação biológica","Sem estimativa"]);
 // Uma linha de outra campanha nunca entra na planilha desta.
 expect(()=>addFinalResults(new ExcelJS.Workbook().addWorksheet("x"),index08(3),2,[],normalizeMatrixSia,link)).toThrow(/outra campanha/);
});
