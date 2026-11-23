import { expect, it, vi } from "vitest";
import { GET as distribution } from "@/app/api/results/campaign-distribution/route";
import { GET as download } from "@/app/api/results/aggregate-export/route";
vi.mock("@/lib/api-auth", () => ({ requireApiSession: vi.fn(async () => ({ ok: true })) }));
it("reconciles Home, JSON and CSV per campaign, and never exposes a total across campaigns", async () => {
  const req = (suffix = "") => new Request("http://localhost/" + suffix);
  const home = await (await distribution(req())).json();
  const json = await (await download(req("?format=json"))).json();
  const csv = await (await download(req())).text();
  const rows = csv.trim().split(/\r?\n/).slice(1).map(row => row.slice(1,-1).split('","'));
  expect(rows).toHaveLength(12);
  expect(new Set(rows.map(r => r.slice(2,4).join("/"))).size).toBe(12);
  expect(new Set(rows.map(r => r[2]))).toEqual(new Set(["C1", "C2", "C3"]));
  for (const row of rows) {
    const [version, policy, group, series] = row;
    const s = json.grupos[group][series];
    expect([version, policy, row.at(-1)]).toEqual([home.versao, home.politica, home.sourceSha256]);
    expect(row.slice(4,-1)).toEqual([s.observados,s.numericos,s.nulos,s.minimo,s.media,s.maximo,...s.faixas,...s.colunas].map(v=>String(v ?? "")));
    expect(home.campanhas[group][series === "geral08" ? "geral" : series]).toEqual({...s,n:s.numericos});
  }
  expect(Object.keys(json.grupos)).toEqual(["C1", "C2", "C3"]);
  expect(Object.keys(home.campanhas)).toEqual(["C1", "C2", "C3"]);
  expect((await download(req("?group=total"))).status).toBe(422);
  expect((await download(req("?format=json&group=total"))).status).toBe(422);
  expect(json.grupos.C2.geral08).toMatchObject({observados:76,numericos:75,nulos:1});
});
