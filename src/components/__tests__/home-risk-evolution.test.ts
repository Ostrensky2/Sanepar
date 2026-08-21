import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { countOperationallyActiveCampaigns } from "@/components/home-canonical-kpis";
import {
  HomeRiskEvolution,
  buildRiskEvolutionPeriods,
  buildRiskPointOptions,
  riskPointIdentityKey,
} from "@/components/home-risk-evolution";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import type { LaboratoryRiskPoint } from "@/lib/laboratory-risk";

vi.mock("@/lib/supabase", () => ({
  getLatestPublishedCampaignImport: vi.fn(),
  getLatestPublishedLaboratoryRiskPoints: vi.fn(),
}));

import { countCampaignsWithEffectiveCollection } from "@/lib/dashboard-data";

describe("home risk evolution", () => {
  it("counts only campaigns in execution, not concluded or merely planned", () => {
    expect(
      countOperationallyActiveCampaigns([
        "Resultados publicados",
        "Em análise",
        "Em campo",
        "Planejada",
        "Planejada",
        "Planejada",
        "Planejada",
        "Planejada",
        "Planejada",
      ]),
    ).toBe(2);
  });

  it("counts only operational collections and canonicalizes duplicate campaign labels", () => {
    const points = [
      campaignPoint("1", "1ª Campanha - Verão 2026"),
      campaignPoint("2a", "2"),
      campaignPoint("2b", "2ª Campanha - Outono 2026"),
      campaignPoint("3", "3ª Campanha - Inverno 2026"),
      campaignPoint("4", "4ª Campanha - Primavera 2026", { activities: [] }),
    ];

    expect(countCampaignsWithEffectiveCollection(points)).toBe(3);
  });

  it("uses finite arithmetic means and leaves unpublished campaigns empty", () => {
    const periods = buildRiskEvolutionPeriods([
      riskPoint("c1-a", "1ª Campanha - Verão 2026", "SIA-0001", 0.2),
      riskPoint("c1-b", "1", "SIA-0002", 0.6),
      riskPoint("c1-null", "1", "SIA-0003", null),
      riskPoint("c1-invalid", "1", "SIA-0004", Number.NaN),
      riskPoint("c2-a", "Campanha 2", "SIA-0001", 0.8),
    ]);

    expect(periods).toHaveLength(9);
    expect(periods[0].score).toBeCloseTo(0.4);
    expect(periods[1].score).toBeCloseTo(0.8);
    expect(periods.slice(2).every((period) => period.score === null)).toBe(true);
  });

  it("colors C1/C2 means from the nearest published classified result", () => {
    const periods = buildRiskEvolutionPeriods([
      riskPoint("c1-a", "1", "SIA-0001", 0.5, undefined, undefined, "moderado"),
      riskPoint("c1-b", "1", "SIA-0002", 0.598, undefined, undefined, "moderado"),
      riskPoint("c2-a", "2", "SIA-0001", 0.53, undefined, undefined, "moderado"),
      riskPoint("c2-b", "2", "SIA-0002", 0.602, undefined, undefined, "moderado"),
    ]);

    expect(periods[0]).toMatchObject({
      color: "#FC883A",
      riskLabel: expect.stringContaining("faixa visual derivada"),
    });
    expect(periods[0].score).toBeCloseTo(0.549);
    expect(periods[1]).toMatchObject({
      color: "#FC883A",
      riskLabel: expect.stringContaining("Risco moderado"),
    });
    expect(periods[1].score).toBeCloseTo(0.566);
    expect(periods.slice(0, 2).some((period) => period.color === "var(--brand-teal)")).toBe(false);
  });

  it("breaks nearest-score ties by input order and fails neutral without a class", () => {
    const first = riskPoint("first", "1", "SIA-0001", 0.4, undefined, undefined, "baixo");
    const second = riskPoint("second", "1", "SIA-0002", 0.6, undefined, undefined, "alto");
    const tie = buildRiskEvolutionPeriods([first, second])[0];
    const withoutClass = {
      ...riskPoint("unclassified", "2", "SIA-0003", 0.6),
      riskLevel: undefined,
    } as unknown as LaboratoryRiskPoint;
    const neutral = buildRiskEvolutionPeriods([withoutClass])[1];

    expect(tie.color).toBe("#16a34a");
    expect(tie.riskLabel).toContain("Risco baixo");
    expect(neutral).toMatchObject({ score: 0.6, color: null });
    expect(neutral.riskLabel).toContain("faixa visual indisponível");
  });

  it("filters by normalized SIA and uses municipality-safe name fallback", () => {
    const points = [
      riskPoint("c1", "1", "SIA-0780", 0.55),
      riskPoint("c2", "2", "780", 0.61),
      riskPoint("fallback-a", "1", "", 0.25, "Captação Central", "Curitiba"),
      riskPoint("fallback-b", "2", "", 0.75, "Captação Central", "Londrina"),
    ];
    const periods = buildRiskEvolutionPeriods(points, "sia:780");
    const options = buildRiskPointOptions(points);

    expect(periods[0]).toMatchObject({ score: 0.55, riskLabel: "Risco baixo" });
    expect(periods[1]).toMatchObject({ score: 0.61, riskLabel: "Risco baixo" });
    expect(periods.slice(2).every((period) => period.score === null)).toBe(true);
    expect(options.filter((option) => option.key === "sia:780")).toHaveLength(1);
    expect(riskPointIdentityKey(points[2])).not.toBe(riskPointIdentityKey(points[3]));
  });

  it("renders a searchable native input and column chart without a select", () => {
    const markup = renderToStaticMarkup(
      createElement(HomeRiskEvolution, {
        points: [riskPoint("c1", "1", "SIA-0780", 0.855)],
      }),
    );

    expect(markup).toContain('type="search"');
    expect(markup).toContain('<datalist id="risk-point-options">');
    expect(markup).not.toContain("<select");
    expect(markup).toContain(
      "app-card overflow-hidden border-[var(--line-ghost)] bg-[var(--surface-panel)] p-0 shadow-[var(--shadow-soft)]",
    );
    expect(markup).toContain("height:85.5%");
    expect(markup).toContain("Sem resultado");
    expect(markup).toContain("C9");
  });
});

