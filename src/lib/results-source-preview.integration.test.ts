import { it, expect } from "vitest";
import { getResultsSourcePreview } from "./results-source-preview";
it.skipIf(process.env.E5_VERIFY_CORRECTED_SOURCE !== "1")("audits the real locked corrected source", async () => {
  const response = await getResultsSourcePreview(new URLSearchParams("campaignCode=C2&limit=1"));
  expect(response.source.sha256).toBe("4c9be948601a5b37e4d954ad2c2a08ebb6266a0e7ebec5d80dd6b987005ffa52");
  expect(response.campaign?.counts).toEqual({total:76,complete:70,partialWithTwoSets:5,partialWithOneSet:1,unavailable:0});
  expect(response.counts.population).toBe(7929);
}, 240000);
