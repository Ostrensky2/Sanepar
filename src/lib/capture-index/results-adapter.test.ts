import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const dashboard = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));
vi.mock("@/lib/dashboard-data", () => ({ loadDashboardData: dashboard }));
vi.mock("@/components/campaign-hydro-map", () => ({ CampaignHydroMap: () => null, continuousResultColor: () => "#000000" }));

import { GET } from "@/app/api/results/capture-index/campaigns/route";
import { captureIndexRows } from "@/lib/capture-index";
import { canonicalSia, captureIndexResultsCampaigns } from "@/lib/capture-index/results-adapter";
import { buildResultMapPoints, pointCoverage } from "@/modules/results/components/results-index-dashboard";
import { hasLimitedCoverage } from "@/modules/results/components/result-visual";
import { completeOverallSummary, orderCaptureCampaignsForHome } from "@/modules/results/components/home-results-v2";
import { ResultsIndexDashboard } from "@/modules/results/components/results-index-dashboard";

describe("ponte do índice de captação para as telas de resultados", () => {
  const campaigns = captureIndexResultsCampaigns(new Map([["220", { latitude: -25.4, longitude: -49.2, waterBody: "Rio de teste", municipality: "Município de teste" }]]));

  it("entrega as três campanhas com os mesmos números da saída versionada", () => {
    expect(campaigns.map(item => [item.campaignCode, item.points.length, item.counts.complete])).toEqual([["C1", 73, 73], ["C2", 76, 76], ["C3", 76, 76]]);
    for (const campaign of campaigns) for (const point of campaign.points) {
      const row = captureIndexRows(Number(campaign.campaignCode.slice(1))).find(item => item.sia === point.siaCode)!;
      expect([point.overall.value, point.overall.rank]).toEqual([row.general, row.rank]);
      expect(point.domains.environmental.value).toBe(row.scores.Ambiental!.score);
      expect(point.domains.operational.value).toBe(row.scores.Operacional!.score);
      expect(point.domains.humanHealth.value).toBe(row.scores["Saúde humana"]!.score);
      expect(point.domains.humanHealth.lower).toBeLessThanOrEqual(point.domains.humanHealth.upper);
      expect(point.components.coi.included).toBe(row.components.COI.status === "disponível");
    }
  });

  it("a média da Home é a média da rede, com um voto por ponto", () => {
    const c2 = campaigns[1], rows = captureIndexRows(2);
    expect(completeOverallSummary(c2).mean!).toBeCloseTo(rows.reduce((sum, row) => sum + row.general!, 0) / rows.length, 12);
    expect(orderCaptureCampaignsForHome(campaigns).map(item => item.campaignCode)).toEqual(["C3", "C2", "C1"]);
  });

  it("localiza só os pontos com coordenada conhecida e não inventa posição", () => {
    const located = campaigns.flatMap(item => item.points).filter(point => point.coordinates);
    expect(located.map(point => point.siaCode)).toEqual(["220", "220", "220"]);
    expect(located[0]).toMatchObject({ waterBody: "Rio de teste", municipality: "Município de teste" });
  });

  it("reconhece o código SIA em qualquer grafia e põe o ponto no mapa", () => {
    expect(["SIA-0220", "0220", "220", " sia 220 "].map(canonicalSia)).toEqual(["220", "220", "220", "220"]);
    expect(canonicalSia("lab12")).not.toBe(canonicalSia("SIA-0012")); // código de laboratório sem SIA não vira ponto 12
    const mapped = buildResultMapPoints(campaigns[2].points);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({ code: "220", effective: { lat: -25.4, lon: -49.2 }, resultValue: campaigns[2].points.find(point => point.siaCode === "220")!.overall.value });
  });

  it("a cobertura limitada segue a categoria que deu a nota, em qualquer nota", () => {
    const count = (code: string) => {
      const points = campaigns.find(item => item.campaignCode === code)!.points;
      const limited = points.filter(point => hasLimitedCoverage(pointCoverage(point)));
      return [limited.length, limited.filter(point => point.overall.value! >= 0.05).length, points.length];
    };
    // [com cobertura limitada, desses com algum sinal, pontos da campanha]
    expect([count("C1"), count("C2"), count("C3")]).toEqual([[19, 6, 73], [66, 40, 76], [48, 9, 76]]);
    // na visão de uma categoria, vale a cobertura dela; na geral, a da categoria que determinou a nota; em empate, a menor
    const point = campaigns[2].points.find(item => item.siaCode === "220")!;
    expect(pointCoverage(point, "humanHealth")).toBe(point.bibliographicCoverage.humanHealth);
    expect(pointCoverage(point)).toBe(point.bibliographicCoverage.humanHealth); // SIA 220: a nota geral vem da saúde
    const tie = { ...point, domains: { environmental: { value: 0.2, lower: 0, upper: 0 }, operational: { value: 0.2, lower: 0, upper: 0 }, humanHealth: { value: 0.1, lower: 0, upper: 0 } },
      bibliographicCoverage: { environmental: 0.5, operational: 0.1, humanHealth: 0.9 } };
    expect(pointCoverage(tie)).toBe(0.1);
    expect(buildResultMapPoints([point], "operational")[0].resultCoverage).toBe(point.bibliographicCoverage.operational);
    expect(buildResultMapPoints(campaigns[2].points)[0]).toMatchObject({ resultLimitedCoverage: expect.any(Boolean), resultCoverage: expect.any(Number) });
  });

  it("o painel de resultados existente renderiza com o índice novo", () => {
    const markup = renderToStaticMarkup(createElement(ResultsIndexDashboard, { campaigns, initialCampaignCode: "C3", summary: true }));
    expect(markup).toContain("Resultados por índices");
    expect(markup.length).toBeGreaterThan(500);
  });

  it("a rota exige data.view, junta as coordenadas dos pontos de campo e segue sem elas se a consulta falhar", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await GET(new Request("http://local.test/api/results/capture-index/campaigns"))).status).toBe(401);
    auth.mockResolvedValue({ ok: true });
    dashboard.mockResolvedValue({ campaignPoints: [{ code: "SIA-0220", campaign: "Campanha 1", effective: { lat: -25.9, lon: -49.9 }, waterBody: "Rio", municipality: "Cidade" }, { code: "SIA-0220", campaign: "Campanha 3", effective: { lat: -25.4, lon: -49.2 }, waterBody: "Rio", municipality: "Cidade" }, { code: "78", effective: null, waterBody: "", municipality: "" }] });
    const ok = await GET(new Request("http://local.test/api/results/capture-index/campaigns"));
    expect(auth).toHaveBeenCalledWith(expect.any(Request), "data.view");
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    const payload = await ok.json();
    expect(payload.version).toBe("IR-CAPTACAO-0.7-piloto");
    expect(payload.campaigns[2].points.find((point: { siaCode: string }) => point.siaCode === "220").coordinates).toMatchObject({ latitude: -25.4, longitude: -49.2 });
    expect(payload.campaigns[2].points.find((point: { siaCode: string }) => point.siaCode === "78").coordinates).toBeNull();
    // a ordem de entrada não decide: cada campanha usa a sua coordenada; a C2, sem registro próprio, usa a reserva do mesmo SIA
    expect(payload.campaigns[0].points.find((point: { siaCode: string }) => point.siaCode === "220").coordinates).toMatchObject({ latitude: -25.9 });
    expect(payload.campaigns[1].points.find((point: { siaCode: string }) => point.siaCode === "220").coordinates).toMatchObject({ latitude: -25.9 });
    dashboard.mockRejectedValue(new Error("offline"));
    const fallback = await (await GET(new Request("http://local.test/api/results/capture-index/campaigns"))).json();
    expect(fallback.campaigns).toHaveLength(3);
  });
});
