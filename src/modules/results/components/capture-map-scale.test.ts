import { describe, expect, it } from "vitest";
import { distribution, reading } from "./capture-map-scale";
import type { ResultPoint } from "../types";

function point(value: number | null): ResultPoint {
  const range = { value, lower: value ?? 0, upper: value ?? 0 };
  return {
    overall: range, domains: {environmental: range, operational: range, humanHealth: range},
    bibliographicCoverage: {environmental: 0.8, operational: 0.2, humanHealth: 0.1},
  } as ResultPoint;
}
describe("mapa de captação", () => {
  it("preserva zero, distingue ausência e aplica a faixa roxa a partir de 0,70", () => {
    expect(reading(point(null), "overall").color).toBeNull();
    expect(reading(point(0), "overall").color).not.toBeNull();
    expect(reading(point(0.6999), "overall").color).not.toBe("#762a83");
    expect(reading(point(0.70), "overall")).toMatchObject({color:"#762a83",grade:"C",domain:"humanHealth"});
    expect(reading(point(0.70), "operational").grade).toBe("B");
  });
  it("calcula mediana/P90 no universo medido e mantém empates na mesma faixa", () => {
    const population = distribution([0, 0, 0.5, 1, null]);
    expect(population).toMatchObject({count:4, median:0, max:1, p90:1});
    expect(reading(point(0),"overall",population).label).toBe("Até a mediana");
    expect(reading(point(1),"overall",population).label).toBe("Acima da mediana até P90");
    expect(reading(point(1),"overall",distribution([...Array<number>(9).fill(0), 1])).label).toBe("Acima do P90");
    expect(reading(point(0),"overall",distribution([0,0])).label).toBe("Até a mediana");
  });
});
