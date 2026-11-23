import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));
vi.mock("@/lib/dashboard-data", () => ({ loadDashboardData: vi.fn(async () => ({ campaignPoints: [] })) }));

import { GET as campaignsGET } from "@/app/api/results/capture-index/campaigns/route";
import { GET as indexGET } from "@/app/api/results/capture-index/route";

type Point08 = { campaign: number; sia: string; geral: number | null; ambiental: number | null; operacional: number | null; saude: number | null };
const points = (JSON.parse(readFileSync("src/lib/capture-index/pontos-0.8.json", "utf8")) as { rows: Point08[] }).rows;
const expected = (campaign: number, sia: string) => points.find(point => point.campaign === campaign && point.sia === sia)!;
const index = (query: string) => indexGET(new Request("http://localhost/api/results/capture-index" + query));
const campaigns = (query = "") => campaignsGET(new Request("http://localhost/api/results/capture-index/campaigns" + query));

beforeEach(() => { auth.mockReset(); auth.mockResolvedValue({ ok: true }); });

it("a consulta por campanha + SIA responde a nota 0.8 daquela campanha, não 409", async () => {
  for (const campaign of [1, 2, 3]) {
    const response = await index(`?format=views&campaign=${campaign}&sia=17`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-results-version")).toBe("0.8");
    const body = await response.json(), want = expected(campaign, "17");
    expect(body.version).toBe("IR-CAPTACAO-0.8");
    expect([body.point.campaign, body.point.sia, body.point.state]).toEqual([`C${campaign}`, "17", "estimado"]);
    expect(body.point.exact).toEqual({ general: want.geral, domains: { Ambiental: want.ambiental, Operacional: want.operacional, "Saúde humana": want.saude } });
    // O histórico do ponto lista cada campanha com a sua própria nota; nenhuma é copiada de outra.
    expect(body.history.map((item: { score: number | null }) => item.score)).toEqual([1, 2, 3].map(n => expected(n, "17").geral));
  }
  expect(new Set([1, 2, 3].map(n => expected(n, "17").geral)).size).toBe(3);
});

it("todas as 225 observações saem iguais na consulta, no mapa e na tabela", async () => {
  const maps = (await (await campaigns()).json()).campaigns as { campaignCode: string; points: { siaCode: string; overall: { value: number | null }; domains: Record<string, { value: number | null }> }[] }[];
  let seen = 0;
  for (const campaign of [1, 2, 3]) {
    const rows = (await (await index(`?campaign=${campaign}`)).json()).rows as { sia: string; exact: { general: number | null; domains: Record<string, number | null> } }[];
    const mapped = maps.find(item => item.campaignCode === `C${campaign}`)!.points;
    expect(rows).toHaveLength(points.filter(point => point.campaign === campaign).length);
    for (const row of rows) {
      const want = expected(campaign, row.sia), point = mapped.find(item => item.siaCode === row.sia)!;
      expect([row.exact.general, row.exact.domains.Ambiental, row.exact.domains.Operacional, row.exact.domains["Saúde humana"]]).toEqual([want.geral, want.ambiental, want.operacional, want.saude]);
      expect([point.overall.value, point.domains.environmental.value, point.domains.operational.value, point.domains.humanHealth.value]).toEqual([want.geral, want.ambiental, want.operacional, want.saude]);
      seen++;
    }
  }
  expect(seen).toBe(225);
});

it("zero, sem estimativa, ponto inexistente e erro de consulta continuam distintos", async () => {
  const zero = (await (await index("?format=views&campaign=1&sia=17")).json()).point;
  expect([zero.exact.domains.Operacional, zero.domains[1].score]).toEqual([0, "0,00"]);
  const none = (await (await index("?format=views&campaign=2&sia=257")).json()).point;
  expect([none.exact.general, none.general, none.state, none.domains[2].score]).toEqual([null, "sem estimativa", "sem estimativa", "sem estimativa"]);
  const absent = await index("?format=views&campaign=1&sia=999999");
  expect([absent.status, (await absent.json()).point]).toEqual([200, null]);
  expect((await index("?format=views&campaign=1&sia=abc")).status).toBe(422);
  auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
  expect((await index("?format=views&campaign=1&sia=17")).status).toBe(401);
});

it("não existe consulta 0.7: pedir outra edição é recusado, sem cálculo alternativo", async () => {
  for (const query of ["?version=0.7", "?version=0.7&campaign=1", "?version=0.8&version=0.7", "?format=views&campaign=1&sia=17&version=0.7"]) expect((await index(query)).status).toBe(422);
  for (const query of ["?version=0.7", "?version=0.8&version=0.7", "?edition=0.7"]) expect((await campaigns(query)).status).toBe(422);
  for (const response of [await index("?version=0.8&campaign=1"), await campaigns("?version=0.8"), await campaigns()]) {
    expect(response.status).toBe(200);
    expect(response.headers.get("x-results-version")).toBe("0.8");
  }
  const source = readFileSync("src/lib/capture-index/index.ts", "utf8");
  expect(source).toContain('data.version = "IR-CAPTACAO-0.8"');
  expect(JSON.stringify(await (await index("?campaign=1")).json())).not.toMatch(/0\.7-piloto/);
});
