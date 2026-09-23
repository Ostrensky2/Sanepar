import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({source:vi.fn()}));
vi.mock("./results-publication-store",async original=>({...await original<typeof import("./results-publication-store")>(),readPublishedResultsSource:mocks.source}));
import { readMethodologyDocument,validateMethodologyDocument } from "./results-methodology-document";
const target={publicationId:"00000000-0000-4000-8000-000000000001",sourceHash:"a".repeat(64),calculationVersion:"SANEPAR-INDICE-0.3",catalogVersion:"SANEPAR-RISCOS-0.3"};
beforeEach(()=>{vi.clearAllMocks();mocks.source.mockResolvedValue({source:{publicationId:target.publicationId,sha256:target.sourceHash},parsed:{calculationVersion:target.calculationVersion,catalogVersion:target.catalogVersion}});});
it("accepts safe PDF/Word URLs and leaves unknown remote type unverified",()=>{
  expect(validateMethodologyDocument({name:" Método ",url:"https://example.org/method.pdf"})).toEqual({name:"Método",url:"https://example.org/method.pdf",type:"pdf"});
  expect(validateMethodologyDocument({name:"Método",url:"http://example.org/method.docx"}).type).toBe("word");
  expect(validateMethodologyDocument({name:"Método",url:"https://example.org/document?id=stable-file"}).type).toBeNull();
});
it.each(["javascript:alert(1)","https://user:secret@example.org/a.pdf","https://example.org/a.pdf?token=secret","https://example.org/a.pdf?X-Amz-Signature=signed","https://example.org/storage/v1/object/sign/a.pdf","https://127.0.0.1/a.pdf","https://localhost/a.pdf","https://example.org/%E0%A4%A","https://example.org/a.pdf#access_token=secret"])("rejects unsafe/temporary/malformed URL without fetching: %s",url=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  try {expect(()=>validateMethodologyDocument({name:"Método",url})).toThrow();expect(fetch).not.toHaveBeenCalled();} finally {vi.unstubAllGlobals();}
});
it("distinguishes authoritative missing from unavailable storage",async()=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:null});
  expect(await readMethodologyDocument({rpc} as never,new URLSearchParams())).toMatchObject({status:"missing",document:null,revisionHash:null,target});
  rpc.mockResolvedValue({data:null,error:{code:"PGRST202"}});
  await expect(readMethodologyDocument({rpc} as never,new URLSearchParams())).rejects.toMatchObject({status:503,code:"methodology_persistence_pending"});
  expect(rpc.mock.calls.every(c=>c[0]==="read_results_preparation")).toBe(true);
});
it("pins exact method/source and historical revision; mismatches fail closed",async()=>{
  const hash="b".repeat(64),document={name:"Método",url:"https://example.org/method.pdf",type:"pdf"};
  const stored={revisionHash:hash,manifest:{kind:"methodology_description",scope:{type:"methodology",target},methodologyDocument:document}};
  const rpc=vi.fn().mockResolvedValue({data:stored});
  expect(await readMethodologyDocument({rpc} as never,new URLSearchParams({revisionHash:hash}))).toMatchObject({status:"registered",revisionHash:hash,document});
  expect(rpc).toHaveBeenCalledWith("read_results_preparation",{p_package_key:`methodology:${target.publicationId}`,p_revision_hash:hash});
  rpc.mockResolvedValue({data:{...stored,manifest:{...stored.manifest,scope:{type:"methodology",target:{...target,calculationVersion:"other"}}}}});
  await expect(readMethodologyDocument({rpc} as never,new URLSearchParams())).rejects.toMatchObject({status:409});
});
