import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildCriticalMunicipalitySummary,
  countOperationallyActiveCampaigns,
} from "@/components/home-canonical-kpis";
import { RiskPhotoModal } from "@/components/home-risk-map-section";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import {
  HomeRiskEvolution,
  buildRiskEvolutionPeriods,
  buildRiskPointOptions,
  filterRiskPointOptions,
  riskPointIdentityKey,
} from "@/components/home-risk-evolution";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import {
  laboratoryRiskColor,
  laboratoryRiskTextColor,
  type LaboratoryRiskPoint,
} from "@/lib/laboratory-risk";

vi.mock("@/lib/supabase", () => ({
  getLatestPublishedCampaignImport: vi.fn(),
  getLatestPublishedLaboratoryRiskPoints: vi.fn(),
}));

import { countCampaignsWithEffectiveCollection } from "@/lib/dashboard-data";

describe("home risk evolution", () => {
  it("opens the review dialog from one removable flag and removes the static notice", () => {
    const source = readFileSync(
      new URL("../../app/(dashboard)/page.tsx", import.meta.url),
      "utf8",
    );
    const noticeStart = source.indexOf("{SHOW_RESULTS_REVIEW_NOTICE ?");
    const kpisStart = source.indexOf("<HomeCanonicalKpis");
    const markup = renderToStaticMarkup(createElement(ResultsReviewDialog));
    const dialogSource = readFileSync(
      new URL("../results-review-dialog.tsx", import.meta.url),
      "utf8",
    );

    expect(source.match(/const SHOW_RESULTS_REVIEW_NOTICE = true;/g)).toHaveLength(1);
    expect(noticeStart).toBeGreaterThan(source.indexOf("Painel de Monitoramento"));
    expect(noticeStart).toBeLessThan(kpisStart);
    expect(source).toContain("<ResultsReviewDialog />");
    expect(source).not.toContain("Resultados da 2ª Campanha em revisão");
    expect(markup).toContain("<dialog");
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain(">Aviso<");
    expect(markup).toContain(
      "Os resultados da primeira e da segunda campanha serão ainda integralmente revisados para que possamos investigar especificamente os organismos solicitados pela Sanepar. Em breve apresentaremos aqui os resultados finais refinados.",
    );
    expect(markup).toContain("Fechar aviso");
    expect(dialogSource).toContain("dialog.showModal()");
    expect(dialogSource).toContain('document.body.style.overflow = "hidden"');
    expect(dialogSource).toContain("previousFocusRef.current?.focus()");
    expect(dialogSource).toContain("onClick={closeDialog}");
    expect(dialogSource).toContain("onCancel={(event) =>");
    expect(dialogSource).toContain("event.target === event.currentTarget");
    expect(dialogSource).toContain("min-h-11");
  });

  it("uses WCAG-safe white text for high and moderate risk", () => {
    expect(laboratoryRiskColor("alto")).toBe("#E52908");
    expect(laboratoryRiskColor("moderado")).toBe("#B85A0D");
    expect(laboratoryRiskTextColor("alto")).toBe("#ffffff");
    expect(laboratoryRiskTextColor("moderado")).toBe("#ffffff");
    expect(contrastRatio("#E52908", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#B85A0D", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(laboratoryRiskColor("baixoModerado")).toBe("#CDC602");
    expect(laboratoryRiskColor("baixo")).toBe("#16a34a");
  });

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

  it("summarizes critical municipalities with a stable count and complete list", () => {
    expect(
      buildCriticalMunicipalitySummary(["Pinhais", "Curitiba", "Pinhais", "Arapongas"]),
    ).toEqual({
      count: 3,
      names: ["Pinhais", "Curitiba", "Arapongas"],
      summary: "Pinhais, Curitiba +1",
    });
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
      color: "#B85A0D",
      riskLabel: expect.stringContaining("faixa visual derivada"),
    });
    expect(periods[0].score).toBeCloseTo(0.549);
    expect(periods[1]).toMatchObject({
      color: "#B85A0D",
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
    expect(filterRiskPointOptions(options, "sia 0780")).toEqual([
      expect.objectContaining({ key: "sia:780" }),
    ]);
    expect(filterRiskPointOptions(options, "londr")).toEqual([
      expect.objectContaining({ key: riskPointIdentityKey(points[3]) }),
    ]);
    expect(riskPointIdentityKey(points[2])).not.toBe(riskPointIdentityKey(points[3]));
  });

  it("renders searchable controls, a compact mobile chart and the mean-color qualifier", () => {
    const markup = renderToStaticMarkup(
      createElement(HomeRiskEvolution, {
        points: [riskPoint("c1", "1", "SIA-0780", 0.855)],
      }),
    );

    expect(markup).toContain('type="search"');
    expect(markup).toContain('role="combobox"');
    expect(markup).not.toContain("<datalist");
    expect(markup).not.toContain("<select");
    expect(markup).toContain("Limpar");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("Aplicado: ");
    expect(markup).toContain("min-w-[42rem]");
    expect(markup).not.toContain("text-[7.5px]");
    expect(markup).not.toContain("text-[10px]");
    expect(markup).toContain("Cor da média: faixa do resultado publicado mais próximo.");
    expect(markup).toContain(
      "app-card overflow-hidden border-[var(--line-ghost)] bg-[var(--surface-panel)] p-0 shadow-[var(--shadow-soft)]",
    );
    expect(markup).toContain("height:85.5%");
    expect(markup).toContain("Sem resultado");
    for (const label of [
      "Verão 26",
      "Outono 26",
      "Inverno 26",
      "Primavera 26",
      "Verão 27",
      "Outono 27",
      "Inverno 27",
      "Primavera 27",
      "Verão 28",
    ]) {
      expect(markup).toContain(`>${label}<`);
    }
    expect(markup).not.toContain(">C9<");
    expect(markup).toContain("9ª Campanha - Verão 2028: Sem resultado");
    const source = readFileSync(
      new URL("../home-risk-evolution.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "Enter"');
    expect(source).toContain('role="listbox"');
    expect(source).toContain("if (!query) setSelectedPointKey(ALL_POINTS)");
    expect(source).toContain("disabled={!pointQuery && !hasAppliedPoint}");
    expect(source).toContain("absolute inset-x-0 top-full z-20");
    expect(source).toContain("Nenhum ponto encontrado.");
    expect(source).toContain("onBlurCapture={(event) =>");
    expect(source).toContain("event.relatedTarget as Node | null");
    expect(source).toContain("setActiveSuggestion(-1)");
  });

  it("renders the photo modal as a native accessible dialog and protects its focus lifecycle", () => {
    const point = riskPoint("photo", "1", "SIA-0780", 0.855);
    const markup = renderToStaticMarkup(
      createElement(RiskPhotoModal, {
        point: { ...point, photoUrl: "https://example.test/photo.jpg" },
        onClose: () => undefined,
      }),
    );
    const source = readFileSync(
      new URL("../home-risk-map-section.tsx", import.meta.url),
      "utf8",
    );

    expect(markup).toContain("<dialog");
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="risk-photo-title"');
    expect(source).toContain("dialog.showModal()");
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain("previousFocus?.focus()");
    expect(source).toContain("event.target === event.currentTarget");
    expect(source).toContain("onDoubleClick={onExpand}");
    expect(source).toContain("event.target === event.currentTarget && event.detail === 1");
    expect(source).toContain("min-h-11 min-w-11");
    expect(source).toContain("focus-visible:ring-[var(--brand-teal)]");
    expect(source).toContain("w-[calc(100%_-_2rem)]");
    expect(source).not.toContain("w-[calc(100%-2rem)]");
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

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
