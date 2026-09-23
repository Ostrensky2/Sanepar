import ExcelJS from "exceljs";
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:async()=>({ok:true})}));
vi.mock("@/lib/results-source-preview",()=>({localSourcePreviewAllowed:()=>true,readExactPreviewDownload:m.read}));
import {GET} from "./route";
it("round-trips all seven synthetic worksheets byte-for-byte without publishing",async()=>{
 const book=new ExcelJS.Workbook();
 const names=["Metadata-C2","Riscos_bibliografia","Evidencias_risco","Criterios_scores","Indices_pontos","Calculo_conjuntos","Metodo_calculo"];
 for(const name of names)book.addWorksheet(name).addRow(["SYNTHETIC",0,null,"NA"]);
 const bytes=Buffer.from(await book.xlsx.writeBuffer());
 m.read.mockResolvedValue({bytes,fileName:"synthetic.xlsx",sha256:"synthetic"});
 const response=await GET(new Request("http://localhost/x?source=local-corrected-preview&sourceHash=synthetic&campaignCode=C3"));
 const returned=Buffer.from(await response.arrayBuffer());expect(returned.equals(bytes)).toBe(true);
 const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(returned as never);
 expect(reopened.worksheets.map(s=>s.name)).toEqual(names);
 expect(reopened.worksheets[0].getCell("B1").value).toBe(0);
});
