import ExcelJS from "exceljs";
import {beforeEach,expect,it,vi} from "vitest";
import official from "@/lib/results-08-aggregate.json";
import {RESULTS_08_SOURCE_SHA256} from "@/lib/results-08-contract";
const mocks=vi.hoisted(()=>({auth:vi.fn(),source:vi.fn()}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:mocks.auth}));
vi.mock("@/lib/results-08-aggregate",()=>({results08Aggregate:mocks.source}));
import {GET} from "./route";
const request=(query="format=xlsx")=>new Request(`http://localhost/api/results/aggregate-export?${query}`);
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({ok:true});mocks.source.mockImplementation(()=>structuredClone(official));});
async function reopen(response:Response) { const book=new ExcelJS.Workbook();await book.xlsx.load(await response.arrayBuffer());return book; }
it("returns an authorized XLSX attachment whose reopened values match the official source",async()=>{
 const req=request(),response=await GET(req);expect(response.status).toBe(200);
 expect(mocks.auth).toHaveBeenCalledWith(req,"data.view");
 expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 expect(response.headers.get("content-disposition")).toContain('resultados-0.8-agregados-C1-C2-C3-total.xlsx');
 expect(response.headers.get("x-results-version")).toBe("0.8");expect(response.headers.get("x-source-sha256")).toBe(RESULTS_08_SOURCE_SHA256);
 expect(response.headers.get("cache-control")).toBe("private, no-store");
 const book=await reopen(response),sheet=book.getWorksheet("Agregados 0.8")!;
 expect(sheet.rowCount).toBe(17);let row=2;
 for(const series of Object.values(official.grupos)) for(const value of Object.values(series)){
  expect([5,6,7,8,9,10].map(c=>sheet.getRow(row).getCell(c).value)).toEqual([value.observados,value.numericos,value.nulos,value.minimo,value.media,value.maximo]);row++;
 }
 expect(book.getWorksheet("Fonte")!.getCell("B4").value).toBe(RESULTS_08_SOURCE_SHA256);
 expect(JSON.stringify(sheet.getRow(1).values)).not.toMatch(/SIA|organismo|localização/i);
});
it("honors group and preserves blank unavailable statistics versus documented zero",async()=>{
 const data=structuredClone(official);
 data.grupos.C2.geral08={observados:1,numericos:0,nulos:1,minimo:null,media:null,maximo:null,colunas:Array(40).fill(0),faixas:Array(5).fill(0)} as unknown as typeof data.grupos.C2.geral08;
 data.grupos.C2.ambiental={...data.grupos.C2.ambiental,minimo:0,media:0,maximo:0};
 mocks.source.mockReturnValue(data);
 const response=await GET(request("format=xlsx&group=C2"));const book=await reopen(response),sheet=book.getWorksheet("Agregados 0.8")!;
 expect(sheet.rowCount).toBe(5);expect(sheet.getCell("C2").value).toBe("C2");
 expect(sheet.getCell("H2").value).toBe(null);expect(sheet.getCell("H3").value).toBe(0);
});
it("rejects authorization, duplicate/nominal parameters and source failures without historical fallback",async()=>{
 mocks.auth.mockResolvedValueOnce({ok:false,response:new Response(null,{status:403})});expect((await GET(request())).status).toBe(403);expect(mocks.source).not.toHaveBeenCalled();
 for(const query of ["format=xlsx&format=csv","format=xlsx&sia=1","format=xlsx&group=C4","format=xlsx&version=0.7"]){expect((await GET(request(query))).status).toBe(422);}
 expect(mocks.source).not.toHaveBeenCalled();
 mocks.source.mockImplementation(()=>{throw Error("private path");});const failed=await GET(request());expect(failed.status).toBe(503);expect(failed.headers.get("content-disposition")).toBe(null);expect(await failed.text()).not.toContain("private path");
 mocks.source.mockReturnValue({...official,versao:"0.7"});expect((await GET(request())).status).toBe(503);
});
