import {readFileSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {basename,join} from "node:path";
import Excel from "exceljs";
import {it,expect} from "vitest";
import {buildCampaignMatrixWorkbook,readMatrixPackage,normalizeMatrixSia, type DiarySnapshot,type MatrixReferencePoint} from "../sia-matrices";
import {addFinalResults,civilDay,collectionDay,type IntegratedIndex} from "../sia-integrated-results";
const file=(path:string)=>{const data=Uint8Array.from(readFileSync(path));return {name:basename(path),size:data.length,arrayBuffer:async()=>data.buffer}};
it("não usa datas inválidas, de publicação, planejamento ou snapshot como dia da coleta",()=>{
  expect(civilDay("2026-02-30")).toBe("");expect(civilDay("2026-02-21T03:00:00Z")).toBe("");
  const p={sourceDate:"2026-02-21",datePrecision:"civil_day",sourceKind:"field_workbook",sourceQualification:"original_verified",sourceDigest:"a".repeat(64),verificationBasis:"campo identificado"} as MatrixReferencePoint;
  expect(collectionDay(p)).toBe("2026-02-21");for(const extra of [{sourceKind:"historical_snapshot"},{executionStatus:"planned"},{identityStatus:"ambiguous"}] as const)expect(collectionDay({...p,...extra})).toBe("");
});
it.each(["Campanha","campaignId"])("lê %s dentro do XLSX serializado, preserva linha, escopo e situação",async(header)=>{
  const wb=new Excel.Workbook(), ws=wb.addWorksheet("Ficha");
  ws.addRows([[header,"Cód. SIA","Data","Manancial / Corpo Hídrico","Situação"],["C2",45,"2026-06-12","teste",""],["C2",46,"2026-06-13","teste","planned"],["",47,"2026-06-14","teste",""]]);
  const buf=new Uint8Array(await wb.xlsx.writeBuffer()),pkg={sources:[{name:"teste",hash:"a",campaign:2,marker:"COI" as const,rank:"familias" as const,run:"a",matrix:{headers:["t"],rows:[45,46,47].map(s=>({sia:normalizeMatrixSia(s)!,values:[1]}))},associations:{headers:["a"],rows:[]}}],notes:[]};
  const out=await buildCampaignMatrixWorkbook(pkg,{entries:[],complete:true,totalCount:0,persistence:"cloud"},2,undefined,[],undefined,undefined,{name:"campo.xlsx",size:buf.length,arrayBuffer:async()=>buf.buffer});
  const book=new Excel.Workbook();await book.xlsx.load(out.bytes);
  expect(out.sheetSias).toEqual(["SIA-0045"]);expect(out.unresolvedSias).toEqual(["SIA-0046","SIA-0047"]);expect(out.linkedByDiary).toBe(0);
  const final=book.getWorksheet("Resultados finais")!;expect(final.getCell("N2").text).toBe("2026-06-12");expect(final.getCell("P2").text).toContain("Ficha!2");expect(final.getCell("R2").text).toContain("não identifica visita");
  ws.getCell("A2").value="C1";const bad=new Uint8Array(await wb.xlsx.writeBuffer());await expect(buildCampaignMatrixWorkbook(pkg,{entries:[],complete:true,totalCount:0,persistence:"cloud"},2,undefined,[],undefined,undefined,{name:"campo.xlsx",size:bad.length,arrayBuffer:async()=>bad.buffer})).rejects.toThrow(/Campanha interna/);
});
it("C4 com campo mas sem resultado versionado não é analisada, nem recebe zero",()=>{
  const s=new Excel.Workbook().addWorksheet("final");
  const idx:IntegratedIndex={meta:{version:"IR-CAPTACAO-0.7-piloto",status:"piloto",rowsSha256:"0".repeat(64)},rows:[]};
  expect(addFinalResults(s,idx,4,["SIA-0001"],normalizeMatrixSia,()=>({day:"",status:"SEM DATA",source:""}))).toBe(0);
  expect(s.getCell("C1").text).toBe("Sem resultado localizado");expect(s.getCell("D1").text).toBe("");
  expect(()=>addFinalResults(s,{...idx,rows:[{campaign:"C3",sia:"1"}] as IntegratedIndex["rows"]},4,[],normalizeMatrixSia,()=>({day:"",status:"",source:""}))).toThrow(/outra campanha/);
});
it.skipIf(!process.env.SIA_REAL_INTEGRATED)("arquivos reais de campo + ZIP 16 matrizes + saída 0.7 da instância local",async()=>{
  async function get<T>(path:string){const r=await fetch("http://127.0.0.1:3100"+path,{redirect:"error"});expect(r.status).toBe(200);return await r.json() as T}
  const pkg=await readMatrixPackage([file(process.env.SIA_MATRIX_REAL_ZIP!)]);expect(pkg.sources.length).toBe(16);
  const snapshot=await get<DiarySnapshot>("/api/field-diary");
  const baseline=JSON.parse(readFileSync("src/lib/capture-index/indice-captacao.json","utf8")) as {rows:{campaign:number;sia:string;general:number|null;scores:Record<string,{score:number}|null>}[]};
  for(const c of [1,2,3,4]){
    const idx=await get<IntegratedIndex>("/api/results/capture-index?campaign="+c);
    expect(idx.rows.length).toBe([73,76,76,0][c-1]);
    if(c===4){await expect(buildCampaignMatrixWorkbook(pkg,snapshot,c,undefined,[],undefined,idx)).rejects.toThrow(/nenhum dataset/);continue}
    const ref=await get<{references:MatrixReferencePoint[];status:string;source:string}>("/api/imports/sia-matrices?campaign="+c+"&references=1");
    if(c===2){
      const wrong=file(process.env.SIA_FIELD_C1!);
      await expect(buildCampaignMatrixWorkbook(pkg,snapshot,c,undefined,[],undefined,idx,wrong)).rejects.toThrow(/diverge/);
      // The actual bytes of the C1 workbook do not become C2 evidence if the name loses its campaign.
      const noDiary={entries:[],persistence:"cloud",complete:true,totalCount:0};
      await expect(buildCampaignMatrixWorkbook(pkg,noDiary,c,undefined,[],undefined,idx,{...wrong,name:"campo.xlsx"})).rejects.toThrow(/SHA-256 diverge/);
    }
    const out=await buildCampaignMatrixWorkbook(pkg,snapshot,c,undefined,ref.references,ref,idx,c<=2?file(process.env["SIA_FIELD_C"+c]!):undefined);
    const book=new Excel.Workbook();await book.xlsx.load(out.bytes);const sheet=book.getWorksheet("Resultados finais")!;
    const by=new Map(sheet.getRows(2,sheet.rowCount-1)!.map(r=>[r.getCell(2).text,r]));
    expect(out.finalResultCount).toBe(idx.rows.length);
    for(const p of idx.rows)expect(by.get(normalizeMatrixSia(p.sia)!)?.getCell(4).text).toBe(p.measured?p.general:"");
    const original=baseline.rows.filter(p=>p.campaign===c);
    expect(original).toHaveLength(idx.rows.length);
    for(const p of original)expect([19,20,21,22].map(col=>by.get(normalizeMatrixSia(p.sia)!)!.getCell(col).value)).toEqual([p.general,...["Ambiental","Operacional","Saúde humana"].map(d=>p.scores[d]?.score??null)]);
    const ev=book.getWorksheet("Evidências de campo")!, vals=ev.getSheetValues().slice(2) as unknown[][];
    if(c===1){
      const bare=await buildCampaignMatrixWorkbook(pkg,snapshot,c,undefined,ref.references,ref,idx);
      expect(bare.linkedBySheet+bare.linkedByDiary).toBe(0);expect(bare.referenceOnlySias).toHaveLength(72);
      expect(out.linkedBySheet).toBe(72);expect(out.unresolvedSias).toEqual(["SIA-0305"]);
      for(const [sia,date] of [[106,"2026-03-07"],[146,"2026-03-03"],[241,"2026-03-07"],[244,"2026-03-08"]] as const)expect(by.get(normalizeMatrixSia(sia)!)?.getCell(14).text).toBe(date);
      expect(vals.some(r=>String(r[2]).includes("1037*")&&!r[3])).toBe(true);
      expect(vals.some(r=>String(r[12]).includes("valor salvo da fórmula"))).toBe(true);
    }
    if(c===2){expect(by.get("SIA-0174")!.getCell(14).text).toBe("2026-06-12");expect(by.get("SIA-0174")!.getCell(18).text).toContain("não identifica visita");expect(vals.some(r=>r[3]==="SIA-0174"&&r[7]==="not_realized"&&!r[9])).toBe(true);expect(out.linkedByDiary).toBe(75);expect(out.unresolvedSias).toEqual(["SIA-1037"])}
    if(c===2){
      for(const [sia,day] of [["SIA-0091","2026-06-21"],["SIA-0377","2026-06-22"]]){
        expect(by.get(sia)!.getCell(14).text).toBe(day);
        const detail=by.get(sia)!.getCell(24).text;
        for(const needle of ["Planilha1!","Planilha2!","2026-06-21","2026-06-22","Diário"])expect(detail).toContain(needle);
      }
      expect(by.get("SIA-0174")!.getCell(24).text).toContain("2026-06-18 (not_realized)");
      expect(vals.some(r=>String(r[2]).includes("3051037")&&!r[3])).toBe(true);
    }
    if(c===3){expect(new Set(pkg.sources.filter(s=>s.campaign===c).map(s=>s.run)).size).toBe(2);expect(out.linkedByDiary).toBe(76)}
    if(process.env.SIA_E4_OUT) writeFileSync(join(process.env.SIA_E4_OUT,`integrada-C${c}.xlsx`),new Uint8Array(out.bytes),{flag:"wx"});
    console.info(JSON.stringify({campaign:c,results:out.finalResultCount,matrixPoints:out.points,diaryDays:out.linkedByDiary,sheetDays:out.linkedBySheet,noConciliatedDay:out.unresolved,fieldLiteralReplicas:vals.filter(r=>r[12]).length,sourceDigest:idx.meta.rowsSha256,xlsxBytes:out.bytes.byteLength,sha256:createHash("sha256").update(new Uint8Array(out.bytes)).digest("hex")}));
  }
},240000);
