import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({}));
import { linkedResultPoint, matchesRequestedResults } from "../campaigns-page-content";
import type { ResultsCampaign } from "@/modules/results/types";

describe("linked publication identity (synthetic)", () => {
  it("rejects partial, stale and absent identities rather than substituting another publication", () => {
    const publication = { publicationId: "synthetic-head", source: { sha256: "abc", fileName: "fixture.xlsx", namespaceRepairApplied: false } };
    expect(matchesRequestedResults(publication, "synthetic-head", "ABC")).toBe(true);
    expect(matchesRequestedResults(publication, "old-head", "abc")).toBe(false);
    expect(matchesRequestedResults(publication, "synthetic-head", "other")).toBe(false);
    expect(matchesRequestedResults(publication, "synthetic-head")).toBe(false);
    expect(matchesRequestedResults(null, "synthetic-head", "abc")).toBe(false);
    expect(matchesRequestedResults(null)).toBe(true);
  });
  it("selects exactly one canonical SIA and rejects missing, ambiguous and name-based matches", () => {
    const point = { siaCode: "SIA-0011" };
    const campaign = { points: [point] } as ResultsCampaign;
    expect(linkedResultPoint(campaign, "11")).toBe(point);
    expect(linkedResultPoint(campaign, "SIA-0011")).toBe(point);
    expect(linkedResultPoint(campaign, "Rio 11")).toBeUndefined();
    expect(linkedResultPoint(campaign, "12")).toBeUndefined();
    expect(linkedResultPoint({ points: [point, point] } as ResultsCampaign, "11")).toBeUndefined();
  });
});
