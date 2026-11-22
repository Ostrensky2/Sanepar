import {expect,it} from "vitest";
import {Workbook} from "exceljs";
import {countWorkbookPoints,orderWorkbookVersions} from "../generated-workbooks";

it("distingue a mais recente por campanha e preserva IDs de arquivos homônimos",()=>{
  const item={filename:"resultado.xlsx",createdAt:"2026-11-22T09:00:00Z",campaign:1};
  const rows=[{...item,id:"a"},{...item,id:"c",campaign:2},{...item,id:"b"},{...item,id:"z",createdAt:"2026-11-22T08:59:59Z"}];
  expect(orderWorkbookVersions(rows).map(({item,latest})=>[item.id,latest])).toEqual([
    ["b",true],["a",false],["z",false],["c",true],
  ]);
});

it("conta somente SIAs distintas do rol Coletas e sinaliza identidades inválidas", () => {
  const workbook = new Workbook();
  expect(() => countWorkbookPoints(workbook)).toThrow();
  const roster = workbook.addWorksheet("Coletas");
  roster.addRows([["SIA"], ["SIA-0017"], [17], ["SIA-0031"]]);
  workbook.addWorksheet("Réplicas").addRows([["SIA"], [99]]);
  expect(countWorkbookPoints(workbook)).toBe(2);
  roster.addRow(["17/31"]);
  expect(() => countWorkbookPoints(workbook)).toThrow();
});
