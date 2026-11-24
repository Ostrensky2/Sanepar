import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { results08HomeDistribution } from "@/lib/results-08-aggregate";
import { GET } from "./route";
const values = results08HomeDistribution();
const auth = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));

it("expõe exclusivamente os agregados C1–C3 validados", async () => {
  auth.mockResolvedValue({ ok: true });
  const request = new Request("http://localhost/api/results/campaign-distribution");
  const response = await GET(request);
  expect(auth).toHaveBeenCalledWith(request, "data.view");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(await response.json()).toEqual(values);
  expect(values.versao).toBe("0.8");
  expect(values.sourceSha256).toBe("5667da69789821f2744812e516282e54fdb73008e8cdb80051801931af455308");
  expect(Object.keys(values.campanhas)).toEqual(["C1", "C2", "C3"]);
  for (const [campaign, domains] of Object.entries(values.campanhas)) {
    expect(Object.keys(domains).sort()).toEqual(["ambiental", "geral", "operacional", "saude"]);
    for (const [domain, row] of Object.entries(domains)) {
      expect(Object.keys(row).sort()).toEqual(["colunas", "faixas", "maximo", "media", "minimo", "n", "nulos", "numericos", "observados"]);
      expect(row.observados).toBe(campaign === "C1" ? 73 : 76);
      expect(row.nulos).toBe(campaign === "C2" && ["geral", "saude"].includes(domain) ? 1 : 0);
      expect(row.n).toBe(row.numericos);
      expect(row.n + row.nulos).toBe(row.observados);
      expect(row.colunas).toHaveLength(40);
      expect(row.colunas.every(v => Number.isInteger(v) && v >= 0)).toBe(true);
      expect(row.colunas.reduce((a,b) => a+b, 0)).toBe(row.n);
      expect(row.minimo).toBeGreaterThanOrEqual(0);
      expect(row.media).toBeGreaterThanOrEqual(row.minimo!);
      expect(row.media).toBeLessThanOrEqual(row.maximo!);
      expect(row.maximo).toBeLessThanOrEqual(1);
    }
  }
});

it.each([401,403])("preserva negativa %i sem conteúdo", async status => {
  auth.mockResolvedValue({ ok:false, response:new Response(null,{status}) });
  const response = await GET(new Request("http://localhost/api/results/campaign-distribution"));
  expect(response.status).toBe(status);
  expect(await response.text()).toBe("");
});

it("mantém o percentual da campanha inclusive nos intervalos vazios e a interpretação editorial", () => {
  const component = readFileSync("src/modules/results/components/campaign-distribution.tsx", "utf8");
  expect(component).toContain("count / row.n / top");
  for (const domains of Object.values(values.campanhas)) {
    for (const distribution of Object.values(domains)) {
      const percentages = distribution.colunas.map(count => 100 * count / distribution.n);
      expect(percentages.reduce((total, part) => total + part, 0)).toBeCloseTo(100);
      expect(percentages).toContain(0);
    }
  }
  expect(component).toContain("A média resume as notas da campanha e pode esconder uma captação com índice alto. O maior índice é o de uma captação; não representa toda a campanha. As faixas orientam investigação, não confirmam dano.");
});

it("mantém mapa, KPIs e contexto na Home com uma única comparação de campanhas", () => {
  const home = readFileSync("src/modules/results/components/home-results-v2.tsx", "utf8");
  const dashboard = readFileSync("src/modules/results/components/results-index-dashboard.tsx", "utf8");
  const page = readFileSync("src/app/(dashboard)/page.tsx", "utf8");
  expect(home).not.toContain("HomeIndexEvolution");
  expect(home).toContain("<CampaignHydroMap points={[]}");
  expect(home).toContain("<CanonicalKpi");
  expect(home).toContain("<ProjectStatusPanel");
  expect(dashboard).toContain("<CampaignHydroMap");
  expect((page + home).match(/<CampaignDistribution\s*\/>/g)).toHaveLength(1);
});