function campaignPoint(
  id: string,
  campaign: string,
  overrides: Partial<CampaignMapPoint> = {},
): CampaignMapPoint {
  return {
    id,
    code: `SIA-${id}`,
    point: `Ponto ${id}`,
    day: "1",
    campaign,
    date: "2026-01-01",
    waterBody: "Manancial",
    municipality: "Curitiba",
    original: null,
    effective: { lat: -25.4, lon: -49.2 },
    accessibility: "",
    waterAspect: "",
    weatherConditions: "",
    problems: "",
    activities: ["Coleta realizada"],
    driveUrl: "",
    dropboxUrl: "",
    photoUrl: "",
    ...overrides,
  };
}

function riskPoint(
  id: string,
  campaign: string,
  code: string,
  score: number | null,
  point = `Ponto ${id}`,
  municipality = "Curitiba",
  riskLevel: LaboratoryRiskPoint["riskLevel"] = "baixo",
): LaboratoryRiskPoint {
  return {
    ...campaignPoint(id, campaign),
    code,
    point,
    municipality,
    riskLevel,
    riskLabel:
      riskLevel === "alto"
        ? "Risco alto"
        : riskLevel === "moderado"
          ? "Risco moderado"
          : riskLevel === "baixoModerado"
            ? "Baixo a moderado"
            : "Risco baixo",
    riskClassification: "Baixo",
    environmentalRisk: "Baixo",
    operationalRisk: "Baixo",
    sanitaryRisk: "Baixo",
    environmentalRiskLevel: "baixo",
    operationalRiskLevel: "baixo",
    sanitaryRiskLevel: "baixo",
    eta: "ETA",
    detectedMarkers: [],
    ednaSignal: "Baixo",
    laboratoryStatus: "homologado",
    resultSummary: "Resultado publicado",
    score,
    confidence: "Alta",
    recommendations: "Monitorar",
    rankingPosition: 1,
    sampleId: id,
  };
}
