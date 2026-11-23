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
import { buildResultMapPoints } from "@/modules/results/components/results-index-dashboard";
import { completeOverallSummary, orderCaptureCampaignsForHome } from "@/modules/results/components/home-results-v2";
import { ResultsIndexDashboard } from "@/modules/results/components/results-index-dashboard";

describe("ponte do índice de captação para as telas de resultados", () => {
  const campaigns = captureIndexResultsCampaigns(new Map([["220", { latitude: -25.4, longitude: -49.2, waterBody: "Rio de teste", municipality: "Município de teste" }]]));

  it("entrega as três campanhas com os mesmos números da saída versionada", () => {
    expect(campaigns.map(item => [item.campaignCode, item.points.length, item.counts.complete])).toEqual([["C1", 73, 73], ["C2", 76, 75], ["C3", 76, 76]]);
    for (const campaign of campaigns) for (const point of campaign.points) {
      const row = captureIndexRows(Number(campaign.campaignCode.slice(1))).find(item => item.sia === point.siaCode)!;
      expect([point.overall.value, point.overall.rank]).toEqual([row.general, row.rank]);
      expect(point.domains.environmental.value).toBe(row.scores.Ambiental?.score ?? null);
      expect(point.domains.operational.value).toBe(row.scores.Operacional?.score ?? null);
      expect(point.domains.humanHealth.value).toBe(row.scores["Saúde humana"]?.score ?? null);
      expect(point.calculationVersion).toBe("IR-CAPTACAO-0.8");
      expect(point.riskProfiles?.map(profile => profile.key)).toEqual(["operacional", "sanitario"]);
      expect(point.domains.humanHealth.lower).toBeLessThanOrEqual(point.domains.humanHealth.upper);
      expect(point.components.coi.included).toBe(row.components.COI.status === "disponível");
    }
  });

  it("a média da Home é a média da rede, com um voto por ponto", () => {
    const c2 = campaigns[1], rows = captureIndexRows(2).filter(row => row.general !== null);
    expect(completeOverallSummary(c2).mean!).toBeCloseTo(rows.reduce((sum, row) => sum + row.general!, 0) / rows.length, 12);
    expect(orderCaptureCampaignsForHome(campaigns).map(item => item.campaignCode)).toEqual(["C3", "C2", "C1"]);
  });

  it("sem estimativa não vira zero nem faixa: C2 · SIA 257 fica fora da média e do ranking", () => {
    const point = campaigns[1].points.find(item => item.siaCode === "257")!;
    expect([point.overall.value, point.overall.rank, point.completeness, point.estimateState]).toEqual([null, null, "unavailable", "sem estimativa"]);
    expect([point.domains.humanHealth.value, point.domains.environmental.value !== null, point.domains.operational.value !== null]).toEqual([null, true, true]);
    expect(point.conditionOfUse).toContain("Sem estimativa");
    const zero = campaigns[0].points.find(item => item.siaCode === "17")!;
    expect([zero.domains.operational.value, zero.estimateState]).toEqual([0, "estimado"]);
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
    expect(payload.version).toBe("IR-CAPTACAO-0.8");
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
