import { expect, it } from "vitest";
import { results08Aggregate, results08HomeDistribution, validateResults08Aggregate } from "./results-08-aggregate";
import { results08Csv } from "./results-08-export";
import { RESULTS_08_SOURCE_SHA256 } from "./results-08-contract";

it("uses the frozen official aggregate, preserving source means/maxima and five classes", () => {
  const data = results08Aggregate();
  expect(RESULTS_08_SOURCE_SHA256).toBe("5667da69789821f2744812e516282e54fdb73008e8cdb80051801931af455308");
  expect(data.grupos.total.geral08).toMatchObject({ observados: 225, numericos: 224, nulos: 1 });
  expect(data.grupos.total.saude.numericos).toBe(224);
  expect(data.grupos.total.ambiental.numericos).toBe(225);
  expect(data.grupos.total.operacional.numericos).toBe(225);
  expect(Object.keys(data.grupos.total)).toEqual(["geral08", "ambiental", "operacional", "saude"]);
  const csv = results08Csv(data);
  expect(csv.split("\r\n")).toHaveLength(18);
  expect(csv).not.toMatch(/historico07|adjudicadoAnterior|SIA|taxon|latitude|longitude|rank/);
  expect(results08Csv(data, "C1").split("\r\n")).toHaveLength(6);
});
it("rejects extra individual surfaces, source drift, invalid counts and statistics", () => {
  const data = results08Aggregate();
  for (const mutate of [
    (copy: typeof data) => { Object.assign(copy, { politica: "old" }); },
    (copy: typeof data) => { copy.grupos.total.geral08.faixas[0]++; },
    (copy: typeof data) => { copy.grupos.total.geral08.media = Number.NaN; },
    (copy: typeof data) => { Object.assign(copy.grupos.C1, { points: [] }); },
    (copy: typeof data) => { Object.assign(copy, { inventory: [] }); },
    (copy: typeof data) => { copy.grupos.total.geral08.numericos = 225; },
    (copy: typeof data) => { copy.grupos.C2.geral08.colunas[0]++; },
    (copy: typeof data) => { Object.assign(copy, { versao: "0.7" }); },
  ]) { const copy = structuredClone(data); mutate(copy); expect(() => validateResults08Aggregate(copy)).toThrow(); }
});
it("Home and CSV/JSON share the same nullable series without a fallback to 225", () => {
  const data = results08Aggregate(), home = results08HomeDistribution();
  for (const group of ["C1", "C2", "C3"] as const) for (const series of ["geral08", "ambiental", "operacional", "saude"] as const) {
    const item = home.campanhas[group][series === "geral08" ? "geral" : series];
    expect(item).toEqual({ ...data.grupos[group][series], n: data.grupos[group][series].numericos });
  }
  expect(home.campanhas.C2.geral).toMatchObject({ observados: 76, n: 75, numericos: 75, nulos: 1 });
  expect(results08Csv(data)).toContain('"225","224","1"');
});
it("all-null series have no statistics or populated bins; documented zero remains numeric", () => {
  const data = results08Aggregate();
  for (const group of Object.values(data.grupos)) for (const stats of Object.values(group)) {
    stats.nulos = stats.observados; stats.numericos = 0;
    stats.minimo = stats.media = stats.maximo = null; stats.colunas.fill(0); stats.faixas.fill(0);
  }
  expect(validateResults08Aggregate(data).grupos.C2.geral08.media).toBeNull();
  expect(results08Csv(data)).toContain('"0","76","","",""');
  data.grupos.C2.geral08.media = 0;
  expect(() => validateResults08Aggregate(data)).toThrow();
  const real = results08Aggregate();
  expect(real.grupos.total.operacional.minimo).toBe(0);
  expect(real.grupos.total.operacional.nulos).toBe(0);
});
