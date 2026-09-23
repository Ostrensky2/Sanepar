import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/api-auth",()=>({requireApiSession:mocks.auth}));
vi.mock("@/lib/private-methodology-pdf",()=>({readPrivateMethodologyPdf:mocks.read,METHODOLOGY_PDF_SHA256:"synthetic-hash"}));
import {GET} from "./route";
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({ok:true});mocks.read.mockResolvedValue(Buffer.from("%PDF-synthetic"));});
it("denies anonymous before reading private bytes, independent of local direct mode",async()=>{
  mocks.auth.mockResolvedValue({ok:false,response:Response.json({}, {status:401})});
  expect((await GET(new Request("https://example.org/api/results/methodology-pdf"))).status).toBe(401);expect(mocks.read).not.toHaveBeenCalled();
});
it("returns exact bytes inline with private no-store and safe filename",async()=>{
  const response=await GET(new Request("http://localhost/api/results/methodology-pdf"));
  expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request),"data.view");expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toBe('inline; filename="Metodologia.pdf"');expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("%PDF-synthetic"));
});
it("supports only explicit download; rejects arbitrary path/URL parameters",async()=>{
  expect((await GET(new Request("http://localhost/api/results/methodology-pdf?download=1"))).headers.get("content-disposition")).toContain("attachment;");
  mocks.read.mockClear();expect((await GET(new Request("http://localhost/api/results/methodology-pdf?path=../../secret"))).status).toBe(422);expect(mocks.read).not.toHaveBeenCalled();
});
it("does not disclose filesystem paths on missing private asset",async()=>{
  mocks.read.mockRejectedValue(new Error("ENOENT G:/private/secret.pdf"));const response=await GET(new Request("http://localhost/api/results/methodology-pdf"));
  expect(response.status).toBe(503);expect(await response.text()).not.toContain("G:/");
});
