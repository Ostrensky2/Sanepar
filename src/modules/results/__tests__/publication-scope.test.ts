import { describe, expect, it } from "vitest";

import { planCampaignPublicationScope, replaceCampaignsByScope } from "../publication-scope";
import type { ResultsCampaign } from "../types";

const identity = (campaignCode: string, publicationKey: string) => ({ campaignCode, publicationKey });
const campaign = (campaignCode: string, pointKeys: string[]) => ({
  campaignCode,
  points: pointKeys.map((key) => ({ key })),
  counts: {},
}) as unknown as ResultsCampaign;

describe("publicação por escopo de campanhas", () => {
  it("adiciona C3 e preserva integralmente C1/C2", () => {
    expect(planCampaignPublicationScope(
      [identity("C1", "p1"), identity("C2", "p2")],
      [identity("C3", "p3")],
    )).toEqual({
      selectedCampaignCodes: ["C3"],
      add: ["C3"],
      replace: [],
      unchanged: [],
      replay: [],
      preserve: ["C1", "C2"],
    });
  });

  it("substitui somente C1/C2/C3 e preserva C4", () => {
    expect(planCampaignPublicationScope(
      [identity("C1", "old-1"), identity("C2", "old-2"), identity("C4", "old-4")],
      [identity("C1", "new"), identity("C2", "new"), identity("C3", "new")],
    )).toEqual({
      selectedCampaignCodes: ["C1", "C2", "C3"],
      add: ["C3"],
      replace: ["C1", "C2"],
      unchanged: [],
      replay: [],
      preserve: ["C4"],
    });
  });

  it("classifica replay pela mesma identidade de publicação", () => {
    expect(planCampaignPublicationScope(
      [identity("C1", "same")],
      [identity("C1", "same")],
    )).toMatchObject({ unchanged: ["C1"], replay: ["C1"], preserve: [] });
  });

  it("substitui a campanha inteira sem manter pontos omitidos", () => {
    const result = replaceCampaignsByScope(
      [campaign("C1", ["C1|A", "C1|B"]), campaign("C2", ["C2|A"])],
      [campaign("C1", ["C1|A"])],
    );
    expect(result.map((item) => [item.campaignCode, item.points.map((point) => point.key)])).toEqual([
      ["C2", ["C2|A"]],
      ["C1", ["C1|A"]],
    ]);
  });

  it("rejeita lote vazio e campanhas duplicadas", () => {
    expect(() => planCampaignPublicationScope([], [])).toThrow("ao menos uma campanha");
    expect(() => planCampaignPublicationScope([], [identity("C1", "a"), identity("C1", "b")])).toThrow("duplicada");
  });
});
