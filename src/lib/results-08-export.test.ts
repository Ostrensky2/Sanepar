import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { results08Aggregate, results08HomeDistribution, validateResults08Aggregate } from "./results-08-aggregate";
import { results08Csv } from "./results-08-export";
import { RESULTS_08_SOURCE_SHA256 } from "./results-08-contract";

it("uses the frozen official aggregate, preserving source means/maxima and five classes", () => {
  const data = results08Aggregate();
  expect(RESULTS_08_SOURCE_SHA256).toBe("1ac2a5e8ff3b32f8196ffe632d0037ef5690a8401c652da5744a02ba31595a5c");
  expect(data.grupos.total.geral08).toMatchObject({ observados: 225, numericos: 224, nulos: 1 });
  expect(data.grupos.total.saude.numericos).toBe(224);
  expect(data.grupos.total.ambiental.numericos).toBe(225);
  expect(data.grupos.total.operacional.numericos).toBe(225);
  expect(Object.keys(data.grupos.total)).toEqual(["geral08", "ambiental", "operacional", "saude"]);
  const csv = results08Csv(data);
  expect(csv.split("\r\n")).toHaveLength(14); // cabeçalho + 3 campanhas × 4 séries + linha final
  expect(csv).not.toContain('"total"');
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
  expect(results08Csv(data)).toContain('"76","75","1"');
  expect(results08Csv(data)).not.toContain('"225","224","1"'); // não há linha somando as campanhas
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
  // Com o cadastro completo de fichas (24/11) não há mais zero calculado; o mínimo real é positivo.
  expect(real.grupos.total.operacional.minimo).toBeGreaterThan(0);
  expect(real.grupos.total.operacional.nulos).toBe(0);
});

it("reads result numbers from the file itself, never through a bundled JSON module", () => {
  // Um JSON importado como módulo passa pelo empacotador, que pode reescrever o último dígito de um decimal.
  // Em produção isso fazia a conferência de integridade recusar a fonte e a régua do Início ficava indisponível.
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name).replaceAll("\\", "/");
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
  const offenders = files("src").filter(path => /from\s+"[^"]+\.json"|require\("[^"]+\.json"\)/.test(readFileSync(path, "utf8")));
  expect(offenders).toEqual([]);
  expect(readFileSync("src/lib/results-08-aggregate.ts", "utf8")).toContain('readFileSync(join(process.cwd(), "src/lib/results-08-aggregate.json"), "utf8")');
});
