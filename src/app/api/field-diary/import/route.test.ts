import { beforeEach, expect, it, vi } from "vitest";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/imports/excel";
const m=vi.hoisted(()=>({auth:vi.fn(),decode:vi.fn(),parse:vi.fn(),client:vi.fn(),photos:vi.fn()}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:m.auth}));
vi.mock("exceljs",()=>({default:{Workbook:class {xlsx={load:m.decode};}}}));
vi.mock("@/lib/imports/campaigns",()=>({parseCampaignWorkbook:m.parse}));
vi.mock("@/lib/supabase",()=>({createOptionalSupabaseClient:m.client}));
vi.mock("@/lib/imports/campaign-sheet-import",()=>({attachStoredPhotos:m.photos,campaignSheetScopeError:vi.fn(),normalizeCampaignKeys:vi.fn(),persistCampaignImport:vi.fn()}));
import { POST } from "./route";
function request(size:number) {
  const file=new File(["x"],"synthetic.xlsx");
  Object.defineProperty(file,"size",{value:size});
  const bytes=vi.spyOn(file,"arrayBuffer");
  const formData=vi.fn().mockResolvedValue({get:()=>file});
  return {request:{formData} as unknown as Request,bytes,formData};
}
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true});m.decode.mockRejectedValue(new Error("synthetic decoder stop"));});
it("rejects over 12 MB before byte reading, decoding, parsing or Storage",async()=>{
  const input=request(MAX_IMPORT_FILE_BYTES+1);
  expect((await POST(input.request)).status).toBe(413);
  for(const mock of [input.bytes,m.decode,m.parse,m.client,m.photos])expect(mock).not.toHaveBeenCalled();
});
it("keeps the exact 12 MB boundary permitted by the existing limit",async()=>{
  const input=request(MAX_IMPORT_FILE_BYTES);
  expect((await POST(input.request)).status).toBe(400); // Deliberate mock decoder rejection, not 413.
  expect(input.bytes).toHaveBeenCalledOnce();expect(m.decode).toHaveBeenCalledOnce();
  expect(m.client).not.toHaveBeenCalled();expect(m.photos).not.toHaveBeenCalled();
});
it("keeps authorization before reading multipart data",async()=>{
  m.auth.mockResolvedValue({ok:false,response:new Response(null,{status:401})});
  const input=request(MAX_IMPORT_FILE_BYTES+1);
  expect((await POST(input.request)).status).toBe(401);expect(input.formData).not.toHaveBeenCalled();
});
