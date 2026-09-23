import {expect,it} from "vitest";
import {readPrivateMethodologyPdf,verifyMethodologyPdf,METHODOLOGY_PDF_SHA256} from "./private-methodology-pdf";
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import path from "node:path";

it("rejects a fake PDF before serving",()=>{expect(()=>verifyMethodologyPdf(Buffer.from("%PDF-synthetic"))).toThrow();});
it.skipIf(!existsSync(path.resolve(process.cwd(),"../private-results",`Metodologia.pdf.${METHODOLOGY_PDF_SHA256.toUpperCase()}`)))("reads the literal private asset and detects any byte modification",async()=>{
  const bytes=await readPrivateMethodologyPdf();expect(bytes.byteLength).toBe(797812);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(METHODOLOGY_PDF_SHA256);
  const altered=Buffer.from(bytes);altered[100]^=1;expect(()=>verifyMethodologyPdf(altered)).toThrow();
});
