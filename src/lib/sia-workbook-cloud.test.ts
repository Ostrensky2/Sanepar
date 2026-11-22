import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {cloudWorkbookStore,functionWorkbookLimit} from "./sia-workbook-cloud";
import {digest} from "./sia-workbook-store";

function fixture(){
  const objects=new Map<string,Buffer>();
  const config={id:"results-uploads",public:false,file_size_limit:26214400,allowed_mime_types:["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/octet-stream"]};
  const bucket={
    upload:vi.fn(async(key:string,b:Buffer,options:{upsert:boolean})=>{
      expect(options.upsert).toBe(false);expect(key).toMatch(/^sia-workbooks-v1\/(records|bytes)\//);
      if(objects.has(key))return {error:{statusCode:409}};
      objects.set(key,Buffer.from(b));return {error:null};
    }),
    download:async(key:string)=>({data:new Blob([new Uint8Array(objects.get(key)!)]),error:null}),
    list:vi.fn(async(prefix:string)=>({data:[...objects.keys()].filter(k=>k.startsWith(prefix+"/")).map(k=>({name:k.slice(prefix.length+1)})),error:null})),
  };
  const client={storage:{getBucket:async()=>({data:config,error:null}),from:()=>bucket}} as unknown as SupabaseClient;
  return {objects,bucket,client,config};
}
const actor={createdBy:"fixture",sourcesDeclared:[],pendingCount:0,corroboration:"workbook-internal" as const};
describe("persistência privada simulada",()=>{
  it("reconcilia respostas perdidas e rejeita corrupção e excesso sem sobrescrever",async()=>{
    const {client,objects}=fixture(),store=await cloudWorkbookStore(client),bytes=Buffer.from("fixture");
    const save=()=>store.save(1,"fixture.xlsx",bytes,digest(bytes),actor);
    const [a,b]=await Promise.all([save(),save()]);
    expect([a.created,b.created].sort()).toEqual([false,true]);expect(objects.size).toBe(2);
    const other=await cloudWorkbookStore(client);
    expect(await other.list()).toEqual([a.artifact]);expect((await other.read(a.artifact.id)).bytes).toEqual(bytes);
    objects.set("sia-workbooks-v1/bytes/"+digest(bytes)+".xlsx",Buffer.from("altered"));
    await expect(save()).rejects.toThrow("INTEGRITY");
    await expect(other.read(a.artifact.id)).rejects.toThrow("INTEGRITY");
    await expect(store.save(1,"x.xlsx",Buffer.alloc(functionWorkbookLimit+1),"",actor)).rejects.toThrow();
  });
  it("mantém erro de listagem e recusa bucket público",async()=>{
    const {client,bucket,config}=fixture(),store=await cloudWorkbookStore(client);
    bucket.list.mockRejectedValueOnce(Error("unavailable"));await expect(store.list()).rejects.toThrow();
    config.public=true;await expect(cloudWorkbookStore(client)).rejects.toThrow("PRIVATE_STORE_UNAVAILABLE");
  });
});
