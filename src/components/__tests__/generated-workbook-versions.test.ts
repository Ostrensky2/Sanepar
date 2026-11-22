import {expect,it} from "vitest";
import {orderWorkbookVersions} from "../generated-workbooks";

it("distingue a mais recente por campanha e preserva IDs de arquivos homônimos",()=>{
  const item={filename:"resultado.xlsx",createdAt:"2026-11-22T09:00:00Z",campaign:1};
  const rows=[{...item,id:"a"},{...item,id:"c",campaign:2},{...item,id:"b"},{...item,id:"z",createdAt:"2026-11-22T08:59:59Z"}];
  expect(orderWorkbookVersions(rows).map(({item,latest})=>[item.id,latest])).toEqual([
    ["b",true],["a",false],["z",false],["c",true],
  ]);
});
