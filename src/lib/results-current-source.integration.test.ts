import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { parseResultsWorkbookWithModelV2 } from "@/modules/results/workbook";
import { queryResultsResearch } from "./results-research";

it.skipIf(!process.env.RESULTS_PRIVATE_TEST_SOURCE)("validates the explicitly selected private source without persistence", async () => {
  const file = process.env.RESULTS_PRIVATE_TEST_SOURCE!;
  const bytes = await readFile(file);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(process.env.RESULTS_PRIVATE_TEST_SHA);
  const { parsed, model } = await parseResultsWorkbookWithModelV2(bytes, file.split(/[\\/]/).at(-1)!);
  expect(model.campaignCodes).toEqual(parsed.campaigns.map(campaign => campaign.campaignCode));
  expect(model.sheets).toHaveLength(7);
  const source={sha256:parsed.source.sha256.toLowerCase(),fileName:parsed.source.fileName,publicationId:"isolated-test",published:true as const};
  const query=(value:string)=>queryResultsResearch(model,parsed,source,new URLSearchParams(value));
  expect(query("section=impacts").counts).toMatchObject({population:345,organisms:318,associations:345});
  expect(query("catalogScope=scored").counts.associations).toBe(305);
  expect(query("catalogScope=unscored").counts.associations).toBe(40);
  expect(query("catalogScope=all").counts.organisms).toBe(2543);
  expect(() => query("section=calculations")).toThrow();
  expect(() => query("section=method")).toThrow();
  expect(query("section=occurrences").counts.population).toBe(29460);
  console.info(JSON.stringify({sha256:parsed.source.sha256,records:parsed.molecularRecordCount,campaigns:parsed.campaigns.map(c=>({code:c.campaignCode,counts:c.counts})),warnings:parsed.warnings.length}));
}, 180000);
